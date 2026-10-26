import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { addMeses, fimMes, nomeMes } from '../core/datas';
import { contasDoMes, noMes, porCategoria, resumoMes } from '../core/financas';
import { BrlPipe, MesPipe, pct, soma } from '../core/formato';
import { Entrada, Gasto, Pagamento } from '../core/models';
import { Store } from '../core/store';
import { Coluna, Donut, Barras } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

interface Grupo {
  nome: string;
  total: number;
  pct: number;
  cor: string;
}

@Component({
  imports: [BrlPipe, MesPipe, Donut, Barras, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Relatórios</h1>
        <button class="btn ghost sm" type="button" (click)="exportar()" [disabled]="!dados()">
          <app-icon name="download" [size]="16" /> CSV
        </button>
      </div>

      <div class="seg">
        @for (n of [3, 6, 12]; track n) {
          <button type="button" [class.on]="meses() === n" (click)="meses.set(n)">{{ n }} meses</button>
        }
      </div>
      <p class="muted small">{{ lista()[0] | mes }} até {{ s.mes() | mes }}</p>

      @if (!dados()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      } @else {
        <div class="stats">
          <div class="stat"><div class="l">Entradas</div><div class="v pos">{{ totais().entradas | brl }}</div></div>
          <div class="stat"><div class="l">Saídas</div><div class="v neg">{{ totais().saidas | brl }}</div></div>
          <div class="stat"><div class="l">Saldo</div><div class="v" [class.neg]="totais().saldo < 0">{{ totais().saldo | brl }}</div></div>
          <div class="stat"><div class="l">Média de saídas/mês</div><div class="v">{{ totais().media | brl }}</div></div>
        </div>

        <section class="card">
          <div class="card-head"><h2>Entradas x saídas</h2></div>
          <app-barras [colunas]="colunas()" />
        </section>

        <section class="card">
          <div class="card-head"><h2>Por categoria</h2><span class="muted small">consumo no período</span></div>
          @if (categorias().length) {
            <div class="donut"><app-donut [fatias]="fatias()" rotulo="Consumo" /></div>
            <div class="list">
              @for (c of categorias(); track c.id) {
                <div class="row">
                  <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
                  <div class="grow">
                    <div class="t">{{ c.nome }}</div>
                    <div class="bar"><i [style.width.%]="c.pct" [style.background]="c.cor"></i></div>
                  </div>
                  <div class="v">{{ c.total | brl }}<div class="s">{{ c.pct }}% · {{ c.total / meses() | brl }}/mês</div></div>
                </div>
              }
            </div>
          } @else {
            <div class="empty">Nenhum gasto no período</div>
          }
        </section>

        @for (b of blocos(); track b.titulo) {
          @if (b.itens.length) {
            <section class="card">
              <div class="card-head"><h2>{{ b.titulo }}</h2></div>
              <div class="list">
                @for (g of b.itens; track g.nome) {
                  <div class="row">
                    <i class="dot" [style.background]="g.cor"></i>
                    <div class="grow">
                      <div class="t">{{ g.nome }}</div>
                      <div class="bar"><i [style.width.%]="g.pct" [style.background]="g.cor"></i></div>
                    </div>
                    <div class="v">{{ g.total | brl }}<div class="s">{{ g.pct }}%</div></div>
                  </div>
                }
              </div>
            </section>
          }
        }

        <section class="card">
          <div class="card-head"><h2>Mês a mês</h2></div>
          <div class="list">
            @for (m of porMes(); track m.mes) {
              <div class="row">
                <div class="grow"><div class="t cap">{{ m.mes | mes }}</div>
                  <div class="s">Entradas {{ m.r.entradas | brl }} · Saídas {{ m.r.saidas | brl }}</div></div>
                <div class="v" [class.neg]="m.r.saldo < 0" [class.pos]="m.r.saldo >= 0">{{ m.r.saldo | brl }}</div>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .donut { display: grid; place-items: center; margin: 4px 0 12px; }
    .bar { margin-top: 6px; height: 6px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .cap { text-transform: capitalize; }
  `,
})
export default class Relatorios {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected meses = signal(6);
  protected dados = signal<{ gastos: Gasto[]; entradas: Entrada[]; pagamentos: Pagamento[] } | null>(null);
  private req = 0;

  protected lista = computed(() => {
    const n = this.meses();
    const fim = this.s.mes();
    return Array.from({ length: n }, (_, i) => addMeses(fim, i - n + 1));
  });

  /** Gastos consumidos (por data) dentro do período */
  protected consumo = computed(() => {
    const d = this.dados();
    const l = this.lista();
    if (!d) return [];
    const ini = l[0];
    const fim = fimMes(l[l.length - 1]);
    return d.gastos.filter((g) => g.data >= ini && g.data <= fim);
  });

  protected porMes = computed(() => {
    const d = this.dados();
    if (!d) return [];
    const rec = this.s.recorrenciasPrev();
    return this.lista().map((mes) => {
      const contas = contasDoMes(mes, rec, this.s.cartoes(), d.gastos, d.pagamentos, this.s.catMap());
      const avulsas = soma(d.entradas.filter((e) => noMes(e.data, mes)), (e) => e.valor);
      return { mes, r: resumoMes(mes, d.gastos, avulsas, rec, contas, d.pagamentos) };
    });
  });

  protected totais = computed(() => {
    const l = this.porMes();
    const entradas = soma(l, (m) => m.r.entradas);
    const saidas = soma(l, (m) => m.r.saidas);
    return { entradas, saidas, saldo: entradas - saidas, media: l.length ? saidas / l.length : 0 };
  });

  protected colunas = computed<Coluna[]>(() =>
    this.porMes().map((m) => ({ rotulo: nomeMes(m.mes, true), a: m.r.entradas, b: m.r.saidas, destaque: m.mes === this.s.mes() })),
  );

  protected categorias = computed(() => porCategoria(this.consumo(), this.s.catMap()));
  protected fatias = computed(() => this.categorias().map((c) => ({ nome: c.nome, valor: c.total, cor: c.cor })));

  protected blocos = computed(() => {
    const g = this.consumo();
    const cartoes = new Map(this.s.cartoes().map((c) => [c.id, c]));
    const membros = this.s.membroMap();
    const cores = ['#1d5bd8', '#0e9f6e', '#d97706', '#db2777', '#7c3aed'];
    const formas: Record<string, [string, string]> = {
      debito: ['À vista (Pix/débito/dinheiro)', '#1d5bd8'],
      cartao: ['Cartão de crédito', '#7c3aed'],
      beneficio: ['Benefícios', '#d97706'],
    };
    return [
      { titulo: 'Por forma de pagamento', itens: agrupar(g, (x) => formas[x.forma]) },
      {
        titulo: 'Por cartão',
        itens: agrupar(g.filter((x) => x.forma === 'cartao'), (x) => {
          const c = x.cartao_id ? cartoes.get(x.cartao_id) : undefined;
          return [c?.nome ?? 'Cartão removido', c?.cor ?? '#94a3b8'];
        }),
      },
      {
        titulo: 'Por pessoa',
        itens: agrupar(g, (x) => {
          const ids = [...membros.keys()];
          const i = x.criado_por ? ids.indexOf(x.criado_por) : -1;
          return [(x.criado_por && membros.get(x.criado_por)) || 'Desconhecido', cores[i] ?? '#94a3b8'];
        }),
      },
    ];
  });

  constructor() {
    effect(() => {
      const l = this.lista();
      this.s.mudou();
      if (!this.s.carteiraId()) return;
      untracked(() => this.carregar(l[0], fimMes(l[l.length - 1])));
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

  exportar() {
    const cats = this.s.catMap();
    const cartoes = new Map(this.s.cartoes().map((c) => [c.id, c.nome]));
    const benef = new Map(this.s.beneficios().map((b) => [b.id, b.nome]));
    const membros = this.s.membroMap();
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const linhas = [...this.consumo()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((g) =>
        [
          g.data.split('-').reverse().join('/'),
          esc(g.descricao),
          esc((g.categoria_id && cats.get(g.categoria_id)?.nome) || ''),
          g.forma === 'cartao' ? esc(cartoes.get(g.cartao_id!) ?? 'Cartão') : g.forma === 'beneficio' ? esc(benef.get(g.beneficio_id!) ?? 'Benefício') : 'À vista',
          g.fatura_mes ? g.fatura_mes.slice(0, 7) : '',
          esc((g.criado_por && membros.get(g.criado_por)) || ''),
          g.valor.toFixed(2).replace('.', ','),
        ].join(';'),
      );
    const csv = '﻿' + ['Data;Descrição;Categoria;Pagamento;Fatura;Pessoa;Valor', ...linhas].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `cfp-gastos-${this.lista()[0].slice(0, 7)}-a-${this.s.mes().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function agrupar(gastos: Gasto[], chave: (g: Gasto) => [string, string]): Grupo[] {
  const m = new Map<string, { total: number; cor: string }>();
  for (const g of gastos) {
    const [nome, cor] = chave(g);
    const a = m.get(nome) ?? { total: 0, cor };
    a.total += g.valor;
    m.set(nome, a);
  }
  const total = soma([...m.values()], (a) => a.total);
  return [...m.entries()]
    .map(([nome, a]) => ({ nome, total: a.total, cor: a.cor, pct: pct(a.total, total) }))
    .sort((a, b) => b.total - a.total);
}
