import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { hoje, parse } from '../core/datas';
import { porCategoria } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, soma } from '../core/formato';
import { Entrada, Gasto } from '../core/models';
import { Store } from '../core/store';
import { normalizar } from '../core/texto';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Resumo do ano: quanto gastou, onde, quando e quanto guardou */
@Component({
  imports: [BrlPipe, DiaPipe, MesPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Retrospectiva {{ ano() }}</h1>
        <div class="anos">
          <button class="btn ghost icon sm" type="button" (click)="ano.set(ano() - 1)" aria-label="Ano anterior"><app-icon name="chevron_left" /></button>
          <button class="btn ghost icon sm" type="button" [disabled]="ano() >= anoAtual" (click)="ano.set(ano() + 1)" aria-label="Próximo ano"><app-icon name="chevron_right" /></button>
        </div>
      </div>

      @if (!r()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      } @else if (!r()!.qtd) {
        <div class="card empty"><app-icon class="big" name="auto_awesome" [size]="40" /><p>Nenhum gasto lançado em {{ ano() }}.</p></div>
      } @else {
        @let x = r()!;
        <section class="card hero">
          <span class="small">Em {{ ano() }} você gastou</span>
          <b class="grande num">{{ x.total | brl }}</b>
          <span class="small">em {{ x.qtd }} lançamentos · média de {{ x.mediaMes | brl }} por mês</span>
          @if (x.entradas) { <span class="small">Entrou {{ x.entradas | brl }} em entradas lançadas</span> }
        </section>

        <div class="grade">
          @if (x.categoria; as c) {
            <article class="card"><span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
              <span class="l">Categoria campeã</span><b>{{ c.nome }}</b><span class="s">{{ c.total | brl }} · {{ c.pct }}% do ano</span></article>
          }
          @if (x.mes; as m) {
            <article class="card"><span class="ico"><app-icon name="calendar_month" /></span>
              <span class="l">Mês mais caro</span><b class="cap">{{ m.mes | mes }}</b><span class="s">{{ m.valor | brl }}</span></article>
          }
          @if (x.maior; as g) {
            <article class="card"><span class="ico"><app-icon name="trending_up" /></span>
              <span class="l">Maior gasto</span><b>{{ g.descricao }}</b><span class="s">{{ g.valor | brl }} · {{ g.data | dia }}</span></article>
          }
          @if (x.lugar; as l) {
            <article class="card"><span class="ico"><app-icon name="storefront" /></span>
              <span class="l">Onde mais voltou</span><b>{{ l.nome }}</b><span class="s">{{ l.vezes }} vezes · {{ l.valor | brl }}</span></article>
          }
          <article class="card"><span class="ico"><app-icon name="today" /></span>
            <span class="l">Dia que mais gasta</span><b class="cap">{{ x.diaSemana.nome }}</b><span class="s">{{ x.diaSemana.valor | brl }} no ano</span></article>
          <article class="card"><span class="ico ok"><app-icon name="savings" /></span>
            <span class="l">Guardado nos cofrinhos</span><b [class.pos]="x.guardado > 0">{{ x.guardado | brl }}</b><span class="s">depósitos menos retiradas</span></article>
        </div>
      }
    </div>
  `,
  styles: `
    .anos { display: flex; gap: 4px; }
    .hero { background: var(--hero); color: #fff; display: flex; flex-direction: column; gap: 4px; padding: 22px; }
    .hero .small { opacity: 0.85; }
    .grande { font-size: clamp(2rem, 8vw, 2.8rem); letter-spacing: -0.03em; }
    .grade { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    .grade article { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .grade b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ico { background: var(--primary-soft); color: var(--primary); margin-bottom: 4px; }
    .ico.ok { background: var(--ok-soft); color: var(--ok); }
    .l { font-size: 0.78rem; color: var(--ink-2); font-weight: 600; }
    .s { font-size: 0.8rem; color: var(--ink-3); }
    .cap { text-transform: capitalize; }
    @media (min-width: 720px) { .grade { grid-template-columns: repeat(3, 1fr); } }
  `,
})
export default class Retrospectiva {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected anoAtual = Number(hoje().slice(0, 4));
  // começo do ano ainda mostra o anterior
  protected ano = signal(Number(hoje().slice(5, 7)) <= 1 ? this.anoAtual - 1 : this.anoAtual);
  private dados = signal<{ gastos: Gasto[]; entradas: Entrada[] } | null>(null);
  private req = 0;

  protected r = computed(() => {
    const d = this.dados();
    if (!d) return null;
    const ini = `${this.ano()}-01-01`;
    const fim = `${this.ano()}-12-31`;
    const gastos = d.gastos.filter((g) => g.data >= ini && g.data <= fim && !this.s.antesDoInicio(g.data));
    const total = soma(gastos, (g) => g.valor);
    const porMes = new Map<string, number>();
    const porDia = new Array(7).fill(0);
    const lugares = new Map<string, { nome: string; vezes: number; valor: number }>();
    for (const g of gastos) {
      const m = g.data.slice(0, 8) + '01';
      porMes.set(m, (porMes.get(m) ?? 0) + g.valor);
      porDia[parse(g.data).getDay()] += g.valor;
      if (g.parcelamento_id) continue;
      const k = normalizar(g.descricao);
      const a = lugares.get(k) ?? { nome: g.descricao, vezes: 0, valor: 0 };
      a.vezes++;
      a.valor += g.valor;
      lugares.set(k, a);
    }
    const mes = [...porMes].sort((a, b) => b[1] - a[1])[0];
    const dia = porDia.indexOf(Math.max(...porDia));
    const movs = this.s.cofrinhoMovs().filter((m) => m.data >= ini && m.data <= fim);
    return {
      qtd: gastos.length,
      total,
      mediaMes: porMes.size ? total / porMes.size : 0,
      entradas: soma(d.entradas.filter((e) => e.data >= ini && e.data <= fim), (e) => e.valor),
      categoria: porCategoria(gastos, this.s.catMap())[0] ?? null,
      mes: mes ? { mes: mes[0], valor: mes[1] } : null,
      maior: [...gastos].sort((a, b) => b.valor - a.valor)[0] ?? null,
      lugar: [...lugares.values()].sort((a, b) => b.vezes - a.vezes || b.valor - a.valor)[0] ?? null,
      diaSemana: { nome: SEMANA[dia], valor: porDia[dia] },
      guardado: soma(movs, (m) => m.valor),
    };
  });

  constructor() {
    effect(() => {
      const ano = this.ano();
      this.s.mudou();
      if (!this.s.carteiraId()) return;
      untracked(() => this.carregar(ano));
    });
  }

  private async carregar(ano: number) {
    const r = ++this.req;
    this.dados.set(null);
    try {
      const d = await this.s.historico(`${ano}-01-01`, `${ano}-12-31`);
      if (r === this.req) this.dados.set(d);
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
