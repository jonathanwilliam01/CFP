import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { diffDias, hoje, inicioMes, mesAtual, mesesEntre, nomeMes } from '../core/datas';
import { Recebimento, aporteMensal, fixasNaFatura, noMes, porRecebimento } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, moeda, parseValor, soma } from '../core/formato';
import { Cartao, Cofrinho, ContaMes, Gasto, Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { ContaFixa } from '../shared/conta-fixa';
import { AcaoDeslizar, Deslizar } from '../shared/deslizar';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, MesPipe, Icon, Sheet, ContaFixa, Deslizar],
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

      @if (recebimentos().length) {
        <h2>Por recebimento</h2>
        <div class="stats">
          @for (g of recebimentos(); track g.dia) {
            <button type="button" class="stat rec" [class.on]="diaSel() === g.dia" (click)="diaSel.set(diaSel() === g.dia ? null : g.dia)">
              <div class="l">Dia {{ g.dia }} · {{ g.nome }}</div>
              <div class="lin"><span>Recebe</span><b class="pos">{{ g.recebe | brl }}</b></div>
              <div class="lin"><span>Contas</span><b>{{ g.total | brl }}</b></div>
              <div class="lin"><span>A pagar</span><b class="neg">{{ g.aPagar | brl }}</b></div>
              @if (g.reservado) {
                <div class="lin orc" [title]="nomesReservas(g)"><span><app-icon name="flag" [size]="14" [fill]="true" />Orçamentos</span><b>{{ g.reservado | brl }}</b></div>
                <div class="orcn">{{ nomesReservas(g) }}</div>
              }
              <div class="lin sobra"><span>Sobra</span><b [class.neg]="g.sobra < 0">{{ g.sobra | brl }}</b></div>
            </button>
          }
        </div>
        <p class="small muted">Cada conta fica com o último recebimento até o vencimento. Toque para ver só as contas dele.
          @if (temReserva()) { A <app-icon class="fl" name="flag" [size]="13" [fill]="true" /> mostra o que os orçamentos reservam e ainda não foi gasto: entra na sobra. }</p>
      }

      <section class="card list">
        @for (c of contasLista(); track c.tipo + c.ref_id) {
          <app-deslizar [esquerda]="c.pago ? desfazerAcao : pagarAcao" (esquerdaFeito)="c.pago ? desfazer(c) : pagarRapido(c)">
          <button class="row" (click)="abrir(c)">
            <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
            <div class="grow">
              <div class="t">{{ c.descricao }}</div>
              <div class="s">Vence {{ c.vencimento | dia }}{{ c.media ? ' · pela média' : '' }}{{ c.informado ? ' · valor do mês' : '' }}{{ c.beneficio_id ? ' · ' + beneficioNome(c.beneficio_id) : '' }}{{ c.mes !== s.mes() ? ' · paga com o salário deste mês' : '' }}@if (c.tipo === 'fatura' && reservaCartao().get(c.ref_id); as rv) { · <span class="fl">⚑ +{{ rv | brl }} reservado</span>}</div>
            </div>
            <div class="dir">
              <span class="v" [class.riscado]="c.pago">{{ c.valor | brl }}</span>
              <span class="badge" [class]="st(c).c">{{ st(c).r }}</span>
            </div>
          </button>
          </app-deslizar>
        }
        @for (r of reservasLista(); track r.orcamento_id) {
          <app-deslizar [esquerda]="desconsiderarAcao" (esquerdaFeito)="desconsiderar(r.orcamento_id, r.nome)">
            <a class="row" routerLink="/orcamentos">
              <span class="ico flag"><app-icon name="flag" [fill]="true" /></span>
              <div class="grow"><div class="t">{{ r.nome }}</div><div class="s">Reservado pelo orçamento · ainda não gasto</div></div>
              <div class="dir"><span class="v">{{ r.valor | brl }}</span><span class="badge orcb">Orçamento</span></div>
            </a>
          </app-deslizar>
        }
        @if (!contasLista().length && !reservasLista().length) {
          <div class="empty"><app-icon class="big" name="calendar_month" [size]="40" />Nenhuma conta neste mês.<br />
            <span class="small">Cadastre contas fixas (aluguel, luz, internet) e as faturas dos cartões aparecem aqui sozinhas.</span>
          </div>
        }
      </section>
      @if (contasLista().length || reservasLista().length) {
        <p class="small muted centro">Arraste uma conta para a esquerda para marcar como paga{{ reservasLista().length ? ', ou uma reserva para desconsiderar a sobra do orçamento' : '' }}.</p>
      }

      @if (metas().length) {
        <h2>Cofrinhos do mês</h2>
        <section class="card list">
          @for (m of metas(); track m.c.id) {
            <div class="row">
              <a class="ico" [routerLink]="['/cofrinhos', m.c.id]" [style.background]="m.c.cor + '22'" [style.color]="m.c.cor"><app-icon [name]="m.c.icone" /></a>
              <div class="grow">
                <div class="t">{{ m.c.nome }}</div>
                <div class="s">Guardar {{ m.aporte | brl }} no mês · {{ m.prazo }}</div>
              </div>
              @if (m.falta > 0) {
                <button class="btn sm" type="button" (click)="guardar(m.c, m.falta)">Guardar {{ m.falta | brl }}</button>
              } @else {
                <span class="badge ok">Guardado</span>
              }
            </div>
          }
        </section>
      }

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

      @if (fixas().length || encerradas().length) {
        <div class="card-head">
          <h2>Contas fixas cadastradas</h2>
          @if (encerradas().length) {
            <button class="btn ghost sm" type="button" (click)="verEncerradas.set(!verEncerradas())">
              {{ verEncerradas() ? 'Ocultar encerradas' : 'Encerradas (' + encerradas().length + ')' }}
            </button>
          }
        </div>
        <section class="card list">
          @for (r of verEncerradas() ? encerradas().concat(fixas()) : fixas(); track r.id) {
            <button class="row" (click)="editarFixa(r)">
              <span class="ico"><app-icon [name]="s.catMap().get(r.categoria_id ?? '')?.icone ?? 'receipt_long'" /></span>
              <div class="grow">
                <div class="t">{{ r.descricao }}</div>
                <div class="s">{{ cartaoNome(r) ? 'Na fatura do ' + cartaoNome(r) + ', vence dia ' + r.dia : 'Todo dia ' + r.dia }}{{ r.variavel ? ' · variável' : '' }}{{ r.paga_mes_anterior && !cartaoNome(r) ? ' · salário do mês anterior' : '' }}{{ r.beneficio_id ? ' · ' + beneficioNome(r.beneficio_id) : '' }}{{ r.ativo ? '' : ' · inativa' }}{{ r.inicio > dataHoje ? ' · a partir de ' + r.inicio.slice(5, 7) + '/' + r.inicio.slice(0, 4) : '' }}{{ r.fim ? ' · até ' + r.fim.slice(5, 7) + '/' + r.fim.slice(0, 4) : '' }}</div>
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
            <div class="aviso sucesso"><app-icon class="i" name="check_circle" /><div><div class="t">Paga em {{ c.pago.pago_em! | dia }}</div><div class="s">{{ c.pago.valor | brl }}</div></div></div>
            <button class="btn ghost block" (click)="desfazer(c)">Desfazer pagamento</button>
          } @else {
            <div class="grid2">
              <label class="field"><span>{{ variavel(c) ? 'Valor da conta' : 'Valor pago' }}</span><input inputmode="decimal" [(ngModel)]="valorPago" /></label>
              <label class="field"><span>Pago em</span><input type="date" [(ngModel)]="pagoEm" /></label>
            </div>
            <button class="btn block" (click)="pagar(c)"><app-icon name="check" [size]="18" />Marcar como paga</button>
            @if (variavel(c)) {
              <p class="small muted">Salve o valor que chegou para contar nas saídas deste mês sem pagar agora. Os outros meses continuam pela média.</p>
              <button class="btn ghost block" (click)="pagar(c, true)">Salvar só o valor do mês</button>
              @if (c.informado) {
                <button class="btn ghost block" (click)="voltarMedia(c)">Voltar para a média</button>
              }
            }
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

    <app-sheet [(open)]="formAberto" [titulo]="fixaSel() ? 'Editar conta fixa' : 'Nova conta fixa'">
      @if (formAberto()) {
        <app-conta-fixa [rec]="fixaSel()" (fechar)="formAberto.set(false)" />
      }
    </app-sheet>
  `,
  styles: `
    .list { padding-top: 4px; padding-bottom: 4px; }
    .rec { font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
    .rec.on { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
    .rec .l { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
    .lin { display: flex; justify-content: space-between; gap: 6px; font-size: 0.85rem; }
    .lin span { color: var(--ink-2); }
    .lin b { font-variant-numeric: tabular-nums; }
    .orc span { display: inline-flex; align-items: center; gap: 3px; color: #8b5cf6; font-weight: 700; }
    .orc b { color: #8b5cf6; }
    .orcn { font-size: 0.7rem; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fl { color: #8b5cf6; vertical-align: -2px; }
    .flag { background: #8b5cf622; color: #8b5cf6; }
    .orcb { background: #8b5cf622; color: #8b5cf6; }
    .sobra { border-top: 1px solid var(--line); padding-top: 4px; margin-top: 2px; }
    .dir { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .riscado { color: var(--ink-3); }
    .centro { text-align: center; margin-top: -6px; }
    .itens { max-height: 40dvh; overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; padding: 4px 12px; }
    .it { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
    .it:last-child { border-bottom: 0; }
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
  protected fixaSel = signal<Recorrencia | null>(null);

  protected recebimentos = computed(() => porRecebimento(this.s.mes(), this.s.contasMes(), this.s.recorrencias(), this.s.pagamentos(), this.s.reservasDia()));
  protected nomesReservas = (g: Recebimento) => g.reservas.map((r) => `${r.nome} ${moeda(r.valor)}`).join(', ');
  /** Reserva de orçamento ainda não gasta por cartão (soma na fatura prevista) */
  protected reservaCartao = computed(() => {
    const m = new Map<string, number>();
    for (const o of this.s.orcamentosStatus())
      if (o.reservado && o.orcamento.forma === 'cartao' && o.orcamento.cartao_id) m.set(o.orcamento.cartao_id, (m.get(o.orcamento.cartao_id) ?? 0) + o.reservado);
    return m;
  });
  protected temReserva = computed(() => this.recebimentos().some((g) => g.reservado > 0));
  /** Reservas dos orçamentos na lista: do recebimento escolhido ou do mês todo */
  protected reservasLista = computed(() => {
    const g = this.recebimentos().find((x) => x.dia === this.diaSel());
    if (g) return g.reservas;
    const m = new Map<string, { nome: string; valor: number }>();
    for (const r of this.s.reservasDia()) {
      const a = m.get(r.orcamento_id) ?? { nome: r.nome, valor: 0 };
      a.valor += r.valor;
      m.set(r.orcamento_id, a);
    }
    return [...m.entries()].map(([orcamento_id, a]) => ({ orcamento_id, nome: a.nome, valor: Math.round(a.valor * 100) / 100 }));
  });
  protected diaSel = signal<number | null>(null);
  protected contasLista = computed(() => this.recebimentos().find((g) => g.dia === this.diaSel())?.contas ?? this.s.contasMes());
  protected total = computed(() => soma(this.s.contasMes().filter((c) => !c.beneficio_id), (c) => c.valor));
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
  /** reajuste encerra a anterior: as que já terminaram ficam escondidas */
  private todasFixas = computed(() => this.s.recorrencias().filter((r) => r.tipo === 'conta'));
  protected fixas = computed(() => this.todasFixas().filter((r) => !r.fim || r.fim >= mesAtual()));
  protected encerradas = computed(() => this.todasFixas().filter((r) => r.fim && r.fim < mesAtual()));
  protected verEncerradas = signal(false);
  protected dataHoje = hoje();
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

  protected desconsiderarAcao: AcaoDeslizar = { rotulo: 'Desconsiderar sobra', icone: 'block', cor: '#8b5cf6' };

  async desconsiderar(orcamentoId: string, nome: string) {
    try {
      const id = await this.s.desconsiderarSobra(orcamentoId);
      this.toast.feito(`Sobra de ${nome} fora do saldo`, () => this.s.excluir('orcamento_fechados', id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  protected pagarAcao: AcaoDeslizar = { rotulo: 'Pagar', icone: 'check', cor: 'var(--ok)' };
  protected desfazerAcao: AcaoDeslizar = { rotulo: 'Desfazer', icone: 'undo', cor: 'var(--ink-3)' };

  /** Cofrinhos com prazo: aporte do mês (calculado com o que havia antes dele) e quanto falta guardar */
  protected metas = computed(() => {
    const mes = this.s.mes();
    const l = [];
    for (const c of this.s.cofrinhos()) {
      const movs = this.s.cofrinhoMovs().filter((m) => m.cofrinho_id === c.id);
      const antes = soma(movs.filter((m) => m.data < mes), (m) => m.valor);
      // sem prazo, o plano mensal do cofrinho serve de aporte
      const aporte = aporteMensal(c.meta, antes, c.prazo, mes) ?? (c.frequencia === 'mes' && c.deposito && antes < c.meta ? c.deposito : null);
      if (!aporte) continue;
      const noMesV = soma(movs.filter((m) => noMes(m.data, mes)), (m) => m.valor);
      const meses = c.prazo ? mesesEntre(mes, inicioMes(c.prazo)) + 1 : 0;
      l.push({
        c,
        aporte: Math.round(aporte * 100) / 100,
        falta: Math.max(0, Math.round((aporte - noMesV) * 100) / 100),
        prazo: !c.prazo ? 'plano mensal' : meses > 1 ? `faltam ${meses} meses` : 'último mês da meta',
      });
    }
    return l;
  });

  async guardar(c: Cofrinho, valor: number) {
    try {
      const data = noMes(hoje(), this.s.mes()) ? hoje() : this.s.mes();
      const id = await this.s.salvar('cofrinho_movs', { cofrinho_id: c.id, valor, data, descricao: 'Aporte do mês' });
      this.toast.feito(`${c.nome}: ${moeda(valor)} guardado`, () => this.s.excluir('cofrinho_movs', id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  /** Deslizar: paga com o valor previsto e a data de hoje */
  async pagarRapido(c: ContaMes) {
    try {
      const id = await this.s.pagar(c.tipo, c.ref_id, c.valor, hoje(), c.mes);
      this.toast.feito(`${c.descricao} paga`, () => this.s.desfazerPagamento(id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  beneficioNome(id: string) {
    return this.s.beneficios().find((b) => b.id === id)?.nome ?? 'Benefício';
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

  variavel(c: ContaMes) {
    return c.tipo === 'recorrencia' && !!this.s.recorrencias().find((r) => r.id === c.ref_id)?.variavel;
  }

  async pagar(c: ContaMes, soValor = false) {
    try {
      const valor = parseValor(this.valorPago);
      if (soValor) {
        if (!valor) return this.toast.erro('Informe o valor');
        await this.s.pagar(c.tipo, c.ref_id, valor, null, c.mes);
        this.toast.ok(`Valor de ${c.descricao} salvo`);
      } else {
        const id = await this.s.pagar(c.tipo, c.ref_id, valor, this.pagoEm, c.mes);
        this.toast.feito(`${c.descricao} paga`, () => this.s.desfazerPagamento(id));
      }
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  // variável mantém o valor do mês
  async desfazer(c: ContaMes) {
    try {
      if (this.variavel(c)) await this.s.pagar(c.tipo, c.ref_id, c.pago!.valor, null, c.mes);
      else await this.s.desfazerPagamento(c.pago!.id);
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async voltarMedia(c: ContaMes) {
    try {
      await this.s.desfazerPagamento(c.informado!.id);
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  novaFixa() {
    this.fixaSel.set(null);
    this.formAberto.set(true);
  }

  editarFixa(r: Recorrencia) {
    this.fixaSel.set(r);
    this.formAberto.set(true);
  }

  editarFixaId(id: string) {
    const r = this.s.recorrencias().find((x) => x.id === id);
    this.detalhe.set(false);
    if (r) this.editarFixa(r);
  }
}
