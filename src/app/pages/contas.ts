import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addMeses, diaNoMes, diffDias, hoje, mesAtual, mesFatura, nomeMes } from '../core/datas';
import { MAX_MEDIA, MIN_MEDIA, fixasNaFatura, mediaContas } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, parseValor, soma } from '../core/formato';
import { Cartao, ContaMes, Gasto, Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

interface FormFixa {
  id?: string;
  descricao: string;
  valor: string;
  dia: number;
  categoria_id: string | null;
  inicio: string;
  fim: string;
  ativo: boolean;
  cartao_id: string | null;
  variavel: boolean;
  hist: { id?: string; mes: string; valor: number }[];
  removidos: string[];
}

@Component({
  imports: [FormsModule, BrlPipe, DiaPipe, MesPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Contas</h1>
        <button class="btn sm" (click)="novaFixa()"><app-icon name="add" [size]="16" />Conta fixa</button>
      </div>

      <div class="stats">
        <div class="stat"><div class="l">Total do mês</div><div class="v">{{ total() | brl }}</div></div>
        <div class="stat"><div class="l">A pagar</div><div class="v neg">{{ s.resumo().aPagar | brl }}</div></div>
        <div class="stat"><div class="l">Pago</div><div class="v pos">{{ s.resumo().pago | brl }}</div></div>
        <div class="stat"><div class="l">À vista no mês</div><div class="v">{{ s.resumo().avista | brl }}</div></div>
      </div>

      <section class="card list">
        @for (c of s.contasMes(); track c.tipo + c.ref_id) {
          <button class="row" (click)="abrir(c)">
            <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
            <div class="grow">
              <div class="t">{{ c.descricao }}</div>
              <div class="s">Vence {{ c.vencimento | dia }}{{ c.media ? ' · pela média' : '' }}{{ c.mes !== s.mes() ? ' · paga com o salário deste mês' : '' }}</div>
            </div>
            <div class="dir">
              <span class="v" [class.riscado]="c.pago">{{ c.valor | brl }}</span>
              <span class="badge" [class]="st(c).c">{{ st(c).r }}</span>
            </div>
          </button>
        } @empty {
          <div class="empty"><app-icon class="big" name="calendar_month" [size]="40" />Nenhuma conta neste mês.<br />
            <span class="small">Cadastre contas fixas (aluguel, luz, internet) e as faturas dos cartões aparecem aqui sozinhas.</span>
          </div>
        }
      </section>

      @if (credito().length) {
        <h2>Compras no crédito em {{ s.mes() | mes }}</h2>
        <section class="card list">
          @for (x of credito(); track x.cartao.id) {
            <button class="row" (click)="creditoSel.set(x)">
              <span class="ico" [style.background]="x.cartao.cor + '22'" [style.color]="x.cartao.cor"><app-icon name="credit_card" /></span>
              <div class="grow">
                <div class="t">{{ x.cartao.nome }}</div>
                <div class="s">{{ x.itens.length }} {{ x.itens.length === 1 ? 'compra' : 'compras' }} · {{ x.faturas }}</div>
              </div>
              <span class="v">{{ x.total | brl }}</span>
            </button>
          }
        </section>
      }

      @if (s.recorrencias().length) {
        <h2>Contas fixas cadastradas</h2>
        <section class="card list">
          @for (r of fixas(); track r.id) {
            <button class="row" (click)="editarFixa(r)">
              <span class="ico"><app-icon [name]="s.catMap().get(r.categoria_id ?? '')?.icone ?? 'receipt_long'" /></span>
              <div class="grow">
                <div class="t">{{ r.descricao }}</div>
                <div class="s">{{ cartaoNome(r) ? 'Na fatura do ' + cartaoNome(r) + ', vence dia ' + r.dia : 'Todo dia ' + r.dia }}{{ r.variavel ? ' · variável' : '' }}{{ r.ativo ? '' : ' · inativa' }}{{ r.fim ? ' · até ' + r.fim.slice(5, 7) + '/' + r.fim.slice(0, 4) : '' }}</div>
              </div>
              <span class="v">{{ s.medias().get(r.id) ?? r.valor | brl }}</span>
            </button>
          }
        </section>
      }
    </div>

    <app-sheet [(open)]="detalhe" [titulo]="sel()?.descricao ?? ''">
      @if (sel(); as c) {
        <div class="form">
          <p class="muted">Vencimento {{ c.vencimento | dia }}</p>
          @if (c.tipo === 'fatura') {
            <div class="itens">
              @for (g of itensFatura(); track g.id) {
                <div class="it"><span class="tit">{{ g.descricao }}@if (g.fixa) {<span class="badge info">Conta fixa</span>}</span><span class="num">{{ g.valor | brl }}</span></div>
              }
            </div>
          }
          @if (c.pago) {
            <div class="aviso sucesso"><app-icon class="i" name="check_circle" /><div><div class="t">Paga em {{ c.pago.pago_em | dia }}</div><div class="s">{{ c.pago.valor | brl }}</div></div></div>
            <button class="btn ghost block" (click)="desfazer(c)">Desfazer pagamento</button>
          } @else {
            <div class="grid2">
              <label class="field"><span>Valor pago</span><input inputmode="decimal" [(ngModel)]="valorPago" /></label>
              <label class="field"><span>Pago em</span><input type="date" [(ngModel)]="pagoEm" /></label>
            </div>
            <button class="btn block" (click)="pagar(c)"><app-icon name="check" [size]="18" />Marcar como paga</button>
          }
          @if (c.tipo === 'recorrencia') {
            <button class="btn ghost block" (click)="editarFixaId(c.ref_id)">Editar conta fixa</button>
          }
        </div>
      }
    </app-sheet>

    <app-sheet [open]="!!creditoSel()" (openChange)="creditoSel.set(null)" [titulo]="'Crédito ' + (creditoSel()?.cartao?.nome ?? '')">
      @if (creditoSel(); as x) {
        <div class="form">
          <p class="muted">Compras feitas em {{ s.mes() | mes }} · total {{ x.total | brl }}</p>
          <div class="itens">
            @for (g of x.itens; track g.id) {
              <div class="it">
                <span>{{ g.descricao }}<br /><span class="small muted">{{ g.data | dia }} · fatura {{ g.fatura_mes ?? '' | mes: true }}</span></span>
                <span class="num">{{ g.valor | brl }}</span>
              </div>
            }
          </div>
        </div>
      }
    </app-sheet>

    <app-sheet [(open)]="formAberto" [titulo]="form.id ? 'Editar conta fixa' : 'Nova conta fixa'">
      <form class="form" (ngSubmit)="salvarFixa()">
        <label class="field"><span>Descrição</span><input name="d" [(ngModel)]="form.descricao" placeholder="Ex.: Aluguel, Internet" /></label>
        <label class="field"><span>Pagamento</span>
          <select name="pg" [ngModel]="form.cartao_id" (ngModelChange)="trocarPagamento($event)">
            <option [ngValue]="null">Boleto/Débito/Pix</option>
            @for (c of s.cartoesAtivos(); track c.id) { <option [ngValue]="c.id">Cartão {{ c.nome }}</option> }
          </select>
        </label>
        <label class="check"><input name="var" type="checkbox" [(ngModel)]="form.variavel" />Valor variável (ex.: luz, água)</label>
        <div class="grid2">
          <label class="field"><span>{{ form.variavel ? 'Valor estimado' : 'Valor (previsto)' }}</span><input name="v" inputmode="decimal" [(ngModel)]="form.valor" /></label>
          @if (!form.cartao_id) {
            <label class="field"><span>Dia do vencimento</span><input name="dia" type="number" min="1" max="31" [(ngModel)]="form.dia" /></label>
          }
        </div>
        @if (form.cartao_id) {
          <p class="small muted">Entra em todas as faturas a partir da primeira, vence junto com a fatura e é paga com ela.</p>
        }
        @if (form.variavel) {
          <div class="hist">
            <div class="card-head">
              <h3>Últimas contas</h3>
              @if (mediaForm(); as m) {
                <span class="badge info">Média {{ m | brl }}</span>
              } @else {
                <span class="badge">Faltam {{ minMedia - form.hist.length }} p/ média</span>
              }
            </div>
            <p class="small muted">A previsão usa a média das últimas {{ maxMedia }} contas (mínimo {{ minMedia }}). Contas pagas entram sozinhas; inclua as anteriores aqui.</p>
            @for (h of form.hist; track h.mes) {
              <div class="it">
                <span>{{ h.mes | mes }}</span>
                <span class="tit"><span class="num">{{ h.valor | brl }}</span>
                  <button type="button" class="btn ghost icon sm" (click)="removerHist(h)" aria-label="Remover"><app-icon name="delete" [size]="18" /></button>
                </span>
              </div>
            }
            <div class="add">
              <input name="hm" type="month" [max]="mesAtualCurto" [(ngModel)]="histMes" />
              <input name="hv" inputmode="decimal" placeholder="Valor" [(ngModel)]="histValor" />
              <button type="button" class="btn ghost icon" (click)="adicionarHist()" aria-label="Adicionar conta"><app-icon name="add" /></button>
            </div>
          </div>
        }
        <label class="field"><span>Categoria</span>
          <select name="c" [(ngModel)]="form.categoria_id">
            <option [ngValue]="null">Sem categoria</option>
            @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
        <div class="grid2">
          <label class="field"><span>{{ form.cartao_id ? 'Primeira fatura' : 'A partir de' }}</span><input name="i" type="month" [(ngModel)]="form.inicio" /></label>
          <label class="field"><span>Até (opcional)</span><input name="f" type="month" [(ngModel)]="form.fim" /></label>
        </div>
        <label class="check"><input name="a" type="checkbox" [(ngModel)]="form.ativo" />Ativa</label>
        <button class="btn block" type="submit">Salvar</button>
        @if (form.id) {
          <button class="btn danger block" type="button" (click)="excluirFixa()">Excluir</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .list { padding-top: 4px; padding-bottom: 4px; }
    .dir { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .riscado { color: var(--ink-3); }
    .itens { max-height: 40dvh; overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; padding: 4px 12px; }
    .it { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
    .it:last-child { border-bottom: 0; }
    .hist { border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
    .hist .it { align-items: center; padding: 4px 0; }
    .add { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-top: 4px; }
  `,
})
export default class Contas {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected detalhe = signal(false);
  protected sel = signal<ContaMes | null>(null);
  protected valorPago = '';
  protected pagoEm = hoje();

  protected formAberto = signal(false);
  protected form: FormFixa = this.vazio();
  protected histMes = '';
  protected histValor = '';
  protected minMedia = MIN_MEDIA;
  protected maxMedia = MAX_MEDIA;
  protected mesAtualCurto = mesAtual().slice(0, 7);

  protected total = computed(() => soma(this.s.contasMes(), (c) => c.valor));
  /** Compras no crédito com data no mês, por cartão (a fatura delas pode ser de outro mês) */
  protected credito = computed(() => {
    const doMes = this.s.gastosMes().filter((g) => g.forma === 'cartao');
    return this.s.cartoes()
      .map((cartao) => {
        const itens = doMes.filter((g) => g.cartao_id === cartao.id);
        const meses = [...new Set(itens.map((g) => g.fatura_mes ?? ''))].filter(Boolean).sort();
        return { cartao, itens, total: soma(itens, (g) => g.valor), faturas: 'fatura ' + meses.map((m) => nomeMes(m, true)).join(' e ') };
      })
      .filter((x) => x.itens.length);
  });
  protected creditoSel = signal<{ cartao: Cartao; itens: Gasto[]; total: number } | null>(null);
  protected fixas = computed(() => this.s.recorrencias().filter((r) => r.tipo === 'conta'));
  protected itensFatura = computed(() => {
    const c = this.sel();
    const cartao = this.s.cartoes().find((x) => x.id === c?.ref_id);
    if (c?.tipo !== 'fatura' || !cartao) return [];
    return [
      ...fixasNaFatura(c.mes, cartao, this.s.recorrenciasPrev()),
      ...this.s.gastos()
        .filter((g) => g.cartao_id === c.ref_id && g.fatura_mes === c.mes)
        .map((g) => ({ ...g, fixa: false })),
    ];
  });

  // nova conta no cartão começa na fatura aberta
  trocarPagamento(id: string | null) {
    this.form.cartao_id = id;
    const c = this.s.cartoes().find((x) => x.id === id);
    if (c && !this.form.id) this.form.inicio = mesFatura(hoje(), c.fechamento_dia, c.vencimento_dia).slice(0, 7);
    if (!c && !this.form.id) this.form.inicio = mesAtual().slice(0, 7);
  }

  cartaoNome(r: Recorrencia) {
    return this.s.cartoes().find((c) => c.id === r.cartao_id)?.nome ?? '';
  }

  st(c: ContaMes) {
    if (c.pago) return { c: 'ok', r: 'Paga' };
    const d = diffDias(hoje(), c.vencimento);
    if (d < 0) return { c: 'perigo', r: 'Vencida' };
    if (d === 0) return { c: 'alerta', r: 'Vence hoje' };
    if (d <= 3) return { c: 'alerta', r: `Em ${d} dia(s)` };
    return { c: '', r: 'Em aberto' };
  }

  abrir(c: ContaMes) {
    this.sel.set(c);
    this.valorPago = String(c.valor.toFixed(2)).replace('.', ',');
    this.pagoEm = hoje();
    this.detalhe.set(true);
  }

  async pagar(c: ContaMes) {
    try {
      await this.s.pagar(c.tipo, c.ref_id, parseValor(this.valorPago), this.pagoEm, c.mes);
      this.toast.ok('Conta paga');
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async desfazer(c: ContaMes) {
    try {
      await this.s.desfazerPagamento(c.pago!.id);
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormFixa {
    return {
      descricao: '', valor: '', dia: 10, categoria_id: null, inicio: mesAtual().slice(0, 7), fim: '', ativo: true, cartao_id: null,
      variavel: false, hist: [], removidos: [],
    };
  }

  novaFixa() {
    this.form = this.vazio();
    this.proximoHist();
    this.formAberto.set(true);
  }

  editarFixa(r: Recorrencia) {
    this.form = {
      id: r.id, descricao: r.descricao, valor: String(r.valor).replace('.', ','), dia: r.dia, categoria_id: r.categoria_id,
      inicio: r.inicio.slice(0, 7), fim: r.fim?.slice(0, 7) ?? '', ativo: r.ativo, cartao_id: r.cartao_id ?? null,
      variavel: r.variavel, removidos: [],
      hist: this.s.valoresFixas().filter((v) => v.ref_id === r.id).map(({ id, mes, valor }) => ({ id, mes, valor })),
    };
    this.proximoHist();
    this.formAberto.set(true);
  }

  editarFixaId(id: string) {
    const r = this.s.recorrencias().find((x) => x.id === id);
    this.detalhe.set(false);
    if (r) this.editarFixa(r);
  }

  async salvarFixa() {
    const f = this.form;
    const media = f.variavel ? this.mediaForm() : null;
    if (!f.descricao.trim()) return this.toast.erro('Preencha a descrição');
    if (!parseValor(f.valor) && !media) return this.toast.erro(f.variavel ? `Informe um valor estimado ou ao menos ${MIN_MEDIA} contas` : 'Preencha o valor');
    try {
      const dia = this.s.cartoes().find((c) => c.id === f.cartao_id)?.vencimento_dia ?? (f.dia || 1);
      const id = await this.s.salvar('recorrencias', {
        id: f.id, tipo: 'conta', descricao: f.descricao.trim(), valor: parseValor(f.valor) || media, dia,
        categoria_id: f.categoria_id, inicio: `${f.inicio || mesAtual().slice(0, 7)}-01`, fim: f.fim ? `${f.fim}-01` : null, ativo: f.ativo,
        cartao_id: f.cartao_id, variavel: f.variavel,
      });
      if (f.variavel) {
        const novos = f.hist.filter((h) => !h.id).map((h) => ({ mes: h.mes, valor: h.valor, pago_em: diaNoMes(h.mes, dia) }));
        await this.s.salvarValores(id, novos, f.removidos);
      }
      this.toast.ok('Conta fixa salva');
      this.formAberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  mediaForm() {
    return mediaContas(this.form.hist);
  }

  /** sugere o mês anterior ao mais antigo já informado */
  private proximoHist() {
    const ant = this.form.hist.map((h) => h.mes).sort()[0];
    this.histMes = addMeses(ant ?? mesAtual(), -1).slice(0, 7);
    this.histValor = '';
  }

  adicionarHist() {
    const valor = parseValor(this.histValor);
    if (!this.histMes || !valor) return this.toast.erro('Informe mês e valor');
    const mes = `${this.histMes}-01`;
    const atual = this.form.hist.find((h) => h.mes === mes);
    if (atual?.id) this.form.removidos.push(atual.id);
    this.form.hist = [...this.form.hist.filter((h) => h.mes !== mes), { mes, valor }].sort((a, b) => b.mes.localeCompare(a.mes));
    this.proximoHist();
  }

  removerHist(h: { id?: string; mes: string }) {
    if (h.id) this.form.removidos.push(h.id);
    this.form.hist = this.form.hist.filter((x) => x.mes !== h.mes);
  }

  async excluirFixa() {
    if (!confirm('Excluir esta conta fixa?')) return;
    try {
      await this.s.excluir('recorrencias', this.form.id!);
      this.formAberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

}
