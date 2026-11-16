import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addMeses, fechamentoFatura, hoje, mesAtual, mesFatura } from '../core/datas';
import { BrlPipe, MesPipe, pct, soma } from '../core/formato';
import { curvaFatura, faturaDoMes, fixasNaFatura, opcoesRecebimento } from '../core/financas';
import { Cartao, Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Curvas } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { Moeda } from '../shared/moeda';

type Futuro = { cartao_id: string; valor: number; fatura_mes: string; data: string; parcelamento_id: string | null };

/** Só mostra quando o ritmo muda o valor da fatura aberta */
function projetar(c: Cartao, gastos: Futuro[], rec: Recorrencia[]) {
  const p = curvaFatura(c, gastos, rec, hoje());
  return p.projetada > p.atual + 1 ? p : null;
}

interface FormCartao {
  id?: string;
  nome: string;
  fechamento_dia: number;
  vencimento_dia: number;
  fecha_dias: number | null;
  limite: number | null;
  cor: string;
  padrao: boolean;
  ativo: boolean;
  paga_mes_anterior: boolean;
  final: string;
  recebimento_id: string | null;
}

@Component({
  imports: [Moeda, FormsModule, RouterLink, BrlPipe, MesPipe, Icon, Sheet, Curvas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Cartões</h1>
        <div class="acts">
          <a class="btn ghost sm" routerLink="/importar"><app-icon name="upload_file" [size]="16" />Importar</a>
          <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
        </div>
      </div>

      @if (total(); as t) {
        <section class="card resumo">
          <div class="rl">
            <div><div class="small muted">Faturas abertas</div><b class="grande">{{ t.aberto | brl }}</b></div>
            @if (t.limite) { <div class="small muted dirr">Disponível <b>{{ t.limite - t.usado | brl }}</b><br />de {{ t.limite | brl }}</div> }
          </div>
          @if (t.limite) {
            <div class="bar" [class.alerta]="t.pct >= 80" [class.estourado]="t.pct >= 100"><i [style.width.%]="t.pct > 100 ? 100 : t.pct"></i></div>
          }
        </section>
      }

      <div class="grade-cards">
      @for (c of lista(); track c.cartao.id) {
        <article class="card cc" [class.off]="!c.cartao.ativo">
          <div class="topo" [style.background]="c.cartao.cor">
            <div>
              <b>{{ c.cartao.nome }}</b>
              <small [title]="'Melhor dia de compra: ' + c.fecha + '. Compras no dia do fechamento ou depois vão para a fatura seguinte.' + (c.cartao.fecha_dias ? ' Fecha ' + c.cartao.fecha_dias + ' dias antes do vencimento, então o dia muda conforme o mês.' : '')">Fecha {{ c.fecha }} · vence dia {{ c.cartao.vencimento_dia }}</small>
            </div>
            <div class="acts">
              <button type="button" class="star" [class.on]="c.cartao.padrao" (click)="padrao(c.cartao)"
                [title]="c.cartao.padrao ? 'Cartão padrão: já vem selecionado ao lançar um gasto' : 'Definir como padrão'"
                [attr.aria-label]="c.cartao.padrao ? 'Cartão padrão' : 'Definir como padrão'"><app-icon name="star" [size]="20" [fill]="c.cartao.padrao" /></button>
              <button type="button" class="star" (click)="editar(c.cartao)" aria-label="Editar"><app-icon name="edit" [size]="18" /></button>
            </div>
          </div>

          <div class="corpo">
            <a class="rl ver" routerLink="/fatura" [queryParams]="{ cartao: c.cartao.id, mes: c.aberta }">
              <div><div class="small muted">Fatura aberta · <span class="cap">{{ c.aberta | mes: true }}</span> <app-icon name="chevron_right" [size]="14" /></div>
                <b class="grande num">{{ c.valorAberta | brl }}</b></div>
              @if (c.projecao; as p) {
                <div class="small muted dirr">No ritmo atual<br />fecha em <b class="num">{{ p.projetada | brl }}</b></div>
              }
            </a>

            @if (c.cartao.limite) {
              <div class="bar" [class.alerta]="c.pctLimite >= 80" [class.estourado]="c.pctLimite >= 100" [title]="'Limite usado: ' + (c.usado | brl)">
                <i [style.width.%]="c.pctLimite > 100 ? 100 : c.pctLimite"></i>
              </div>
              <p class="small muted">Disponível <b class="num">{{ c.cartao.limite - c.usado | brl }}</b> de {{ c.cartao.limite | brl }}</p>
            }

            @if (c.faturaRef !== c.aberta) {
              <a class="linha ver small" routerLink="/fatura" [queryParams]="{ cartao: c.cartao.id, mes: c.faturaRef }">
                <span class="muted">Fatura de {{ c.faturaRef | mes }} <app-icon name="chevron_right" [size]="14" /></span>
                <span class="num"><b>{{ c.faturaMes | brl }}</b>@if (c.pagaMes) { <span class="badge ok">Paga</span> }</span>
              </a>
            }

            <details class="mais" [open]="verMais()" (toggle)="lembrarMais($event)">
              <summary><app-icon name="insights" [size]="18" />Próximas faturas<span class="small muted">{{ c.proximasTotal | brl }} em 6 meses</span></summary>
              @if (c.projecao; as p) {
                <app-curvas [series]="[{ nome: 'Real', cor: c.cartao.cor, valores: p.real }, { nome: 'Prevista', cor: 'var(--ink-3)', valores: p.prevista, tracejada: true }]"
                  [rotulos]="rotulosCiclo(p.dias)" [marca]="p.hoje" rotulo="Fatura real e prevista no ciclo" />
              }
              <div class="faturas">
                @for (f of c.proximas; track f.mes) {
                  <a class="fat" [class.zero]="!f.total" routerLink="/fatura" [queryParams]="{ cartao: c.cartao.id, mes: f.mes }">
                    <small>{{ f.mes | mes: true }}</small>
                    <b class="num">{{ f.total | brl }}</b>
                  </a>
                }
              </div>
              <a class="btn ghost sm" routerLink="/fatura" [queryParams]="{ cartao: c.cartao.id, mes: c.ultimaFechada }"><app-icon name="fact_check" [size]="16" />Conferir com o banco</a>
            </details>
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="credit_card" [size]="40" />
          <p>Nenhum cartão cadastrado.</p>
          <p class="small muted">Cadastre o fechamento e o vencimento: cada compra cai sozinha na fatura certa. Nubank, C6, Inter e Itaú fecham um número fixo de dias antes do vencimento.</p>
          <button class="btn sm" type="button" (click)="novo()">Cadastrar cartão</button>
        </div>
      }
      </div>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar cartão' : 'Novo cartão'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="f.nome" placeholder="Ex.: Nubank" required /></label>
        <div class="grid2">
          @if (f.fecha_dias !== null) {
            <label class="field"><span>Dias antes do vencimento</span>
              <input name="dias" type="number" inputmode="numeric" min="1" max="28" [(ngModel)]="f.fecha_dias" /></label>
          } @else {
            <label class="field"><span>Dia do fechamento</span>
              <input name="fech" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="f.fechamento_dia" /></label>
          }
          <label class="field"><span>Dia do vencimento</span>
            <input name="venc" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="f.vencimento_dia" /></label>
        </div>
        <label class="check"><input type="checkbox" name="rel" [ngModel]="f.fecha_dias !== null" (ngModelChange)="f.fecha_dias = $event ? 7 : null" /> Fecha dias antes do vencimento (Nubank: 7)</label>
        <div class="grid2">
          <label class="field"><span>Limite (opcional)</span>
            <input name="limite" moeda="numero" inputmode="numeric" [(ngModel)]="f.limite" /></label>
          <label class="field"><span>Cor</span><input name="cor" type="color" [(ngModel)]="f.cor" /></label>
        </div>
        <label class="field"><span>Final do cartão (opcional)</span>
          <input name="final" inputmode="numeric" maxlength="4" placeholder="1234" autocomplete="off" [(ngModel)]="f.final" />
          <small class="muted">4 últimos dígitos: a notificação do banco ("final 1234") cai neste cartão</small></label>
        @if (recebimentos().length > 1) {
          <label class="field"><span>Fatura paga com</span>
            <select name="rec" [(ngModel)]="f.recebimento_id">
              <option [ngValue]="null">Automático (pelo dia do vencimento)</option>
              @for (r of recebimentos(); track r.id) { <option [ngValue]="r.id">{{ r.nome }}</option> }
            </select>
          </label>
        }
        <label class="check"><input type="checkbox" name="padrao" [(ngModel)]="f.padrao" /> Cartão padrão</label>
        <label class="check"><input type="checkbox" name="ant" [(ngModel)]="f.paga_mes_anterior" /> Pagar com o salário do mês anterior</label>
        <p class="small muted">A fatura que vence no dia {{ f.vencimento_dia }} entra nas contas do mês anterior ao vencimento.</p>
        <label class="check"><input type="checkbox" name="ativo" [(ngModel)]="f.ativo" /> Ativo</label>
        <button class="btn block" type="submit" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir cartão</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .cc { padding: 0; overflow: hidden; }
    .cc.off { opacity: 0.55; }
    .topo { color: #fff; padding: 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .topo b { display: block; font-size: 1.05rem; }
    .topo small { opacity: 0.9; font-size: 0.78rem; }
    .acts { display: flex; gap: 4px; }
    .star { background: rgb(255 255 255 / 0.18); border: 0; color: #fff; border-radius: 10px; width: 36px; height: 36px;
      font-size: 1.2rem; cursor: pointer; display: grid; place-items: center; }
    .star.on { background: rgb(255 255 255 / 0.32); }
    .corpo { padding: 14px; display: flex; flex-direction: column; gap: 8px; }
    .linha { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .linha .num { display: inline-flex; gap: 6px; align-items: center; }
    .corpo p { margin: 0; }
    .rl { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
    .grande { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
    .dirr { text-align: right; }
    .ver { color: inherit; text-decoration: none; }
    .ver app-icon { vertical-align: middle; }
    .mais { border-top: 1px solid var(--line); padding-top: 10px; margin-top: 2px; display: flex; flex-direction: column; gap: 8px; }
    details.mais[open] { display: flex; }
    details.mais[open] > summary { margin-bottom: 4px; }
    .faturas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 4px 0 8px; }
    @media (min-width: 720px) { .faturas { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
    .fat { color: inherit; text-decoration: none; background: var(--card-2); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; }
    .fat small { font-size: 0.7rem; color: var(--ink-2); text-transform: capitalize; font-weight: 600; }
    .fat b { font-size: 0.85rem; }
    .fat.zero { opacity: 0.55; }
    .cap { text-transform: capitalize; }
    .mais .btn { align-self: flex-start; }
    .itens { max-height: 45dvh; overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; padding: 4px 12px; }
    .it { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; cursor: pointer; }
    .it:last-child { border-bottom: 0; }
    .it.sus { color: var(--warn, #d97706); font-weight: 600; }
    .it.ok { opacity: 0.55; }
  `,
})
export default class Cartoes {
  protected s = inject(Store);
  private toast = inject(Toast);

  private futuros = signal<Futuro[]>([]);
  private pagas = signal<{ ref_id: string; mes: string; resto?: number }[]>([]);
  protected aberto = signal(false);
  protected salvando = signal(false);
  f: FormCartao = this.vazio();

  protected recebimentos = computed(() => opcoesRecebimento(this.s.recorrencias(), this.s.mes()));

  protected rotulosCiclo = (dias: string[]) => dias.map((d) => d.slice(8) + '/' + d.slice(5, 7));

  protected lista = computed(() => {
    const atual = mesAtual();
    const meses = Array.from({ length: 6 }, (_, i) => addMeses(atual, i));
    const pagas = this.pagas();
    return this.s.cartoes().map((cartao) => {
      const dele = this.futuros().filter((g) => g.cartao_id === cartao.id);
      const paga = (mes: string) => pagas.some((p) => p.ref_id === cartao.id && p.mes === mes);
      const restos = soma(pagas.filter((p) => p.ref_id === cartao.id && p.resto && !paga(addMeses(p.mes, 1))), (p) => p.resto ?? 0);
      const usado = soma(dele.filter((g) => !paga(g.fatura_mes)), (g) => g.valor) + restos;
      const fatura = this.s.contasMes().find((c) => c.tipo === 'fatura' && c.ref_id === cartao.id);
      const aberta = mesFatura(hoje(), cartao);
      const proximas = meses.map((mes) => ({
        mes,
        total: soma(dele.filter((g) => g.fatura_mes === mes), (g) => g.valor) + soma(fixasNaFatura(mes, cartao, this.s.recorrenciasPrev(), this.s.pagamentos()), (f) => f.valor)
          + (pagas.find((p) => p.ref_id === cartao.id && p.mes === addMeses(mes, -1))?.resto ?? 0),
      }));
      return {
        cartao,
        fecha: fechamentoFatura(mesFatura(hoje(), cartao), cartao).split('-').reverse().slice(0, 2).join('/'),
        usado,
        pctLimite: cartao.limite ? pct(usado, cartao.limite) : 0,
        faturaRef: faturaDoMes(this.s.mes(), cartao),
        faturaMes: fatura?.valor ?? 0,
        pagaMes: !!fatura?.pago,
        projecao: cartao.ativo ? projetar(cartao, dele, this.s.recorrenciasPrev()) : null,
        aberta,
        valorAberta: proximas.find((f) => f.mes === aberta)?.total ?? 0,
        ultimaFechada: addMeses(aberta, -1),
        proximas,
        proximasTotal: soma(proximas, (f) => f.total),
      };
    });
  });

  /** Soma dos cartões ativos: só com mais de um */
  protected total = computed(() => {
    const l = this.lista().filter((c) => c.cartao.ativo);
    if (l.length < 2) return null;
    const comLimite = l.filter((c) => c.cartao.limite);
    const limite = soma(comLimite, (c) => c.cartao.limite ?? 0);
    const usado = soma(comLimite, (c) => c.usado);
    return { aberto: soma(l, (c) => c.valorAberta), limite, usado, pct: limite ? pct(usado, limite) : 0 };
  });

  /** curva, próximas faturas e conferir ficam recolhidos */
  protected verMais = signal(lerLocal('cfp.cartoes.mais') === '1');
  lembrarMais(e: Event) {
    const aberto = (e.target as HTMLDetailsElement).open;
    if (aberto === this.verMais()) return;
    this.verMais.set(aberto);
    gravarLocal('cfp.cartoes.mais', aberto ? '1' : '0');
  }

  constructor() {
    effect(() => {
      this.s.mudou();
      this.s.cartoes();
      if (this.s.carteiraId()) untracked(() => this.carregar());
    });
  }

  private async carregar() {
    const id = this.s.carteiraId()!;
    const atual = mesAtual();
    try {
      const [g, p] = await Promise.all([
        q<Futuro[]>(
          supabase.from('gastos').select('cartao_id, valor, fatura_mes, data, parcelamento_id').eq('carteira_id', id).eq('forma', 'cartao').gte('fatura_mes', atual),
        ),
        q<{ ref_id: string; mes: string; resto?: number }[]>(
          supabase.from('pagamentos').select('*').eq('carteira_id', id).eq('tipo', 'fatura').gte('mes', addMeses(atual, -1)),
        ),
      ]);
      this.futuros.set(g);
      this.pagas.set(p);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormCartao {
    return { nome: '', fechamento_dia: 1, vencimento_dia: 10, fecha_dias: null, limite: null, cor: '#7c3aed', padrao: !this.s.cartoes().length, ativo: true, paga_mes_anterior: false, final: '', recebimento_id: null };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(c: Cartao) {
    this.f = { id: c.id, nome: c.nome, fechamento_dia: c.fechamento_dia, vencimento_dia: c.vencimento_dia, fecha_dias: c.fecha_dias, limite: c.limite, cor: c.cor, padrao: c.padrao, ativo: c.ativo, paga_mes_anterior: c.paga_mes_anterior, final: c.final ?? '', recebimento_id: c.recebimento_id ?? null };
    this.aberto.set(true);
  }

  async padrao(c: Cartao) {
    if (c.padrao) return;
    try {
      await this.s.definirPadrao(c.id);
      this.toast.ok(`${c.nome} agora é o padrão`);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async salvar() {
    const f = this.f;
    if (!f.nome.trim()) return this.toast.erro('Informe o nome');
    if (!(f.fechamento_dia >= 1 && f.fechamento_dia <= 31 && f.vencimento_dia >= 1 && f.vencimento_dia <= 31))
      return this.toast.erro('Dias devem estar entre 1 e 31');
    if (f.fecha_dias !== null && !(f.fecha_dias >= 1 && f.fecha_dias <= 28)) return this.toast.erro('Dias antes do vencimento: entre 1 e 28');
    const final = f.final.replace(/\D/g, '');
    if (final && final.length !== 4) return this.toast.erro('Final do cartão: 4 dígitos');
    this.salvando.set(true);
    try {
      // padrão só pela RPC: o índice único não deixa dois cartões padrão nem por um instante
      const { padrao, recebimento_id, ...dados } = f;
      // só manda com valor (ou para limpar): antes da 050 a coluna não existe
      const antes = this.s.cartoes().find((c) => c.id === f.id)?.recebimento_id;
      Object.assign(dados, recebimento_id || antes ? { recebimento_id } : {});
      const id = await this.s.salvar('cartoes', { ...dados, nome: f.nome.trim(), limite: f.limite || null, final: final || null, ...(padrao ? {} : { padrao: false }) });
      if (padrao) await this.s.definirPadrao(id);
      this.toast.ok('Cartão salvo');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('cartoes', this.f.id, 'Cartão excluído');
    this.aberto.set(false);
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
    /* sem armazenamento: só não lembra */
  }
}
