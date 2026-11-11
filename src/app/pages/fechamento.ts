import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addMeses, fimMes, hoje, mesAtual, nomeMes } from '../core/datas';
import { contasDoMes, noMes, orcamentosNoMes, porCategoria, resumoMes, statusOrcamentos } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, moeda, pct, soma } from '../core/formato';
import { Entrada, Gasto, Pagamento } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

const SECOES = ['abertas', 'orcamentos', 'onde', 'cofrinhos'];

/** Balanço de um mês já fechado: o anterior ao atual, ou o mês passado que estiver selecionado */
@Component({
  imports: [RouterLink, BrlPipe, DiaPipe, MesPipe, Icon, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Fechamento</h1>
        <span class="acts"><span class="badge cap">{{ mes() | mes }}</span>
          <button class="btn ghost sm no-print" type="button" (click)="imprimir()" [disabled]="!f()"><app-icon name="picture_as_pdf" [size]="16" />PDF</button></span>
      </div>
      <p class="so-print small">{{ s.carteira()?.nome }} · gerado em {{ hojeTxt }}</p>

      @if (antes()) {
        <div class="card empty"><span class="big">🗓️</span>O primeiro fechamento sai quando {{ s.inicio()! | mes }} terminar.</div>
      } @else if (!f()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      }
      @if (!antes() && f(); as f) {
        <section class="card resumo">
          <div class="rl">
            <div><div class="small muted">Saldo de {{ mes() | mes: true }}</div><b class="grande" [class.neg]="f.r.saldo < 0" [class.pos]="f.r.saldo >= 0">{{ f.r.saldo | brl }}</b></div>
            <div class="small muted dirr">Entradas <b class="pos">{{ f.r.entradas | brl }}</b><br />Saídas <b class="neg">{{ f.r.saidas | brl }}</b></div>
          </div>
          @if (f.r.entradas > 0) {
            <div class="barra" role="progressbar" [attr.aria-valuenow]="gastoPct()" aria-valuemin="0" aria-valuemax="100" title="Saídas sobre as entradas"><span [class.estourou]="f.r.saldo < 0" [style.width.%]="gastoPct()"></span></div>
          }
          @if (f.r.entradas > 0 || f.variacao !== null) {
            <span class="small muted">
              @if (f.r.entradas > 0) { {{ f.r.saldo >= 0 ? 'Sobrou' : 'Faltou' }} {{ f.sobra < 0 ? -f.sobra : f.sobra }}% das entradas }
              @if (f.r.entradas > 0 && f.variacao !== null) { · }
              @if (f.variacao !== null) { consumo <b [class.neg]="f.variacao > 0" [class.pos]="f.variacao <= 0">{{ f.variacao > 0 ? '↑' : '↓' }} {{ f.variacao < 0 ? -f.variacao : f.variacao }}%</b> sobre {{ anterior() | mes: true }} }
            </span>
          }
        </section>

        <section class="card combinado">
          <div class="card-head"><h2 class="tit"><app-icon name="handshake" [size]="20" />Combinado do mês</h2></div>
          @if (estourados().length || f.categorias.length) {
            <p class="pauta small muted">
              @if (estourados().length) { Estourou: <b class="neg">{{ estourados().join(', ') }}</b> }
              @if (estourados().length && f.categorias.length) { · }
              @if (f.categorias.length) { Mais gasto em {{ top3() }} }
            </p>
          }
          @if (combinadoAnterior().length) {
            <div class="lembra small">
              <b>Combinado de {{ anterior() | mes: true }}</b>
              @for (c of combinadoAnterior(); track c.user_id) { <span>"{{ c.decisao }}" <span class="muted">· {{ s.nomeAutor(c.user_id) }}</span></span> }
            </div>
          }
          <div class="membros">
            @for (m of partes(); track m.id) {
              <div class="parte">
                <app-avatar [size]="28" [nome]="m.nome" [foto]="m.foto ?? null" />
                <div class="grow">
                  <span class="small"><b>{{ m.nome }}</b> · @if (m.f) { <span class="pos">✓ fechou</span> } @else { <span class="muted">pendente</span> }</span>
                  @if (m.f?.decisao) { <span class="small dec">{{ m.f!.decisao }}</span> }
                </div>
              </div>
            }
          </div>
          <label class="field no-print"><span>Nossa decisão para o próximo mês</span>
            <textarea rows="2" maxlength="500" placeholder="Ex.: menos delivery e guardar R$ 300" [value]="decisao()" (input)="decisao.set($any($event.target).value)"></textarea>
          </label>
          <button class="btn sm no-print" type="button" [disabled]="salvando()" (click)="fecharParte()">
            <app-icon name="check" [size]="16" />{{ minha() ? 'Atualizar minha parte' : 'Fechar minha parte' }}</button>
        </section>

        <details class="card mais" [open]="aberto('abertas')" (toggle)="lembrar('abertas', $event)">
          <summary><app-icon name="pending_actions" [size]="18" />Contas em aberto<span class="small muted" [class.neg]="f.abertas.length">{{ f.abertas.length ? f.abertas.length + (f.abertas.length > 1 ? ' contas · ' : ' conta · ') + (totalAbertas() | brl) : 'tudo pago' }}</span></summary>
          @for (c of f.abertas; track c.ref_id) {
            <div class="row">
              <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
              <div class="grow"><div class="t">{{ c.descricao }}</div><div class="s">Venceu {{ c.vencimento | dia }}</div></div>
              <span class="v neg">{{ c.valor | brl }}</span>
            </div>
          } @empty {
            <p class="ok"><app-icon name="check_circle" [size]="18" />Todas as contas foram pagas.</p>
          }
          @if (f.abertas.length) {
            <a class="btn ghost sm" routerLink="/contas" (click)="irContas()">Ver contas de {{ mes() | mes: true }}</a>
          }
        </details>

        @if (f.orcamentos.length) {
          <details class="card mais" [open]="aberto('orcamentos')" (toggle)="lembrar('orcamentos', $event)">
            <summary><app-icon name="flag" [size]="18" />Orçamentos<span class="small muted" [class.neg]="estourados().length">{{ estourados().length ? estourados().length + (estourados().length > 1 ? ' estourados' : ' estourado') : 'nenhum estourado' }}</span></summary>
            @for (o of f.orcamentos; track o.orcamento.id) {
              <div class="lin"><span class="tit"><app-icon [name]="o.icone" [size]="16" [style.color]="o.cor" />{{ o.nome }}{{ o.pagamento ? ' · ' + o.pagamento : '' }}</span>
                <span class="badge" [class.perigo]="o.nivel === 'estourado'" [class.alerta]="o.nivel === 'alerta'" [class.ok]="o.nivel === 'ok'">{{ o.pct }}%</span></div>
            }
          </details>
        }

        @if (f.categorias.length) {
          <details class="card mais" [open]="aberto('onde')" (toggle)="lembrar('onde', $event)">
            <summary><app-icon name="donut_large" [size]="18" />Para onde foi<span class="small muted">{{ f.categorias[0].nome }} {{ f.categorias[0].pct }}%</span></summary>
            @for (c of f.categorias; track c.nome) {
              <div class="lin"><span class="tit"><app-icon [name]="c.icone" [size]="16" [style.color]="c.cor" />{{ c.nome }}</span><span class="num">{{ c.total | brl }} · {{ c.pct }}%</span></div>
            }
            @if (f.maiores.length) {
              <h3 class="sub">Maiores gastos</h3>
              @for (g of f.maiores; track g.id) {
                <div class="lin"><span>{{ g.descricao }} <span class="muted small">· {{ g.data | dia }}</span></span><span class="num">{{ g.valor | brl }}</span></div>
              }
            }
          </details>
        }

        <details class="card mais" [open]="aberto('cofrinhos')" (toggle)="lembrar('cofrinhos', $event)">
          <summary><app-icon name="savings" [size]="18" />Cofrinhos<span class="small muted">{{ cofResumo() }}</span></summary>
          @if (guardado() || retirado()) {
            <div class="lin"><span>Guardado no mês</span><b class="num pos">{{ guardado() | brl }}</b></div>
            @if (retirado()) { <div class="lin"><span>Retirado</span><b class="num neg">{{ retirado() | brl }}</b></div> }
          } @else {
            <p class="muted small">Nada foi guardado em {{ mes() | mes: true }}.</p>
          }
          @if (auto(); as a) {
            <p class="small muted"><app-icon name="autorenew" [size]="14" /> {{ a.pct }}% da sobra vai sozinha para {{ a.cofrinho }}.</p>
          }
          @if (podeGuardar()) {
            <div class="sobra">
              <span class="small">Sobrou <b class="pos">{{ f.r.saldo | brl }}</b>. Guardar no cofrinho:</span>
              <div class="linha">
                <select [value]="cofrinho()" (change)="cofrinho.set($any($event.target).value)" aria-label="Cofrinho">
                  @for (c of s.cofrinhos(); track c.id) { <option [value]="c.id">{{ c.nome }}</option> }
                </select>
                <button class="btn sm" type="button" [disabled]="salvando()" (click)="guardarSobra(f.r.saldo)">Guardar</button>
              </div>
            </div>
          }
          <a routerLink="/cofrinhos" class="small">Ver cofrinhos</a>
        </details>
      }
    </div>
  `,
  styles: `
    .acts { display: flex; align-items: center; gap: 8px; }
    .acts app-icon { margin-right: 4px; }
    .sobra { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
    .sobra .linha { display: flex; gap: 8px; }
    .sobra select { flex: 1; }
    .cap { text-transform: capitalize; }
    .barra { height: 8px; border-radius: 99px; background: var(--line); overflow: hidden; }
    .barra span { display: block; height: 100%; background: var(--primary); border-radius: inherit; }
    .barra .estourou { background: var(--danger); }
    details.mais > .btn, details.mais > a.small { margin-top: 8px; display: inline-flex; }
    .lin { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 0; font-size: 0.9rem; border-bottom: 1px solid var(--line); }
    .lin:last-child { border-bottom: 0; }
    .ok { display: flex; align-items: center; gap: 6px; color: var(--ok); font-weight: 600; }
    .sub { margin: 12px 0 2px; font-size: 0.8rem; color: var(--ink-2); }
    .combinado { display: flex; flex-direction: column; gap: 10px; }
    .pauta { margin: 0; }
    .lembra { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 12px; background: var(--card-2); }
    .membros { display: flex; flex-direction: column; gap: 8px; }
    .parte { display: flex; align-items: flex-start; gap: 8px; }
    .parte .grow { display: flex; flex-direction: column; min-width: 0; }
    .dec { color: var(--ink-2); white-space: pre-wrap; overflow-wrap: anywhere; }
    textarea { resize: vertical; }
  `,
})
export default class Fechamento {
  protected hojeTxt = new Date().toLocaleDateString('pt-BR');

  private el: HTMLElement = inject(ElementRef).nativeElement;

  /** "Salvar como PDF" na janela de impressão do navegador, com as seções abertas */
  imprimir() {
    const fechados = Array.from(this.el.querySelectorAll<HTMLDetailsElement>('details.mais:not([open])'));
    this.imprimindo = true;
    fechados.forEach((d) => (d.open = true));
    print();
    fechados.forEach((d) => (d.open = false));
    setTimeout(() => (this.imprimindo = false));
  }
  private imprimindo = false;

  /** Seções recolhidas: estado lembrado em cfp.fechamento.<secao> */
  private abertos = signal(new Set(SECOES.filter((k) => lerLocal('cfp.fechamento.' + k) === '1')));
  protected aberto = (k: string) => this.abertos().has(k);
  lembrar(k: string, e: Event) {
    if (this.imprimindo) return;
    const aberto = (e.target as HTMLDetailsElement).open;
    if (aberto === this.aberto(k)) return;
    this.abertos.update((s) => {
      const n = new Set(s);
      if (aberto) n.add(k);
      else n.delete(k);
      return n;
    });
    gravarLocal('cfp.fechamento.' + k, aberto ? '1' : '0');
  }

  protected s = inject(Store);
  private toast = inject(Toast);

  protected mes = computed(() => (this.s.mes() < mesAtual() ? this.s.mes() : addMeses(mesAtual(), -1)));
  protected anterior = computed(() => addMeses(this.mes(), -1));
  protected antes = computed(() => this.s.antesDoInicio(this.mes()));
  private dados = signal<{ gastos: Gasto[]; entradas: Entrada[]; pagamentos: Pagamento[] } | null>(null);
  private req = 0;

  protected f = computed(() => {
    const d = this.dados();
    if (!d) return null;
    const mes = this.mes();
    const rec = this.s.recorrenciasPrev();
    const contas = contasDoMes(mes, rec, this.s.cartoes(), d.gastos, d.pagamentos, this.s.catMap());
    const r = resumoMes(mes, d.gastos, soma(d.entradas.filter((e) => noMes(e.data, mes)), (e) => e.valor), rec, contas, d.pagamentos);
    const doMes = d.gastos.filter((g) => noMes(g.data, mes));
    const ant = soma(d.gastos.filter((g) => noMes(g.data, this.anterior())), (g) => g.valor);
    return {
      r,
      sobra: pct(r.saldo, r.entradas),
      variacao: ant > 0 && !this.s.antesDoInicio(this.anterior()) ? Math.round((r.consumo / ant - 1) * 100) : null,
      abertas: contas.filter((c) => !c.pago && !c.beneficio_id),
      orcamentos: statusOrcamentos(orcamentosNoMes(this.s.orcamentos(), this.s.orcamentoValores(), mes, this.s.orcamentoFechados()), d.gastos, mes, this.s.catMap(), this.s.cartoes()),
      categorias: porCategoria(doMes, this.s.catMap()).slice(0, 5),
      maiores: [...doMes].sort((a, b) => b.valor - a.valor).slice(0, 3),
    };
  });

  private movs = computed(() => this.s.cofrinhoMovs().filter((m) => noMes(m.data, this.mes())));
  protected cofrinho = signal('');
  protected salvando = signal(false);
  private descSobra = computed(() => `Sobra de ${nomeMes(this.mes())}`);
  protected sobraGuardada = computed(() => this.s.cofrinhoMovs().some((m) => m.descricao === this.descSobra()));

  async guardarSobra(valor: number) {
    const id = this.cofrinho() || this.s.cofrinhos()[0]?.id;
    if (!id) return;
    this.salvando.set(true);
    try {
      await this.s.salvar('cofrinho_movs', { cofrinho_id: id, valor: Math.round(valor * 100) / 100, data: hoje(), descricao: this.descSobra() });
      this.toast.ok('Sobra guardada');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  /** Ritual do fechamento: pauta, combinado anterior e a parte de cada membro */
  protected estourados = computed(() => (this.f()?.orcamentos ?? []).filter((o) => o.nivel === 'estourado').map((o) => o.nome));
  protected top3 = computed(() => (this.f()?.categorias ?? []).slice(0, 3).map((c) => c.nome).join(', '));
  private doMes = computed(() => this.s.fechamentos().filter((x) => x.mes === this.mes()));
  protected combinadoAnterior = computed(() => this.s.fechamentos().filter((x) => x.mes === this.anterior() && x.decisao));
  protected minha = computed(() => this.doMes().find((x) => x.user_id === this.s.eu()) ?? null);
  protected partes = computed(() => this.s.membros().map((m) => ({ id: m.user_id, nome: m.nome, foto: m.foto, f: this.doMes().find((x) => x.user_id === m.user_id) })));
  private minhaDecisao = computed(() => `${this.mes()}|${this.minha()?.decisao ?? ''}`);
  protected decisao = signal('');

  async fecharParte() {
    const eu = this.s.eu();
    if (!eu) return;
    this.salvando.set(true);
    try {
      const decisao = this.decisao().trim().slice(0, 500) || null;
      await q(supabase.from('fechamentos').upsert({ carteira_id: this.s.carteiraId(), mes: this.mes(), user_id: eu, decisao }, { onConflict: 'carteira_id,mes,user_id' }));
      await this.s.recarregar('fechamentos');
      this.toast.ok('Sua parte do fechamento foi registrada');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  /** sobra automática configurada na carteira */
  protected auto = computed(() => {
    const c = this.s.carteira();
    if (!c?.sobra_cofrinho || !c.sobra_pct) return null;
    return { pct: c.sobra_pct, cofrinho: this.s.cofrinhos().find((x) => x.id === c.sobra_cofrinho)?.nome ?? 'o cofrinho' };
  });

  protected gastoPct = computed(() => {
    const r = this.f()?.r;
    return r && r.entradas > 0 ? Math.min(100, pct(r.saidas, r.entradas)) : 0;
  });
  protected totalAbertas = computed(() => soma(this.f()?.abertas ?? [], (c) => c.valor));
  protected podeGuardar = computed(() => (this.f()?.r.saldo ?? 0) > 0 && this.s.cofrinhos().length > 0 && !this.sobraGuardada());
  protected cofResumo = computed(() => {
    if (this.guardado()) return 'guardado ' + moeda(this.guardado());
    return this.podeGuardar() ? 'sobra para guardar' : 'nada guardado';
  });

  protected guardado = computed(() => soma(this.movs().filter((m) => m.valor > 0), (m) => m.valor));
  protected retirado = computed(() => -soma(this.movs().filter((m) => m.valor < 0), (m) => m.valor));

  constructor() {
    effect(() => {
      this.minhaDecisao();
      untracked(() => this.decisao.set(this.minha()?.decisao ?? ''));
    });
    effect(() => {
      const mes = this.mes();
      this.s.mudou();
      if (!this.s.carteiraId()) return;
      untracked(() => this.carregar(addMeses(mes, -1), fimMes(mes)));
    });
  }

  private async carregar(ini: string, fim: string) {
    const r = ++this.req;
    try {
      const d = await this.s.historico(ini, fim);
      if (r === this.req) this.dados.set(d);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  irContas() {
    this.s.mes.set(this.mes());
  }
}

function lerLocal(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function gravarLocal(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento */
  }
}
