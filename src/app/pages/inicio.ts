import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addMeses, diffDias, hoje, mesAtual } from '../core/datas';
import { creditoBeneficios, porCategoria, saldoBeneficio, variacaoGastos } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, pct } from '../core/formato';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Donut } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';

@Component({
  imports: [RouterLink, BrlPipe, DiaPipe, MesPipe, Donut, Icon],
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

      @if (avisos().length) {
        <section class="avisos">
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

      <section class="card">
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
        <section class="card">
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
        <section class="card">
          <div class="card-head"><h2>Orçamentos</h2><a routerLink="/orcamentos" class="small">Ver</a></div>
          @for (o of s.orcamentosStatus().slice(0, 4); track o.orcamento.id) {
            <div class="orc">
              <div class="l"><span class="tit"><app-icon [name]="o.icone" [size]="16" [style.color]="o.cor" />{{ o.nome }}</span><span class="num">{{ o.gasto | brl }} / {{ o.orcamento.valor | brl }}</span></div>
              <div class="bar" [class]="o.nivel"><i [style.width.%]="o.pct > 100 ? 100 : o.pct"></i></div>
            </div>
          }
        </section>
      }

      @if (beneficios().length || s.cofrinhos().length) {
        <section class="mini">
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

      <section class="card">
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
        <a class="card dica" routerLink="/resumo">
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
  protected variacao = computed(() => variacaoGastos(this.s.gastos(), this.s.mes(), hoje()));
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
