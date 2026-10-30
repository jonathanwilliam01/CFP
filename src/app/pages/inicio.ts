import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addMeses, diffDias, hoje, mesAtual } from '../core/datas';
import { Recebimento, creditoBeneficios, noMes, parcelasDoMes, porCategoria, porRecebimento, ritmoMes, saldoBeneficio, saldoDiario, variacaoGastos } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, pct, soma } from '../core/formato';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Avatar } from '../shared/avatar';
import { Bloco } from '../shared/bloco';
import { Donut, Linha } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';

@Component({
  imports: [RouterLink, BrlPipe, DiaPipe, MesPipe, Donut, Linha, Icon, Avatar, Bloco],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <section class="saldo">
        <div class="topo">
          <small>Saldo previsto do mês</small>
          @if (temBenef()) {
            <button type="button" class="modo" (click)="alternarBenef()">{{ comBenef() ? 'Com benefícios' : 'Só dinheiro' }}<span aria-hidden="true">⇄</span></button>
          }
        </div>
        <strong class="num" [class.sobe]="saldo().saldo >= 0" [class.desce]="saldo().saldo < 0">{{ saldo().saldo | brl }}</strong>
        <div class="es">
          <a routerLink="/entradas"><span><i class="sobe">↑</i> Entradas</span><b class="num sobe">{{ saldo().entradas | brl }}</b></a>
          <a routerLink="/contas"><span><i class="desce">↓</i> Saídas</span><b class="num desce">{{ saldo().saidas | brl }}</b></a>
        </div>
        @if (r().reservado > 0) {
          <a class="compara reserva" routerLink="/orcamentos">Saídas incluem {{ r().reservado | brl }} reservados em orçamentos</a>
        }
        @if (variacao(); as v) {
          <span class="compara">Gastos lançados <b [class.sobe]="v < 0" [class.desce]="v > 0">{{ v > 0 ? '↑' : '↓' }} {{ v > 0 ? v : -v }}%</b> em relação a {{ mesAnterior() | mes }}{{ noMesAtual() ? ' (até hoje)' : '' }}</span>
        }
        @if (r().saidas > 0) {
          <div class="pago">
            <div class="bar"><i [style.width.%]="pctPago()"></i></div>
            <span>{{ r().pago | brl }} pago · {{ r().aPagar | brl }} a pagar</span>
          </div>
        }
      </section>

      @if (mostrarFechamento()) {
        <div class="aviso info fech">
          <app-icon class="i" name="task_alt" />
          <div class="grow"><div class="t">Fechamento de {{ mesAnterior() | mes }}</div><div class="s">Veja como o mês terminou: saldo, contas em aberto e orçamentos.</div>
            <div class="bts"><a class="btn sm" routerLink="/fechamento" (click)="dispensarFechamento()">Ver fechamento</a>
              <button class="btn ghost sm" type="button" (click)="dispensarFechamento()">Agora não</button></div>
          </div>
        </div>
      }

      @if (avisos().length) {
        <section class="avisos" bloco="avisos">
          @for (a of avisos(); track a.id) {
            <a class="aviso" [class]="a.nivel" [routerLink]="a.link ?? '/notificacoes'">
              <app-icon class="i" [name]="a.icone" />
              <div><div class="t">{{ a.titulo }}</div><div class="s">{{ a.texto }}</div></div>
            </a>
          }
          @if (insights.avisos().length > 3) {
            <a routerLink="/notificacoes" class="small">Ver todos os {{ insights.avisos().length }} avisos →</a>
          }
        </section>
      }

      @if (r().entradas > 0 || r().saidas > 0) {
        <section class="card" bloco="diaadia">
          <div class="card-head"><h2>Saldo dia a dia</h2><a routerLink="/calendario" class="small">Calendário</a></div>
          <app-linha [valores]="curva()" [marca]="idxHoje()" />
          <p class="small muted cv">Menor saldo <b class="num" [class.neg]="menor().saldo < 0">{{ menor().saldo | brl }}</b> no dia {{ menor().dia }}</p>
        </section>
      }

      @if (recebimentos().length) {
        <section class="card" bloco="recebimento">
          <div class="card-head"><h2>Por recebimento</h2><a routerLink="/contas" class="small">Contas</a></div>
          <div class="recs">
            @for (g of recebimentos(); track g.dia) {
              <a class="rec" routerLink="/contas">
                <span class="l"><b>Dia {{ g.dia }}</b><span class="nm">{{ g.nome }}</span></span>
                <span class="lin"><span>Recebe</span><b class="num pos">{{ g.recebe | brl }}</b></span>
                <span class="lin"><span>Contas</span><b class="num">{{ g.total | brl }}</b></span>
                <span class="lin"><span>A pagar</span><b class="num neg">{{ g.aPagar | brl }}</b></span>
                @if (g.reservado) {
                  <span class="lin orc" [title]="nomesReservas(g)"><span><app-icon name="flag" [size]="14" [fill]="true" />Orçamentos</span><b class="num">{{ g.reservado | brl }}</b></span>
                  <span class="orcn">{{ nomesReservas(g) }}</span>
                }
                <span class="lin sobra"><span>Sobra</span><b class="num" [class.neg]="g.sobra < 0">{{ g.sobra | brl }}</b></span>
              </a>
            }
          </div>
        </section>
      }

      @if (comp(); as c) {
        <section class="card" bloco="comprometida">
          <div class="card-head"><h2>Renda comprometida</h2><b class="num" [class.neg]="c.preso >= 70">{{ c.preso }}%</b></div>
          <div class="comp" role="img" [attr.aria-label]="c.preso + '% das entradas em contas fixas e parcelas'">
            @for (p of c.partes; track p.nome) { @if (p.pct > 0) { <i [style.flex-grow]="p.pct" [style.background]="p.cor" [title]="p.nome + ': ' + (p.valor | brl)"></i> } }
          </div>
          <div class="leg">
            @for (p of c.partes; track p.nome) { @if (p.valor > 0) { <span><i [style.background]="p.cor"></i>{{ p.nome }} <b class="num">{{ p.pct }}%</b></span> } }
          </div>
          <p class="small muted">{{ c.preso }}% das entradas já estão presos em contas fixas e parcelas.</p>
        </section>
      }

      @if (pessoas().length > 1) {
        <section class="card" bloco="pessoas">
          <div class="card-head"><h2>Quem gastou o quê</h2><span class="small muted">{{ s.mes() | mes: true }}</span></div>
          @for (p of pessoas(); track p.id) {
            <div class="pes">
              <app-avatar [size]="32" [foto]="p.foto" [nome]="p.nome" />
              <div class="grow">
                <div class="l"><b>{{ p.nome }}</b><span class="num">{{ p.total | brl }}</span></div>
                <div class="bar"><i [style.width.%]="p.pct"></i></div>
              </div>
            </div>
          }
          @if (diferenca(); as d) { <p class="small muted">{{ d.nome }} gastou {{ d.valor | brl }} a mais no mês.</p> }
        </section>
      }

      <section class="card" bloco="onde">
        <div class="card-head"><h2>Onde está indo o dinheiro</h2><a routerLink="/relatorios" class="small">Relatórios</a></div>
        @if (cats().length) {
          <div class="onde">
            <app-donut [fatias]="fatias()" [size]="132" rotulo="Gasto no mês" />
            <div class="list top">
              @for (c of cats().slice(0, 5); track c.nome) {
                <div class="cat">
                  <app-icon [name]="c.icone" [style.color]="c.cor" />
                  <div class="grow">
                    <div class="l"><b>{{ c.nome }}</b><span class="num">{{ c.total | brl }}</span></div>
                    <div class="bar"><i [style.width.%]="c.pct" [style.background]="c.cor"></i></div>
                  </div>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="empty"><app-icon class="big" name="receipt_long" [size]="40" />Nenhum gasto neste mês ainda.
            <button class="btn sm" (click)="lancar.novo('gasto')">Lançar primeiro gasto</button>
          </div>
        }
      </section>

      @if (proximas().length) {
        <section class="card" bloco="proximas">
          <div class="card-head"><h2>Próximas contas</h2><a routerLink="/contas" class="small">Ver todas</a></div>
          <div class="list">
            @for (c of proximas(); track c.ref_id) {
              <a class="row" routerLink="/contas">
                <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
                <div class="grow"><div class="t">{{ c.descricao }}</div><div class="s">{{ c.vencimento | dia }}</div></div>
                <span class="badge" [class]="status(c.vencimento)">{{ rotulo(c.vencimento) }}</span>
                <span class="v">{{ c.valor | brl }}</span>
              </a>
            }
          </div>
        </section>
      }

      @if (s.orcamentosStatus().length) {
        <section class="card" bloco="orcamentos">
          <div class="card-head"><h2>Orçamentos</h2><a routerLink="/orcamentos" class="small">Ver</a></div>
          @if (ritmo() !== null) { <p class="small muted">A marca mostra onde o gasto deveria estar hoje ({{ ritmo() }}% do mês).</p> }
          @for (o of s.orcamentosStatus().slice(0, 4); track o.orcamento.id) {
            <div class="orc">
              <div class="l"><span class="tit"><app-icon [name]="o.icone" [size]="16" [style.color]="o.cor" />{{ o.nome }}{{ o.pagamento ? ' · ' + o.pagamento : '' }}</span><span class="num">{{ o.gasto | brl }} / {{ o.orcamento.valor | brl }}</span></div>
              <div class="ritmo"><div class="bar" [class]="o.nivel"><i [style.width.%]="o.pct > 100 ? 100 : o.pct"></i></div>
                @if (ritmo() !== null) { <i class="marca" [style.left.%]="ritmo()"></i> }</div>
            </div>
          }
        </section>
      }

      @if (beneficios().length || s.cofrinhos().length) {
        <section class="mini" bloco="saldos">
          @for (b of beneficios(); track b.id) {
            <a class="stat" routerLink="/beneficios">
              <div class="l"><span class="li"><app-icon name="restaurant" [size]="16" />{{ b.nome }}</span></div>
              <div class="v" [class.neg]="b.saldo < 0">{{ b.saldo | brl }}</div>
            </a>
          }
          @for (c of cofrinhos(); track c.id) {
            <a class="stat" [routerLink]="['/cofrinhos', c.id]">
              <div class="l"><span class="li"><app-icon [name]="c.icone" [size]="16" [style.color]="c.cor" />{{ c.nome }}</span></div>
              <div class="v">{{ c.guardado | brl }}</div>
              @if (c.meta > 0) {
                <div class="bar"><i [style.width.%]="c.pct > 100 ? 100 : c.pct" [style.background]="c.cor"></i></div>
              }
            </a>
          }
        </section>
      }

      <section class="card" bloco="ultimos">
        <div class="card-head"><h2>Últimos gastos</h2><a routerLink="/gastos" class="small">Ver todos</a></div>
        <div class="list">
          @for (g of s.gastosMes().slice(0, 5); track g.id) {
            <button class="row" (click)="lancar.editarGasto(g)">
              <span class="ico"><app-icon [name]="s.catMap().get(g.categoria_id ?? '')?.icone ?? 'help'" /></span>
              <div class="grow"><div class="t">{{ g.descricao }}</div><div class="s">{{ g.data | dia }}</div></div>
              <span class="v">{{ g.valor | brl }}</span>
            </button>
          } @empty {
            <p class="muted small">Nada por aqui.</p>
          }
        </div>
      </section>

      @if (insights.dicas()[0]; as d) {
        <a class="card dica" routerLink="/resumo" bloco="dica">
          <app-icon class="i" [name]="d.icone" [size]="28" />
          <div><b>{{ d.titulo }}</b><p class="small muted">{{ d.texto }}</p></div>
        </a>
      }
    </div>
  `,
  styles: `
    .saldo {
      background: var(--hero);
      color: #fff; border-radius: 22px; padding: 18px; display: flex; flex-direction: column; gap: 4px;
      box-shadow: var(--hero-shadow);
    }
    .saldo small { opacity: 0.8; font-weight: 600; }
    .topo { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .modo {
      border: 0; background: rgb(255 255 255 / 0.12); color: #fff; font: inherit; font-size: 0.72rem; font-weight: 700;
      padding: 4px 10px; border-radius: 999px; cursor: pointer; display: inline-flex; gap: 6px;
    }
    .reserva { color: #fff; opacity: 0.8; text-decoration: underline; text-underline-offset: 2px; }
    .compara { font-size: 0.78rem; opacity: 0.9; margin-top: 6px; }
    .saldo strong { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.03em; }
    .es { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
    .es a { background: rgb(255 255 255 / 0.12); border-radius: 14px; padding: 10px 12px; color: #fff; display: flex; flex-direction: column; }
    .es span { font-size: 0.75rem; opacity: 0.85; font-weight: 600; }
    .es b { font-size: 1.05rem; }
    .es i { font-style: normal; font-weight: 800; }
    /* fundo do saldo é neutro: verde e vermelho fixos, independem da cor principal */
    .sobe { color: #4ade80; }
    .desce { color: #ff7a7a; }
    .pago { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 0.78rem; opacity: 0.9; }
    .pago .bar { background: rgb(255 255 255 / 0.2); }
    .pago .bar i { background: #fff; }
    [bloco] .card-head h2 { cursor: pointer; display: inline-flex; align-items: center; gap: 2px; }
    [bloco] .card-head h2::after { content: 'expand_less'; font-family: 'Material Symbols Rounded'; font-feature-settings: 'liga'; font-weight: 400; font-size: 20px; line-height: 1; color: var(--ink-3); }
    .fechado .card-head h2::after { content: 'expand_more'; }
    .fechado > :not(.card-head) { display: none; }
    .fechado .card-head { margin-bottom: 0; }
    .avisos { display: flex; flex-direction: column; gap: 8px; }
    .onde { display: flex; gap: 16px; align-items: center; }
    .top { flex: 1; gap: 10px; min-width: 0; }
    .cat { display: flex; gap: 8px; align-items: center; }
    .cat .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .l { display: flex; justify-content: space-between; gap: 6px; font-size: 0.85rem; }
    .l b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cat .bar { height: 5px; }
    .orc { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }
    .mini { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .mini .stat { color: var(--ink); display: flex; flex-direction: column; gap: 4px; }
    .mini .bar { height: 5px; margin-top: 2px; }
    .fech .grow { flex: 1; }
    .bts { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .cv { margin-top: 8px; }
    .comp { display: flex; height: 14px; border-radius: 999px; overflow: hidden; background: var(--card-2); gap: 2px; }
    .comp i { display: block; min-width: 3px; }
    .leg { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 10px 0 6px; font-size: 0.78rem; color: var(--ink-2); }
    .leg span { display: inline-flex; align-items: center; gap: 5px; }
    .leg i { width: 10px; height: 10px; border-radius: 3px; }
    .recs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .rec { display: flex; flex-direction: column; gap: 3px; color: var(--ink); background: var(--card-2); border-radius: 12px; padding: 10px 12px; }
    .rec .l { display: flex; flex-direction: column; margin-bottom: 2px; }
    .rec .nm { font-size: 0.75rem; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lin { display: flex; justify-content: space-between; gap: 6px; font-size: 0.82rem; }
    .lin > span { color: var(--ink-2); }
    .orc > span { display: inline-flex; align-items: center; gap: 3px; color: #8b5cf6; font-weight: 700; }
    .orc b { color: #8b5cf6; }
    .orcn { font-size: 0.7rem; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sobra { border-top: 1px solid var(--line); padding-top: 4px; margin-top: 2px; }
    .pes { display: flex; gap: 10px; align-items: center; padding: 6px 0; }
    .pes .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .pes .bar { height: 6px; }
    .dica { display: flex; gap: 12px; color: var(--ink); align-items: flex-start; }
    .dica .i { color: var(--primary); }
    .li { display: inline-flex; align-items: center; gap: 4px; }
    @media (max-width: 380px) { .onde { flex-direction: column; } .top { width: 100%; } }
  `,
})
export default class Inicio {
  protected s = inject(Store);
  protected insights = inject(Insights);
  protected lancar = inject(Lancar);

  protected r = this.s.resumo;
  private credito = computed(() => creditoBeneficios(this.s.beneficios(), this.s.mes()));
  protected temBenef = computed(() => this.credito() > 0 || this.r().beneficios > 0);
  protected comBenef = signal(localStorage.getItem('cfp.saldo') === 'beneficios');
  /** Saldo do card: só dinheiro ou somando benefícios (como no resumo mensal) */
  protected saldo = computed(() => {
    const r = this.r();
    if (!this.comBenef() || !this.temBenef()) return r;
    const entradas = r.entradas + this.credito();
    const saidas = r.saidas + r.beneficios;
    return { entradas, saidas, saldo: entradas - saidas };
  });
  protected noMesAtual = computed(() => this.s.mes() === mesAtual());
  protected mesAnterior = computed(() => addMeses(this.s.mes(), -1));
  protected variacao = computed(() => (this.s.antesDoInicio(this.mesAnterior()) ? null : variacaoGastos(this.s.gastos(), this.s.mes(), hoje())));
  protected pctPago = computed(() => pct(this.r().pago, this.r().pago + this.r().aPagar));
  protected avisos = computed(() => this.insights.avisos().filter((a) => a.nivel === 'perigo' || a.nivel === 'alerta').slice(0, 3));
  protected cats = computed(() => porCategoria(this.s.gastosMes(), this.s.catMap()));
  protected fatias = computed(() => this.cats().map((c) => ({ nome: c.nome, valor: c.total, cor: c.cor })));
  protected proximas = computed(() => this.s.contasMes().filter((c) => !c.pago).slice(0, 5));
  protected beneficios = computed(() =>
    this.s.beneficiosAtivos().map((b) => ({ ...b, saldo: saldoBeneficio(b, this.s.usoBeneficios(), this.s.mes(), this.s.cobrancasBeneficio()).saldo })),
  );
  protected cofrinhos = computed(() =>
    this.s.cofrinhos().slice(0, 4).map((c) => {
      const guardado = this.s.guardadoPorCofrinho().get(c.id) ?? 0;
      return { ...c, guardado, pct: pct(guardado, c.meta) };
    }),
  );

  private curvaDias = computed(() =>
    saldoDiario(this.s.mes(), this.s.gastos(), this.s.entradasMes(), this.s.recorrenciasPrev(), this.s.contasMes(), this.s.pagamentos(),
      this.s.reservasDia()),
  );
  protected curva = computed(() => this.curvaDias().map((d) => d.saldo));
  protected menor = computed(() => this.curvaDias().reduce((m, d) => (d.saldo < m.saldo ? d : m), this.curvaDias()[0]));
  protected idxHoje = computed(() => (noMes(hoje(), this.s.mes()) ? Number(hoje().slice(8)) - 1 : null));
  protected recebimentos = computed(() => porRecebimento(this.s.mes(), this.s.contasMes(), this.s.recorrencias(), this.s.pagamentos(), this.s.reservasDia()));
  protected nomesReservas = (g: Recebimento) => g.reservas.map((r) => r.nome).join(', ');
  protected ritmo = computed(() => ritmoMes(this.s.mes(), hoje()));

  /** Fatias das entradas: fixas e parcelas (presas), resto do cartão, à vista e o que sobra */
  protected comp = computed(() => {
    const r = this.r();
    if (r.entradas <= 0) return null;
    const p = parcelasDoMes(this.s.mes(), this.s.gastos(), this.s.cartoes());
    const partes = [
      { nome: 'Contas fixas', valor: r.contasFixas, cor: '#6366f1' },
      { nome: 'Parcelas', valor: p.cartao + p.debito, cor: '#db2777' },
      { nome: 'Cartão', valor: Math.max(0, r.faturas - p.cartao), cor: '#f59e0b' },
      { nome: 'À vista', valor: Math.max(0, r.avista - p.debito), cor: '#0ea5e9' },
      { nome: 'Reservado', valor: r.reservado, cor: '#8b5cf6' },
      { nome: 'Sobra', valor: Math.max(0, r.saldo), cor: 'var(--ok)' },
    ];
    const base = Math.max(r.entradas, r.saidas);
    return { preso: pct(partes[0].valor + partes[1].valor, r.entradas), partes: partes.map((x) => ({ ...x, pct: pct(x.valor, base) })) };
  });

  /** Gasto lançado por membro no mês (inclui benefícios e cartão) */
  protected pessoas = computed(() => {
    const gastos = this.s.gastosMes();
    const l = this.s.membros().map((m) => ({ id: m.user_id, nome: m.nome, foto: m.foto, total: soma(gastos.filter((g) => g.criado_por === m.user_id), (g) => g.valor) }));
    const max = Math.max(1, ...l.map((x) => x.total));
    return l.map((x) => ({ ...x, pct: pct(x.total, max) })).sort((a, b) => b.total - a.total);
  });
  protected diferenca = computed(() => {
    const [a, b] = this.pessoas();
    return a && b && a.total - b.total >= 1 ? { nome: a.nome, valor: a.total - b.total } : null;
  });

  private fechVisto = signal(localStorage.getItem('cfp.fechamento'));
  protected mostrarFechamento = computed(
    () => this.noMesAtual() && Number(hoje().slice(8)) <= 7 && this.fechVisto() !== this.mesAnterior() && !this.s.carregando() && !this.s.antesDoInicio(this.mesAnterior()),
  );

  dispensarFechamento() {
    localStorage.setItem('cfp.fechamento', this.mesAnterior());
    this.fechVisto.set(this.mesAnterior());
  }

  alternarBenef() {
    this.comBenef.update((v) => !v);
    localStorage.setItem('cfp.saldo', this.comBenef() ? 'beneficios' : '');
  }

  status(venc: string) {
    const d = diffDias(hoje(), venc);
    return d < 0 ? 'perigo' : d <= 3 ? 'alerta' : '';
  }

  rotulo(venc: string) {
    const d = diffDias(hoje(), venc);
    return d < 0 ? 'Vencida' : d === 0 ? 'Hoje' : d <= 3 ? `${d}d` : 'Aberta';
  }
}
