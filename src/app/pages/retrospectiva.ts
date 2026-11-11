import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { diffDias, hoje, nomeMes, parse } from '../core/datas';
import { porCategoria } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, soma } from '../core/formato';
import { Entrada, Gasto } from '../core/models';
import { Store } from '../core/store';
import { normalizar } from '../core/texto';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';
import { Abas, RELATORIOS } from '../shared/abas';
import { semanasDoAno } from '../shared/graficos';

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Resumo do ano: quanto gastou, onde, quando e quanto guardou */
@Component({
  imports: [Abas, BrlPipe, DiaPipe, MesPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-abas titulo="Relatórios" [abas]="abas">
        <button class="btn ghost icon sm" type="button" (click)="ano.set(ano() - 1)" aria-label="Ano anterior"><app-icon name="chevron_left" /></button>
        <b class="ano">{{ ano() }}</b>
        <button class="btn ghost icon sm" type="button" [disabled]="ano() >= anoAtual" (click)="ano.set(ano() + 1)" aria-label="Próximo ano"><app-icon name="chevron_right" /></button>
      </app-abas>

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

        <section class="card calor">
          <div class="card-head"><h2>Calor do ano</h2><span class="muted small">gasto por dia</span></div>
          <div class="rolo" #rolo>
            <div class="ano-g" [style.--cols]="calor().colunas.length">
              <div class="meses">
                @for (m of calor().meses; track m.mes) { <span [style.grid-column]="m.col + 1">{{ m.rotulo }}</span> }
              </div>
              <div class="dias">
                @for (c of calor().colunas; track $index) {
                  @for (d of c; track $index) {
                    @if (d) {
                      <button type="button" class="q" [attr.data-n]="d.nivel" [class.sel]="diaSel()?.data === d.data" [class.hoje]="d.data === dataHoje"
                        (click)="diaSel.set(d)" [attr.aria-label]="(d.data | dia) + ': ' + (d.valor | brl)"></button>
                    } @else {
                      <i></i>
                    }
                  }
                }
              </div>
            </div>
          </div>
          <div class="pe">
            <span class="small">
              @if (diaSel(); as d) {
                <b>{{ data(d.data) }}</b> · <b class="num">{{ d.valor | brl }}</b>@if (d.qtd) { em {{ d.qtd }} gasto{{ d.qtd > 1 ? 's' : '' }} }
              } @else {
                <span class="muted">Toque num dia para ver o total</span>
              }
            </span>
            <span class="leg"><span>Menos</span>@for (n of [0, 1, 2, 3, 4]; track n) { <i class="q" [attr.data-n]="n"></i> }<span>Mais</span></span>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .ano { font-variant-numeric: tabular-nums; padding: 0 2px; }
    .hero { background: var(--hero); color: var(--hero-ink); display: flex; flex-direction: column; gap: 4px; padding: 22px; }
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
    .calor { min-width: 0; }
    .rolo { overflow-x: auto; padding-bottom: 4px; }
    .ano-g { --q: 13px; width: max-content; display: flex; flex-direction: column; gap: 4px; }
    .meses, .dias { display: grid; grid-template-columns: repeat(var(--cols), var(--q)); gap: 3px; }
    .meses span { font-size: 0.68rem; color: var(--ink-3); font-weight: 600; text-transform: capitalize; white-space: nowrap; }
    .dias { grid-template-rows: repeat(7, var(--q)); grid-auto-flow: column; }
    .q { display: block; width: var(--q); height: var(--q); padding: 0; border: 0; border-radius: 3px; background: var(--card-2); cursor: pointer; }
    .q[data-n='0'] { box-shadow: inset 0 0 0 1px var(--line); }
    .q[data-n='1'] { background: color-mix(in srgb, var(--primary) 25%, var(--card-2)); }
    .q[data-n='2'] { background: color-mix(in srgb, var(--primary) 50%, var(--card-2)); }
    .q[data-n='3'] { background: color-mix(in srgb, var(--primary) 75%, var(--card-2)); }
    .q[data-n='4'] { background: var(--primary); }
    .q.hoje { box-shadow: inset 0 0 0 1.5px var(--ink-2); }
    .q.sel { outline: 2px solid var(--ink); outline-offset: 1px; }
    .pe { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; }
    .leg { display: inline-flex; align-items: center; gap: 3px; font-size: 0.72rem; color: var(--ink-3); }
    .leg .q { width: 11px; height: 11px; cursor: default; }
    .leg span { margin: 0 3px; }
    @media (min-width: 720px) { .ano-g { --q: 11px; } }
    @media (min-width: 720px) { .grade { grid-template-columns: repeat(3, 1fr); } }
  `,
})
export default class Retrospectiva {
  protected abas = RELATORIOS;
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

  protected dataHoje = hoje();
  protected diaSel = signal<{ data: string; valor: number; qtd: number } | null>(null);
  private rolo = viewChild<ElementRef<HTMLElement>>('rolo');
  private injector = inject(Injector);

  /** Grade de semanas x dias, cor em 5 faixas (sem gasto + quartis dos dias com gasto) */
  protected calor = computed(() => {
    const ano = this.ano();
    const tot = new Map<string, { valor: number; qtd: number }>();
    for (const g of this.dados()?.gastos ?? []) {
      if (!g.data.startsWith(`${ano}-`) || this.s.antesDoInicio(g.data)) continue;
      const a = tot.get(g.data) ?? { valor: 0, qtd: 0 };
      a.valor += g.valor;
      a.qtd++;
      tot.set(g.data, a);
    }
    const nz = [...tot.values()].map((t) => t.valor).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] ?? 0;
    const cortes = [q(0.25), q(0.5), q(0.75)];
    const nivel = (v: number) => (v <= 0 ? 0 : 1 + cortes.filter((c) => v > c).length);
    const { colunas, meses } = semanasDoAno(ano);
    return {
      meses: meses.map((m) => ({ ...m, rotulo: nomeMes(m.mes, true) })),
      colunas: colunas.map((c) =>
        c.map((data) => {
          if (!data) return null;
          const t = tot.get(data) ?? { valor: 0, qtd: 0 };
          return { data, valor: t.valor, qtd: t.qtd, nivel: nivel(t.valor) };
        }),
      ),
    };
  });

  protected data = (d: string) => parse(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  constructor() {
    // ano corrente: rola a grade até a semana de hoje no celular
    effect(() => {
      const el = this.rolo()?.nativeElement;
      const ano = this.ano();
      this.diaSel.set(null);
      if (!el || ano !== this.anoAtual) return;
      const f = diffDias(`${ano}-01-01`, this.dataHoje) / 365;
      afterNextRender(() => (el.scrollLeft = f * el.scrollWidth - el.clientWidth * 0.85), { injector: this.injector });
    });
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
