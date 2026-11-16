import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addDias, addMeses, diaNoMes, fechamentoFatura, hoje, inicioFatura, mesFatura, nomeMes } from '../core/datas';
import { LinhaBanco, conciliar } from '../core/conciliar';
import { ItemExtrato, lerExtrato, palpiteCategoria } from '../core/extrato';
import { BrlPipe, DiaPipe, MesPipe, moeda, parseValor, soma } from '../core/formato';
import { faturaDoMes, fixasNaFatura, porCategoria } from '../core/financas';
import { FaturaConferida, Gasto, Pagamento } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { normalizar, regraPara } from '../core/texto';
import { Icon } from '../shared/icon';
import { Moeda } from '../shared/moeda';
import { Toast } from '../shared/toast';

type Fixa = ReturnType<typeof fixasNaFatura>[number];
const TARIFA = /\biof\b|juros|anuidade|tarifa|encargo|multa/i;

@Component({
  imports: [DatePipe, FormsModule, RouterLink, BrlPipe, DiaPipe, MesPipe, Icon, Moeda],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Fatura</h1></div>

      @if (!s.cartoes().length) {
        <div class="card empty">
          <app-icon class="big" name="credit_card" [size]="40" />
          <p>Cadastre um cartão para ver as faturas.</p>
          <a class="btn sm" routerLink="/cartoes">Cartões</a>
        </div>
      } @else if (c(); as c) {
        @if (s.cartoes().length > 1) {
          <div class="chips">
            @for (x of s.cartoes(); track x.id) {
              <button type="button" class="chip" [class.on]="x.id === c.id" (click)="trocarCartao(x.id)">{{ x.nome }}</button>
            }
          </div>
        }

        <div class="nav card">
          <button type="button" class="btn ghost icon" aria-label="Fatura anterior" (click)="andar(-1)"><app-icon name="chevron_left" /></button>
          <div class="grow">
            <b>Fatura de <span class="cap">{{ mes() | mes }}</span></b>
            <div class="small muted">Compras de {{ dm(periodo().ini) }} a {{ dm(periodo().fim) }} · vence {{ dm(periodo().vence) }}</div>
          </div>
          <span class="selos">
            <span class="badge" [class.ok]="status() === 'Paga'" [class.info]="status() === 'Aberta'">{{ status() }}</span>
            @if (conferida()) { <span class="badge ok" [title]="'Conferida em ' + (conferida()!.conferida_em | date: 'dd/MM')"><app-icon name="fact_check" [size]="12" />Conferida</span> }
          </span>
          <button type="button" class="btn ghost icon" aria-label="Próxima fatura" (click)="andar(1)"><app-icon name="chevron_right" /></button>
        </div>

        <div class="stats">
          <div class="stat"><div class="l">Total no CFP</div><div class="v">{{ total() | brl }}</div></div>
          <div class="stat"><div class="l">{{ gastos().length }} lançamento(s)</div><div class="v">{{ conferidos() }} conferido(s)</div></div>
        </div>

        <section class="card">
          <div class="card-head"><h2>Composição</h2></div>
          @if (anterior()) {
            <div class="lin"><span>Saldo da fatura anterior <span class="badge alerta">Pago em parte</span></span><b class="num">{{ anterior() | brl }}</b></div>
          }
          @for (b of blocos(); track b.k) {
            @if (b.itens.length) {
              <details class="bloco">
                <summary><app-icon [name]="b.i" [size]="18" /><span class="grow">{{ b.r }} <span class="muted small">({{ b.itens.length }})</span></span><b class="num">{{ b.total | brl }}</b></summary>
                @for (g of b.itens; track g.id) {
                  <div class="it">
                    <span class="grow">{{ g.descricao }}@if (g.parcela) { <span class="badge">parcela {{ g.parcela }}</span> }@if (g.informado) { <span class="badge info">valor do mês</span> }<br /><span class="small muted">{{ g.data | dia }}</span></span>
                    <span class="num">{{ g.valor | brl }}</span>
                  </div>
                }
              </details>
            }
          }
          @if (!gastos().length && !fixas().length && !anterior()) { <p class="muted small">Nada nesta fatura.</p> }
          @if (cats().length) {
            <h3 class="small muted">Por categoria</h3>
            @for (x of cats(); track x.id) {
              <div class="cat">
                <span class="grow">{{ x.nome }}</span><span class="num small">{{ x.total | brl }}</span>
                <div class="bar"><i [style.width.%]="x.pct" [style.background]="x.cor"></i></div>
              </div>
            }
          }
        </section>

        <section class="card">
          <div class="card-head"><h2>Conferir com o banco</h2></div>
          <p class="small muted">Exporte a fatura no app do banco (Nubank: Fatura → Exportar, CSV) e abra aqui. O CFP casa linha a linha e mostra o que corrigir.</p>
          <div class="acoes">
            <label class="btn sm"><app-icon name="upload_file" [size]="16" />Abrir CSV ou OFX<input type="file" accept=".csv,.ofx,.txt,text/csv" hidden (change)="abrir($event)" /></label>
            @if (banco()) { <button type="button" class="btn ghost sm" (click)="banco.set(null)">Fechar {{ arquivo() }}</button> }
          </div>

          @if (!banco()) {
            <label class="field"><span>Ou digite o total da fatura no app do banco</span>
              <input moeda inputmode="numeric" placeholder="0,00" [ngModel]="totalDigitado()" (ngModelChange)="totalDigitado.set($event)" /></label>
          }

          @if (outraFatura(); as m) {
            <div class="aviso alerta"><app-icon class="i" name="event_busy" /><div>
              <div class="t">Esse arquivo parece da fatura de {{ m | mes }}</div>
              <div class="s"><button type="button" class="link" (click)="irPara(m)">Conferir com a fatura de {{ m | mes: true }}</button></div>
            </div></div>
          }

          @if (diferenca() !== null) {
            <div class="lin"><span class="muted">No banco</span><b class="num">{{ totalBanco() | brl }}</b></div>
            <div class="lin"><span class="muted">No CFP{{ banco() ? '' : ' (com saldo anterior)' }}</span><b class="num">{{ (banco() ? total() - anterior() : total()) | brl }}</b></div>
            @if (diferenca(); as d) {
              <div class="aviso alerta"><app-icon class="i" [name]="d > 0 ? 'playlist_add' : 'playlist_remove'" /><div>
                <div class="t">{{ d > 0 ? 'Faltam ' + (d | brl) + ' no CFP' : 'O CFP tem ' + (-d | brl) + ' a mais' }}</div>
                <div class="s">{{ banco() ? 'Corrija abaixo. Se sobrar diferença (IOF, juros, arredondamento), lance como ajuste.' : 'Abra o arquivo da fatura para achar a diferença ou lance como ajuste.' }}</div>
                <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="ajuste(d)">Lançar ajuste de {{ d | brl }}</button>
              </div></div>
            } @else {
              <div class="aviso sucesso"><app-icon class="i" name="check_circle" /><div><div class="t">Bate com o banco</div></div></div>
            }
          }

          @if (conferida(); as cf) {
            <div class="aviso sucesso"><app-icon class="i" name="fact_check" /><div>
              <div class="t">Conferida em {{ cf.conferida_em | date: 'dd/MM' }}{{ cf.diferenca ? ' com ' + (cf.diferenca | brl) + ' de diferença' : '' }}</div>
              <div class="s"><button type="button" class="link" [disabled]="ocupado()" (click)="desconferir()">Desfazer</button></div>
            </div></div>
          } @else if (diferenca() !== null) {
            <button type="button" class="btn block" [class.ghost]="!!diferenca()" [disabled]="ocupado()" (click)="marcarConferida()">
              <app-icon name="fact_check" [size]="18" />{{ diferenca() ? 'Marcar como conferida mesmo assim' : 'Marcar fatura como conferida' }}
            </button>
          }

          @if (conc(); as r) {
            @if (r.faltam.length) {
              <div class="grupo">
                <div class="gh"><b>Faltam no CFP ({{ r.faltam.length }})</b><button type="button" class="btn sm" [disabled]="ocupado()" (click)="lancar(r.faltam)">Lançar todos</button></div>
                @for (b of r.faltam; track $index) {
                  <div class="it">
                    <span class="grow">{{ b.descricao }}@if (b.parcela) { <span class="badge">{{ b.parcela }}/{{ b.parcelas }}</span> }<br /><span class="small muted">{{ b.data | dia }} · {{ b.titulo }}</span></span>
                    <span class="num">{{ b.valor | brl }}</span>
                    <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="lancar([b])">Lançar</button>
                  </div>
                }
              </div>
            }
            @if (r.valor.length) {
              <div class="grupo">
                <div class="gh"><b>Valor diferente ({{ r.valor.length }})</b></div>
                @for (x of r.valor; track x.g.id) {
                  <div class="it">
                    <span class="grow">{{ x.g.descricao }}<br /><span class="small muted">CFP {{ x.g.valor | brl }} · banco {{ x.b.valor | brl }}</span></span>
                    <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="usarValor(x.g, x.b)">Usar {{ x.b.valor | brl }}</button>
                  </div>
                }
              </div>
            }
            @if (r.sobram.length || r.fixasSobram.length) {
              <div class="grupo">
                <div class="gh"><b>Só no CFP ({{ r.sobram.length + r.fixasSobram.length }})</b></div>
                <p class="small muted">Lançado duas vezes, na fatura errada ou que o banco ainda não cobrou.</p>
                @for (g of r.sobram; track g.id) {
                  <div class="it">
                    <span class="grow">{{ g.descricao }}@if (g.parcela) { <span class="badge">parcela {{ g.parcela }}</span> }<br /><span class="small muted">{{ g.data | dia }} · {{ g.valor | brl }}</span></span>
                    <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="mover(g, 1)" title="Passa para a fatura seguinte">Próxima</button>
                    <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="excluir(g)">Excluir</button>
                  </div>
                }
                @for (f of r.fixasSobram; track f.id) {
                  <div class="it"><span class="grow">{{ f.descricao }} <span class="badge info">Conta fixa</span><br /><span class="small muted">{{ f.valor | brl }} · não veio nesta fatura</span></span></div>
                }
              </div>
            }
            @if (fixasDiferentes().length) {
              <div class="grupo">
                <div class="gh"><b>Conta fixa com valor diferente</b></div>
                @for (x of fixasDiferentes(); track x.f.id) {
                  <div class="it">
                    <span class="grow">{{ x.f.descricao }}<br /><span class="small muted">CFP {{ x.f.valor | brl }} · banco {{ x.b.valor | brl }}</span></span>
                    <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="valorDoMes(x.f, x.b)" title="Só nesta fatura">Só nesta</button>
                    @if (!x.f.rec.variavel) {
                      <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="reajustar(x.f, x.b)" title="Novo valor desta fatura em diante">Reajustar</button>
                    }
                  </div>
                }
              </div>
            }
            @if (r.ok.length) {
              <details class="grupo bloco">
                <summary><app-icon name="check_circle" [size]="18" /><span class="grow">Batem ({{ r.ok.length + r.fixas.length - fixasDiferentes().length }})</span>
                  @if (naoConferidos().length) {
                    <button type="button" class="btn ghost sm" [disabled]="ocupado()" (click)="marcarConferidos(); $event.preventDefault()">Marcar conferidos</button>
                  }
                </summary>
                @for (x of r.ok; track x.g.id) {
                  <div class="it"><span class="grow">{{ x.g.descricao }}<br /><span class="small muted">banco: {{ x.b.titulo }}</span></span><span class="num">{{ x.g.valor | brl }}</span></div>
                }
              </details>
            }
          }
        </section>
      }
    </div>
  `,
  styles: `
    .nav { display: flex; align-items: center; gap: 8px; padding: 10px; margin-bottom: 12px; }
    .nav .grow { text-align: center; min-width: 0; }
    .selos { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .selos .badge { display: inline-flex; align-items: center; gap: 3px; }
    .btn.block { margin-top: 10px; }
    .grow { flex: 1; min-width: 0; }
    .cap { text-transform: capitalize; }
    .lin { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; }
    .bloco summary { display: flex; align-items: center; gap: 8px; padding: 8px 0; cursor: pointer; list-style: none; }
    .bloco summary::-webkit-details-marker { display: none; }
    .bloco[open] summary { border-bottom: 1px solid var(--line); }
    .it { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
    .it:last-child { border-bottom: 0; }
    .it .grow { overflow-wrap: anywhere; }
    .cat { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin: 6px 0; }
    .cat .bar { grid-column: 1 / -1; }
    h3 { margin: 14px 0 4px; font-weight: 600; }
    .acoes { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
    .grupo { margin-top: 14px; }
    .gh { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
    .aviso .btn { margin-top: 6px; }
  `,
})
export default class FaturaPage {
  protected s = inject(Store);
  private toast = inject(Toast);
  private rota = inject(ActivatedRoute);

  private cartaoId = signal<string | null>(this.rota.snapshot.queryParamMap.get('cartao'));
  private mesParam = signal<string | null>(this.rota.snapshot.queryParamMap.get('mes'));
  protected c = computed(() => {
    const l = this.s.cartoes();
    return l.find((x) => x.id === this.cartaoId()) ?? l.find((x) => x.padrao) ?? l[0] ?? null;
  });
  protected mes = computed(() => {
    const c = this.c();
    return this.mesParam() ?? (c ? faturaDoMes(this.s.mes(), c) : '');
  });

  protected gastos = signal<Gasto[]>([]);
  private pags = signal<Pagamento[]>([]);
  protected banco = signal<LinhaBanco[] | null>(null);
  protected arquivo = signal('');
  protected totalDigitado = signal('');
  protected ocupado = signal(false);
  protected dm = (d: string) => d.slice(8) + '/' + d.slice(5, 7);

  protected periodo = computed(() => {
    const c = this.c()!;
    const m = this.mes();
    return { ini: inicioFatura(m, c), fim: addDias(fechamentoFatura(m, c), -1), vence: diaNoMes(m, c.vencimento_dia) };
  });
  private pagFatura = (mes: string) => this.pags().find((p) => p.tipo === 'fatura' && p.ref_id === this.c()?.id && p.mes === mes);
  protected anterior = computed(() => this.pagFatura(addMeses(this.mes(), -1))?.resto ?? 0);
  protected conferida = computed(() => this.s.conferida(this.c()?.id ?? '', this.mes()) ?? this.conferidaFora());
  /** fora do intervalo que o Store carrega (mês−2 a mês+2) */
  private conferidaFora = signal<FaturaConferida | null>(null);
  protected status = computed(() => {
    if (this.pagFatura(this.mes())?.pago_em) return 'Paga';
    return hoje() < fechamentoFatura(this.mes(), this.c()!) ? 'Aberta' : 'Fechada';
  });
  protected fixas = computed(() => (this.c() ? fixasNaFatura(this.mes(), this.c()!, this.s.recorrenciasPrev(), this.pags()) : []));
  protected total = computed(() => soma(this.gastos(), (g) => g.valor) + soma(this.fixas(), (f) => f.valor) + this.anterior());
  protected conferidos = computed(() => this.gastos().filter((g) => g.conferido).length);

  protected blocos = computed(() => {
    const g = this.gastos();
    const fixas = this.fixas().map((f) => ({ ...f, parcela: null as number | null }));
    type Item = { id: string; descricao: string; valor: number; data: string; parcela: number | null; informado?: boolean };
    const grupo = (k: string, r: string, i: string, itens: Item[]) => ({ k, r, i, itens, total: soma(itens, (x) => x.valor) });
    return [
      grupo('compras', 'Compras', 'shopping_bag', g.filter((x) => x.valor > 0 && !x.parcela)),
      grupo('parcelas', 'Parcelas', 'event_repeat', g.filter((x) => x.valor > 0 && x.parcela)),
      grupo('fixas', 'Contas fixas no cartão', 'repeat', fixas),
      grupo('creditos', 'Estornos e créditos', 'undo', g.filter((x) => x.valor < 0)),
    ];
  });
  protected cats = computed(() => porCategoria(this.gastos(), this.s.catMap()));

  protected conc = computed(() => {
    const b = this.banco();
    return b ? conciliar(b, this.gastos(), this.fixas()) : null;
  });
  protected fixasDiferentes = computed(() => this.conc()?.fixas.filter((x) => x.diferente) ?? []);
  protected naoConferidos = computed(() => this.conc()?.ok.filter((x) => !x.g.conferido).map((x) => x.g.id) ?? []);

  /** CSV: só os itens (o arquivo não traz o saldo anterior); digitado: o total do app, com saldo anterior */
  protected totalBanco = computed(() => {
    const b = this.banco();
    return b ? soma(b, (x) => x.valor) : parseValor(this.totalDigitado());
  });
  protected diferenca = computed(() => {
    const b = this.banco();
    if (!b && !parseValor(this.totalDigitado())) return null;
    const app = b ? this.total() - this.anterior() : this.total();
    const d = Math.round((this.totalBanco() - app) * 100) / 100;
    return Math.abs(d) >= 0.01 ? d : 0;
  });
  /** fatura mais comum entre as compras novas do arquivo (parcela 2+ o Nubank data no fechamento) */
  protected outraFatura = computed(() => {
    const b = this.banco();
    const c = this.c();
    if (!b || !c) return null;
    const n = new Map<string, number>();
    for (const x of b) if ((x.parcela ?? 1) === 1 && x.valor > 0) n.set(mesFatura(x.data, c), (n.get(mesFatura(x.data, c)) ?? 0) + 1);
    const m = [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
    return m && m !== this.mes() ? m : null;
  });

  constructor() {
    effect(() => {
      this.s.mudou();
      const c = this.c();
      const m = this.mes();
      if (c && m) untracked(() => this.carregar());
    });
  }

  private async carregar() {
    const c = this.c()!;
    const m = this.mes();
    try {
      const [g, p] = await Promise.all([
        q<Gasto[]>(supabase.from('gastos').select('*').eq('cartao_id', c.id).eq('fatura_mes', m).order('data')),
        q<Pagamento[]>(supabase.from('pagamentos').select('*').eq('carteira_id', this.s.carteiraId()!).in('tipo', ['fatura', 'recorrencia']).in('mes', [addMeses(m, -1), m])),
      ]);
      if (this.c()?.id !== c.id || this.mes() !== m) return;
      this.gastos.set(g);
      this.pags.set(p);
      const cf = await q<FaturaConferida[]>(supabase.from('faturas_conferidas').select('*').eq('cartao_id', c.id).eq('mes', m)).catch(() => []);
      if (this.c()?.id === c.id && this.mes() === m) this.conferidaFora.set(cf[0] ?? null);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  trocarCartao(id: string) {
    this.cartaoId.set(id);
    this.mesParam.set(null);
    this.banco.set(null);
  }

  andar(n: number) {
    this.irPara(addMeses(this.mes(), n));
    this.banco.set(null);
  }

  irPara(m: string) {
    this.mesParam.set(m);
    this.totalDigitado.set('');
  }

  async abrir(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const { itens } = lerExtrato(await f.text());
      if (!itens.length) throw new Error('Nenhum lançamento no arquivo');
      this.banco.set(itens.map((x) => ({ ...x, descricao: this.regra(x)?.descricao ?? x.descricao })));
      this.arquivo.set(f.name);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private regra(x: Pick<ItemExtrato, 'titulo'> & Partial<Pick<ItemExtrato, 'chave'>>) {
    const regras = this.s.regras();
    return regras.find((r) => r.termo === x.chave) ?? regraPara(x.titulo, regras);
  }

  /** Data que cai nesta fatura: a do banco ou, se for de outro ciclo (parcela, IOF), o início da fatura */
  private dataNaFatura(data: string) {
    const c = this.c()!;
    return mesFatura(data, c) === this.mes() ? data : inicioFatura(this.mes(), c);
  }

  private async rodar(f: () => Promise<unknown>, ok: string) {
    this.ocupado.set(true);
    try {
      await f();
      await Promise.all([this.s.depois('gastos'), this.carregar()]);
      this.toast.ok(ok);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  async lancar(l: LinhaBanco[]) {
    const c = this.c()!;
    const tarifa = l.some((b) => TARIFA.test(b.titulo) && !this.regra(b)) ? await this.categoriaAjuste().catch(() => null) : null;
    const recentes = new Map(this.s.recentes().map((r) => [r.descricao.trim().toLowerCase(), r.categoria_id]));
    const itens = l.map((b) => {
      const r = this.regra({ titulo: b.titulo, chave: (b as ItemExtrato).chave });
      const parcelar = !!(b.parcela && b.parcelas && b.parcela < b.parcelas);
      return {
        descricao: parcelar || !b.parcela ? b.descricao : `${b.descricao} (${b.parcela}/${b.parcelas})`,
        categoria_id: r ? r.categoria_id : TARIFA.test(b.titulo) && tarifa ? tarifa : (recentes.get(b.descricao.toLowerCase()) ?? palpiteCategoria(b.titulo, this.s.catGasto())),
        valor: b.valor,
        data: this.dataNaFatura(b.data),
        forma: 'cartao',
        cartao_id: c.id,
        parcelar,
        parcela: b.parcela,
        parcelas: b.parcelas,
        tags: [],
      };
    });
    return this.rodar(() => q(supabase.rpc('importar_gastos', { p_carteira: this.s.carteiraId(), p_itens: itens })), `${itens.length} lançado(s) na fatura`);
  }

  async ajuste(valor: number) {
    const c = this.c()!;
    const categoria_id = await this.categoriaAjuste().catch(() => null);
    const item = { descricao: 'Ajuste da fatura', categoria_id, valor, data: this.periodo().fim, forma: 'cartao', cartao_id: c.id, parcelar: false, tags: [] };
    return this.rodar(() => q(supabase.rpc('importar_gastos', { p_carteira: this.s.carteiraId(), p_itens: [item] })), `Ajuste de ${moeda(valor)} lançado`);
  }

  usarValor(g: Gasto, b: LinhaBanco) {
    return this.rodar(() => this.s.atualizarGastos([g.id], { valor: b.valor }), 'Valor corrigido');
  }

  /** fatura_mes vem da data (trigger): muda para o início da fatura de destino */
  mover(g: Gasto, n: number) {
    const data = inicioFatura(addMeses(this.mes(), n), this.c()!);
    return this.rodar(() => this.s.atualizarGastos([g.id], { data }), `Passou para a fatura de ${nomeMes(addMeses(this.mes(), n))}`);
  }

  excluir(g: Gasto) {
    this.gastos.update((l) => l.filter((x) => x.id !== g.id));
    this.s.excluirGastos([g.id], `${g.descricao} excluído`);
  }

  /** cadastro cru (recorrenciasPrev troca o valor das variáveis pela média) */
  private recDe(f: Fixa) {
    return this.s.recorrencias().find((x) => x.id === f.rec.id) ?? null;
  }

  reajustar(f: Fixa, b: LinhaBanco) {
    const r = this.recDe(f);
    if (!r) return;
    return this.rodar(() => this.s.reajustar(r, b.valor, this.mes()), `${r.descricao}: novo valor a partir desta fatura`);
  }

  /** Valor só desta fatura: pagamento sem baixa, como "Salvar só o valor do mês" em Contas */
  valorDoMes(f: Fixa, b: LinhaBanco) {
    return this.rodar(() => this.s.pagar('recorrencia', f.rec.id, b.valor, null, this.mes()), `${f.descricao}: ${moeda(b.valor)} nesta fatura`);
  }

  marcarConferida() {
    const d = this.diferenca() ?? 0;
    return this.rodar(() => this.s.conferirFatura(this.c()!.id, this.mes(), d), 'Fatura conferida');
  }

  desconferir() {
    return this.rodar(() => this.s.desconferirFatura(this.c()!.id, this.mes()), 'Conferência desfeita');
  }

  /** "Tarifas e ajustes": IOF, juros, anuidade e o ajuste da fatura; cria se não existe */
  private async categoriaAjuste() {
    const c = this.s.catGasto().find((x) => normalizar(x.nome) === 'tarifas e ajustes');
    if (c) return c.id;
    return this.s.salvar('categorias', { nome: 'Tarifas e ajustes', tipo: 'gasto', icone: 'request_quote', cor: '#64748b', ordem: this.s.catGasto().length });
  }

  marcarConferidos() {
    const ids = this.naoConferidos();
    return this.rodar(() => this.s.atualizarGastos(ids, { conferido: true }), `${ids.length} conferido(s)`);
  }
}
