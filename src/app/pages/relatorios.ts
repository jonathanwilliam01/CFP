import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { addDias, addMeses, fimMes, hoje, nomeMes } from '../core/datas';
import { contasDoMes, noMes, porCategoria, resumoMes } from '../core/financas';
import { BrlPipe, MesPipe, baixarCsv, csvData, csvTexto, csvValor, pct, soma } from '../core/formato';
import { Entrada, Gasto, Pagamento } from '../core/models';
import { Store } from '../core/store';
import { Barras, BlocoMapa, Calor, Coluna, Donut, Empilhadas, Pilha, Treemap } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';
import { Abas, RELATORIOS } from '../shared/abas';
import { normalizar } from '../core/texto';

interface Grupo {
  nome: string;
  total: number;
  pct: number;
  cor: string;
}

@Component({
  imports: [Abas, BrlPipe, MesPipe, Donut, Barras, Empilhadas, Calor, Icon, Treemap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-abas titulo="Relatórios" [abas]="abas">
        <button class="btn ghost sm" type="button" (click)="exportar()" [disabled]="!dados()">
          <app-icon name="download" [size]="16" /> CSV
        </button>
      </app-abas>

      <div class="seg">
        <button type="button" [class.on]="vista() === 'geral'" (click)="trocarVista('geral')"><app-icon name="bar_chart" [size]="16" />Gráficos</button>
        <button type="button" [class.on]="vista() === 'mapa'" (click)="trocarVista('mapa')"><app-icon name="dashboard" [size]="16" />Mapa</button>
      </div>

      <div class="seg">
        @for (n of [3, 6, 12]; track n) {
          <button type="button" [class.on]="meses() === n" (click)="meses.set(n)">{{ n }} meses</button>
        }
      </div>
      <p class="muted small">{{ lista()[0] | mes }} até {{ s.mes() | mes }}</p>

      @if (!dados()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      } @else if (vista() === 'mapa') {
        <section class="card">
          <div class="card-head"><h2>Mapa dos gastos</h2><span class="muted small">consumo no período</span></div>
          <app-treemap [itens]="mapa()" />
          <p class="small muted">Cada bloco é uma categoria, do tamanho do que saiu nela. Toque para ver os estabelecimentos.</p>
        </section>
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
          <div class="card-head"><h2>Categorias mês a mês</h2><span class="muted small">consumo</span></div>
          <app-empilhadas [colunas]="pilhas()" [tendencia]="true" />
        </section>

        @if (comparar().length) {
          <section class="card">
            <div class="card-head"><h2>Comparar meses</h2><span class="muted small cap">{{ s.mes() | mes: true }} x {{ anterior() | mes: true }} x média</span></div>
            <div class="seg mini">
              <button type="button" [class.on]="base() === 'anterior'" (click)="base.set('anterior')">Contra o mês anterior</button>
              <button type="button" [class.on]="base() === 'media'" (click)="base.set('media')">Contra a média</button>
            </div>
            @for (c of comparar(); track c.id) {
              <div class="cmp">
                <div class="l">
                  <span class="tit"><app-icon [name]="c.icone" [size]="16" [style.color]="c.cor" />{{ c.nome }}</span>
                  <span class="num small">{{ c.atual | brl }}
                    @if (c.var !== null) { <b [class.neg]="c.var > 0" [class.pos]="c.var < 0">{{ c.var > 0 ? '▲' : '▼' }}{{ c.var > 0 ? c.var : -c.var }}%</b> } @else { <b>novo</b> }
                  </span>
                </div>
                <div class="par">
                  <i [style.width.%]="(c.atual / maxCmp()) * 100" [style.background]="c.cor"></i>
                  <i class="ref" [style.width.%]="(c.ref / maxCmp()) * 100" [title]="(base() === 'media' ? 'Média: ' : 'Mês anterior: ') + (c.ref | brl)"></i>
                </div>
              </div>
            }
            <p class="small muted">Barra colorida: {{ s.mes() | mes }}. Cinza: {{ base() === 'media' ? 'média dos outros meses do período' : 'mês anterior' }}.</p>
          </section>
        }

        @if (lojas().length) {
          <section class="card">
            <div class="card-head"><h2>Onde mais gastam</h2><span class="muted small">no período</span></div>
            <div class="list">
              @for (l of lojas(); track l.nome; let i = $index) {
                <div class="row">
                  <span class="pos-n">{{ i + 1 }}</span>
                  <div class="grow">
                    <div class="t">{{ l.nome }}</div>
                    <div class="s">{{ l.qtd }}x · média {{ l.total / l.qtd | brl }}@if (l.cat) { · {{ l.cat }}}</div>
                  </div>
                  <div class="v">{{ l.total | brl }}<div class="s">{{ l.pct }}%</div></div>
                </div>
              }
            </div>
          </section>
        }

        <section class="card">
          <div class="card-head"><h2>Gastos por dia</h2><span class="muted small">{{ calorDe() | mes }} até hoje</span></div>
          <app-calor [dias]="calor()" />
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
    .mini { margin-bottom: 6px; }
    .cmp { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; }
    .cmp .l { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
    .cmp .l b { font-size: 0.75rem; margin-left: 4px; }
    .par { display: flex; flex-direction: column; gap: 2px; }
    .par i { display: block; height: 7px; border-radius: 4px; min-width: 2px; transition: width 0.4s; }
    .par i.ref { height: 4px; background: var(--ink-3); opacity: 0.5; }
    .pos-n { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--card-2); font-weight: 800; font-size: 0.78rem; color: var(--ink-2); flex-shrink: 0; }
  `,
})
export default class Relatorios {
  protected abas = RELATORIOS;
  protected s = inject(Store);
  private toast = inject(Toast);

  protected meses = signal(6);
  protected vista = signal<'geral' | 'mapa'>(lerVista());

  trocarVista(v: 'geral' | 'mapa') {
    this.vista.set(v);
    try {
      localStorage.setItem('cfp.relatorios.vista', v);
    } catch {}
  }
  protected dados = signal<{ gastos: Gasto[]; entradas: Entrada[]; pagamentos: Pagamento[] } | null>(null);
  private req = 0;

  protected lista = computed(() => {
    const n = this.meses();
    const fim = this.s.mes();
    return Array.from({ length: n }, (_, i) => addMeses(fim, i - n + 1)).filter((m) => !this.s.antesDoInicio(m));
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
      { titulo: 'Por marcador', itens: porTag(g, cores) },
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
          return [(x.criado_por && membros.get(x.criado_por)) || 'Conta excluída', cores[i] ?? '#94a3b8'];
        }),
      },
    ];
  });

  /** Top 5 categorias do período e o resto em "Outras", por mês */
  protected pilhas = computed<Pilha[]>(() => {
    const top = this.categorias().slice(0, 5);
    const ids = new Set(top.map((c) => c.id));
    return this.lista().map((mes) => {
      const doMes = this.consumo().filter((g) => noMes(g.data, mes));
      const fat = porCategoria(doMes, this.s.catMap());
      return {
        rotulo: nomeMes(mes, true),
        destaque: mes === this.s.mes(),
        partes: [
          ...top.map((c) => ({ nome: c.nome, cor: c.cor, valor: fat.find((f) => f.id === c.id)?.total ?? 0 })),
          { nome: 'Outras', cor: '#94a3b8', valor: soma(fat.filter((f) => !ids.has(f.id)), (f) => f.total) },
        ],
      };
    });
  });

  protected base = signal<'anterior' | 'media'>('anterior');
  protected anterior = computed(() => addMeses(this.s.mes(), -1));

  /** Categorias do mês selecionado contra o anterior ou a média dos outros meses do período */
  protected comparar = computed(() => {
    const mes = this.s.mes();
    const outros = this.lista().filter((m) => m !== mes);
    if (!outros.length) return [];
    const doMes = (m: string) => new Map(porCategoria(this.consumo().filter((g) => noMes(g.data, m)), this.s.catMap()).map((c) => [c.id ?? '', c]));
    const atual = doMes(mes);
    const ref = new Map<string, number>();
    const meses = this.base() === 'media' ? outros : [this.anterior()].filter((m) => outros.includes(m));
    for (const m of meses) for (const [id, c] of doMes(m)) ref.set(id, (ref.get(id) ?? 0) + c.total / meses.length);
    const ids = new Set([...atual.keys(), ...ref.keys()]);
    const cats = this.s.catMap();
    return [...ids]
      .map((id) => {
        const a = atual.get(id)?.total ?? 0;
        const r = ref.get(id) ?? 0;
        const c = cats.get(id);
        return { id, nome: c?.nome ?? 'Sem categoria', icone: c?.icone ?? 'help', cor: c?.cor ?? '#94a3b8', atual: a, ref: r, var: r > 0 ? Math.round((a / r - 1) * 100) : null };
      })
      .sort((x, y) => Math.max(y.atual, y.ref) - Math.max(x.atual, x.ref))
      .slice(0, 8);
  });
  protected maxCmp = computed(() => Math.max(1, ...this.comparar().flatMap((c) => [c.atual, c.ref])));

  /** Categorias → estabelecimentos; dinheiro livre do outro entra só no total */
  protected mapa = computed<BlocoMapa[]>(() => {
    const cats = this.s.catMap();
    const m = new Map<string, { nome: string; cor: string; valor: number; filhos: Map<string, { nome: string; valor: number }> | null }>();
    for (const g of this.consumo()) {
      if (g.valor <= 0) continue;
      const livre = this.s.livreDeOutro(g);
      const c = livre ? undefined : cats.get(g.categoria_id ?? '');
      const k = livre ? '\u0000livre' : (g.categoria_id ?? '');
      const a = m.get(k) ?? { nome: livre ? 'Dinheiro livre' : (c?.nome ?? 'Sem categoria'), cor: livre ? '#94a3b8' : (c?.cor ?? '#64748b'), valor: 0, filhos: livre ? null : new Map() };
      a.valor += g.valor;
      if (a.filhos) {
        const desc = g.descricao.replace(PARCELA, '').trim() || 'Sem descrição';
        const kf = normalizar(desc);
        const f = a.filhos.get(kf) ?? { nome: desc, valor: 0 };
        f.valor += g.valor;
        a.filhos.set(kf, f);
      }
      m.set(k, a);
    }
    return [...m.values()].map((a) => {
      if (!a.filhos) return { nome: a.nome, cor: a.cor, valor: a.valor };
      // muitos estabelecimentos pequenos viram um bloco só
      const l = [...a.filhos.values()].sort((x, y) => y.valor - x.valor);
      const resto = l.slice(14);
      const filhos = resto.length > 1 ? [...l.slice(0, 14), { nome: `Outros (${resto.length})`, valor: soma(resto, (f) => f.valor) }] : l;
      return { nome: a.nome, cor: a.cor, valor: a.valor, filhos };
    });
  });

  /** Estabelecimentos pela descrição (sem acento e número de parcela), do maior total para o menor */
  protected lojas = computed(() => {
    const m = new Map<string, { nome: string; total: number; qtd: number; cats: Map<string, number> }>();
    for (const g of this.consumo()) {
      if (g.valor <= 0 || this.s.livreDeOutro(g)) continue;
      const k = normalizar(g.descricao).replace(PARCELA, '');
      if (!k) continue;
      const a = m.get(k) ?? { nome: g.descricao, total: 0, qtd: 0, cats: new Map() };
      a.total += g.valor;
      a.qtd++;
      if (g.categoria_id) a.cats.set(g.categoria_id, (a.cats.get(g.categoria_id) ?? 0) + 1);
      m.set(k, a);
    }
    const total = soma(this.consumo().filter((g) => g.valor > 0), (g) => g.valor);
    const cats = this.s.catMap();
    return [...m.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((a) => {
        const cat = [...a.cats.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
        return { nome: a.nome, total: a.total, qtd: a.qtd, pct: pct(a.total, total), cat: cat ? cats.get(cat)?.nome : undefined };
      });
  });

  /** até 6 meses: com mais semanas os quadradinhos ficam pequenos demais no celular */
  protected calorDe = computed(() => this.lista()[Math.max(0, this.lista().length - 6)]);
  protected calor = computed(() => {
    const fim = [fimMes(this.s.mes()), hoje()].sort()[0];
    const tot = new Map<string, number>();
    for (const g of this.consumo()) tot.set(g.data, (tot.get(g.data) ?? 0) + g.valor);
    const l: { data: string; valor: number }[] = [];
    for (let d = this.calorDe(); d <= fim; d = addDias(d, 1)) l.push({ data: d, valor: tot.get(d) ?? 0 });
    return l;
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
    const linhas = [...this.consumo()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((g) =>
        [
          csvData(g.data),
          csvTexto(g.descricao),
          csvTexto((g.categoria_id && cats.get(g.categoria_id)?.nome) || ''),
          g.forma === 'cartao' ? csvTexto(cartoes.get(g.cartao_id!) ?? 'Cartão') : g.forma === 'beneficio' ? csvTexto(benef.get(g.beneficio_id!) ?? 'Benefício') : 'À vista',
          g.fatura_mes ? g.fatura_mes.slice(0, 7) : '',
          csvTexto((g.criado_por && membros.get(g.criado_por)) || ''),
          csvValor(g.valor),
        ].join(';'),
      );
    baixarCsv(`cfp-gastos-${this.lista()[0].slice(0, 7)}-a-${this.s.mes().slice(0, 7)}.csv`, 'Data;Descrição;Categoria;Pagamento;Fatura;Pessoa;Valor', linhas);
  }
}

/** "(3/10)" ou "3/10" no fim da descrição de parcela */
const PARCELA = /\s*\(?\d+\s*\/\s*\d+\)?$/;

function lerVista(): 'geral' | 'mapa' {
  try {
    return localStorage.getItem('cfp.relatorios.vista') === 'mapa' ? 'mapa' : 'geral';
  } catch {
    return 'geral';
  }
}

/** Gasto com vários marcadores conta em cada um */
function porTag(gastos: Gasto[], cores: string[]): Grupo[] {
  const m = new Map<string, number>();
  for (const g of gastos) for (const t of g.tags ?? []) m.set(t, (m.get(t) ?? 0) + g.valor);
  const total = soma([...m.values()], (v) => v);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nome, v], i) => ({ nome: '#' + nome, total: v, cor: cores[i % cores.length], pct: pct(v, total) }));
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
