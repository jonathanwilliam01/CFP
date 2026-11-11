import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addMeses, diasNoMes, hoje, inicioMes, mesAtual, mesFatura, mesesEntre, nomeMes } from '../core/datas';
import { historicoReajustes } from '../core/financas';
import { BrlPipe, MesPipe, privado, soma } from '../core/formato';
import { Gasto, Parcelamento } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

type Parcela = Pick<Gasto, 'id' | 'parcelamento_id' | 'parcela' | 'valor' | 'data' | 'fatura_mes'>;

/** Compromisso com começo e fim: parcelamento ou dívida */
interface Compromisso {
  id: string;
  nome: string;
  cor: string;
  valor: number;
  ini: string;
  fim: string;
  pagas: number;
  total: number;
  falta: number;
  /** mês → valor das parcelas ainda a pagar */
  porMes: Map<string, number>;
  link: string;
  origem: string;
}

interface Seg {
  /** índices de mês no eixo, fim exclusivo */
  ini: number;
  fim: number;
  valor: number;
  pago?: boolean;
  tom?: string;
}

type Detalhe =
  | { tipo: 'parc'; nome: string; origem: string; valor: number; pagas: number; total: number; fim: string; falta: number; link: string }
  | { tipo: 'fixa'; nome: string; valor: number; variavel: boolean; desde: string; fim: string | null; versoes: { valor: number; inicio: string }[] };

interface Barra {
  id: string;
  nome: string;
  extra: string;
  valor: number;
  cor: string;
  ini: number;
  fim: number;
  antes: boolean;
  depois: boolean;
  /** posição do rótulo (perto do fim do eixo ele recua para caber) */
  rot: number;
  segs: Seg[];
  det: Detalhe;
}

interface Gantt {
  meses: string[];
  col: number;
  hoje: number;
  barras: Barra[];
  /** só na aba Parcelas: soma das parcelas de cada mês (do mês atual em diante) */
  comprometido: { valor: number; h: number }[] | null;
}

const COR_DIVIDA = '#b45309';

/** Linha do tempo: parcelas e dívidas até a última parcela; contas fixas com os reajustes */
@Component({
  imports: [RouterLink, BrlPipe, MesPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Linha do tempo</h1></div>

      <div class="seg">
        <button type="button" [class.on]="aba() === 'parcelas'" (click)="trocar('parcelas')">Parcelas</button>
        <button type="button" [class.on]="aba() === 'fixas'" (click)="trocar('fixas')">Fixas e assinaturas</button>
      </div>

      @if (aba() === 'parcelas' && !carregado()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      } @else if (!g().barras.length) {
        <div class="card empty">
          <app-icon class="big" name="view_timeline" [size]="40" />
          <p>{{ aba() === 'parcelas' ? 'Nenhuma parcela ou dívida em andamento.' : 'Nenhuma conta fixa nestes 24 meses.' }}</p>
        </div>
      } @else {
        @let x = g();
        <section class="card gc">
          <div class="card-head">
            <h2>{{ aba() === 'parcelas' ? 'Até a última parcela' : 'Últimos 12 e próximos 12 meses' }}</h2>
            @if (aba() === 'parcelas') { <span class="small muted">hoje <b class="num">{{ agora() | brl }}</b>/mês</span> }
          </div>
          <div class="rolo" #rolo>
            <div class="gantt" [style.width.px]="x.meses.length * x.col" [style.--col]="x.col + 'px'">
              <div class="eixo">
                @for (m of x.meses; track m) { <span [class.atual]="m === mesHoje" [class.jan]="m.endsWith('-01-01')">{{ rotMes(m, $first) }}</span> }
              </div>
              <div class="linhas">
                @for (b of x.barras; track b.id) {
                  <div class="lin">
                    <span class="rot" [style.margin-left.px]="b.rot"><b>{{ b.nome }}</b> {{ b.valor | brl }}{{ b.extra }}</span>
                    <button type="button" class="bar" [class.on]="sel() === b.id" [class.antes]="b.antes" [class.depois]="b.depois"
                      [style.left.px]="b.ini * x.col" [style.width.px]="(b.fim - b.ini) * x.col" [style.--cor]="b.cor"
                      (click)="sel.set(sel() === b.id ? null : b.id)" [attr.aria-label]="b.nome + ', ' + (b.valor | brl) + b.extra + '. Ver detalhes'">
                      @for (s of b.segs; track $index) {
                        <i [class.pago]="s.pago" [style.left.px]="(s.ini - b.ini) * x.col" [style.width.px]="(s.fim - s.ini) * x.col" [style.background]="s.tom ?? null">
                          @if (s.tom && s.fim - s.ini >= 3) { <em>{{ s.valor | brl }}</em> }
                        </i>
                      }
                    </button>
                  </div>
                }
                <i class="hoje" [style.left.px]="x.hoje" aria-hidden="true"></i>
              </div>
              @if (x.comprometido; as c) {
                <div class="comp" aria-label="Comprometido por mês">
                  @for (v of c; track $index) {
                    <span [title]="rotMes(x.meses[$index], true) + ': ' + (v.valor | brl)">
                      @if (v.valor > 0) { <i [style.height.%]="v.h"></i><small>{{ curto(v.valor) }}</small> }
                    </span>
                  }
                </div>
              }
            </div>
          </div>
          <div class="leg small muted">
            @if (aba() === 'parcelas') {
              <span><i class="q"></i>a pagar</span><span><i class="q pago"></i>já pago</span><span><i class="lh"></i>hoje</span><span>Barras de baixo: comprometido por mês</span>
            } @else {
              <span>Cada trecho é um valor; a cor fica mais forte a cada reajuste</span><span><i class="lh"></i>hoje</span>
            }
          </div>
        </section>

        @if (detalhe(); as d) {
          <section class="card det">
            <div class="card-head"><h2>{{ d.nome }}</h2><button class="btn ghost icon sm" type="button" (click)="sel.set(null)" aria-label="Fechar"><app-icon name="close" [size]="18" /></button></div>
            @if (d.tipo === 'parc') {
              <dl>
                <div><dt>Parcela</dt><dd class="num">{{ d.valor | brl }}</dd></div>
                <div><dt>Parcelas</dt><dd>{{ d.total - d.pagas }} de {{ d.total }} restantes</dd></div>
                <div><dt>Falta pagar</dt><dd class="num">{{ d.falta | brl }}</dd></div>
                <div><dt>Última parcela</dt><dd class="cap">{{ d.fim | mes }}</dd></div>
              </dl>
              <a class="btn ghost sm" [routerLink]="d.link">{{ d.origem }}<app-icon name="chevron_right" [size]="16" /></a>
            } @else {
              <dl>
                <div><dt>{{ d.variavel ? 'Média' : 'Valor' }}</dt><dd class="num">{{ d.valor | brl }}</dd></div>
                <div><dt>Desde</dt><dd class="cap">{{ d.desde | mes }}</dd></div>
                <div><dt>Fim</dt><dd class="cap">{{ d.fim ? (d.fim | mes) : 'sem fim' }}</dd></div>
                @if (d.versoes.length > 1) {
                  <div class="larga"><dt>Reajustes</dt><dd>
                    @for (v of d.versoes; track $index) { <span class="ver"><span class="cap">{{ v.inicio | mes: true }}</span> <b class="num">{{ v.valor | brl }}</b></span> }
                  </dd></div>
                }
              </dl>
              <a class="btn ghost sm" routerLink="/contas">Contas<app-icon name="chevron_right" [size]="16" /></a>
            }
          </section>
        }

        @if (aba() === 'parcelas' && libera().length) {
          <section class="card">
            <div class="card-head"><h2>Quando a renda fica livre</h2></div>
            <div class="libera">
              @for (l of libera(); track l.mes) {
                <div class="lib"><app-icon name="lock_open" [size]="18" />
                  <span>Em <b class="cap">{{ l.mes | mes }}</b> a renda fica livre de <b class="num pos">{{ l.valor | brl }}</b>
                    <span class="small muted"> · {{ l.nomes }}@if (l.resta > 0) { · seguem {{ l.resta | brl }}/mês }</span></span>
                </div>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .gc { min-width: 0; }
    .rolo { overflow-x: auto; overscroll-behavior-x: contain; margin: 0 -14px; padding: 0 14px 4px; }
    .gantt { position: relative; overflow-x: clip; }
    .eixo { display: flex; border-bottom: 1px solid var(--line); }
    .eixo span { flex: 0 0 var(--col); font-size: 0.66rem; font-weight: 600; color: var(--ink-3); text-align: center; padding-bottom: 4px; white-space: nowrap; text-transform: capitalize; }
    .eixo .jan { color: var(--ink-2); }
    .eixo .atual { color: var(--primary); font-weight: 800; }
    .linhas { position: relative; padding: 6px 0 2px; }
    .lin { position: relative; height: 44px; }
    .rot {
      position: sticky; left: 0; display: inline-block; max-width: 280px; font-size: 0.74rem; color: var(--ink-2); line-height: 18px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: top;
    }
    .rot b { color: var(--ink); }
    .bar { position: absolute; top: 19px; height: 20px; padding: 0; border: 0; border-radius: 6px; background: none; cursor: pointer; overflow: hidden; }
    .bar.antes { border-top-left-radius: 0; border-bottom-left-radius: 0; }
    .bar.depois { border-top-right-radius: 0; border-bottom-right-radius: 0; }
    .bar.on { outline: 2px solid var(--ink); outline-offset: 1px; }
    .bar:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
    .bar i { position: absolute; top: 0; bottom: 0; background: var(--cor); display: flex; align-items: center; padding-left: 5px; box-sizing: border-box; }
    .bar i + i { border-left: 2px solid var(--card); }
    .bar i.pago { background: color-mix(in srgb, var(--cor) 30%, var(--card-2)); border-left: 0; }
    .bar em { font-style: normal; font-size: 0.66rem; font-weight: 700; color: #fff; white-space: nowrap; text-shadow: 0 1px 2px rgb(0 0 0 / 0.35); font-variant-numeric: tabular-nums; }
    .hoje { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1.5px dashed var(--ink-2); pointer-events: none; }
    .comp { display: flex; align-items: flex-end; height: 64px; border-top: 1px solid var(--line); padding-top: 4px; }
    .comp span { flex: 0 0 var(--col); height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 1px; }
    .comp i { width: 60%; min-height: 2px; max-height: calc(100% - 14px); background: color-mix(in srgb, var(--danger) 55%, var(--card-2)); border-radius: 3px 3px 0 0; }
    .comp small { font-size: 0.6rem; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .leg { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; }
    .leg span { display: inline-flex; align-items: center; gap: 5px; }
    .q { display: inline-block; width: 14px; height: 8px; border-radius: 2px; background: var(--primary); }
    .q.pago { background: color-mix(in srgb, var(--primary) 30%, var(--card-2)); }
    .lh { display: inline-block; height: 12px; border-left: 1.5px dashed var(--ink-2); }
    .det dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 12px; }
    .det dt { font-size: 0.75rem; color: var(--ink-2); font-weight: 600; }
    .det dd { margin: 2px 0 0; font-weight: 700; }
    .det .larga { grid-column: 1 / -1; }
    .ver { display: inline-block; margin-right: 12px; font-weight: 500; }
    .cap { text-transform: capitalize; }
    .libera { display: flex; flex-direction: column; gap: 8px; }
    .lib { display: flex; gap: 8px; align-items: flex-start; font-size: 0.88rem; color: var(--ink-2); }
    .lib app-icon { color: var(--ok); }
    @media (prefers-reduced-motion: no-preference) { .bar i { transition: width 0.3s, left 0.3s; } }
  `,
})
export default class LinhaDoTempo {
  protected s = inject(Store);
  private toast = inject(Toast);
  private injector = inject(Injector);

  protected aba = signal<'parcelas' | 'fixas'>('parcelas');
  protected sel = signal<string | null>(null);
  protected mesHoje = mesAtual();
  private rolo = viewChild<ElementRef<HTMLElement>>('rolo');

  private parcelamentos = signal<Parcelamento[]>([]);
  private parcelas = signal<Parcela[]>([]);
  /** parcelas pagas em Contas por conta fixa ligada à dívida */
  private pagasConta = signal(new Map<string, number>());
  protected carregado = signal(false);

  private compromissos = computed<Compromisso[]>(() => {
    const atual = this.mesHoje;
    const cartoes = new Map(this.s.cartoes().map((c) => [c.id, c]));
    const l: Compromisso[] = [];
    for (const p of this.parcelamentos()) {
      const c = p.cartao_id ? cartoes.get(p.cartao_id) : undefined;
      const mesDa = (i: number) => {
        const d = addMeses(p.primeira_data, i);
        return c ? mesFatura(d, c) : inicioMes(d);
      };
      // mesma regra da tela de parcelamentos: paga = não existe mais como gasto de mês atual em diante
      const futuras = this.parcelas().filter((g) => g.parcelamento_id === p.id && g.parcela != null && (g.fatura_mes ?? inicioMes(g.data)) >= atual);
      const pagas = p.num_parcelas - futuras.length;
      if (pagas >= p.num_parcelas) continue;
      const porMes = new Map<string, number>();
      for (const g of futuras) {
        const m = g.fatura_mes ?? inicioMes(g.data);
        porMes.set(m, (porMes.get(m) ?? 0) + g.valor);
      }
      const cat = p.categoria_id ? this.s.catMap().get(p.categoria_id) : undefined;
      l.push({
        id: 'p' + p.id, nome: p.descricao, cor: cat?.cor ?? '#64748b', valor: p.valor_parcela, ini: mesDa(0), fim: mesDa(p.num_parcelas - 1),
        pagas, total: p.num_parcelas, falta: soma(futuras, (g) => g.valor), porMes, link: '/parcelamentos', origem: c ? `Parcelamentos · ${c.nome}` : 'Parcelamentos',
      });
    }
    for (const d of this.s.dividas()) {
      const daConta = soma(this.cadeia(d.recorrencia_id), (id) => this.pagasConta().get(id) ?? 0);
      const pagas = Math.min(d.num_parcelas, d.pagas + daConta);
      if (pagas >= d.num_parcelas) continue;
      const porMes = new Map<string, number>();
      for (let i = pagas; i < d.num_parcelas; i++) porMes.set(addMeses(d.inicio, i), d.valor_parcela);
      l.push({
        id: 'd' + d.id, nome: d.descricao, cor: COR_DIVIDA, valor: d.valor_parcela, ini: inicioMes(d.inicio), fim: addMeses(inicioMes(d.inicio), d.num_parcelas - 1),
        pagas, total: d.num_parcelas, falta: (d.num_parcelas - pagas) * d.valor_parcela, porMes, link: '/dividas', origem: 'Dívidas',
      });
    }
    return l.sort((a, b) => a.fim.localeCompare(b.fim) || b.valor - a.valor);
  });

  /** comprometido no mês atual */
  protected agora = computed(() => soma(this.compromissos(), (c) => c.porMes.get(this.mesHoje) ?? 0));

  private gParcelas = computed<Gantt>(() => {
    const l = this.compromissos();
    const atual = this.mesHoje;
    const menor = l.reduce((m, c) => (c.ini < m ? c.ini : m), atual);
    const maior = l.reduce((m, c) => (c.fim > m ? c.fim : m), addMeses(atual, 5));
    // até 12 meses para trás e 6 anos para a frente (financiamento longo não estica o gráfico sem fim)
    const ini = menor < addMeses(atual, -12) ? addMeses(atual, -12) : menor;
    const fim = maior > addMeses(atual, 72) ? addMeses(atual, 72) : maior;
    const meses = this.eixo(ini, fim);
    const idx = (m: string) => mesesEntre(ini, m);
    const n = meses.length;
    const barras = l.map((c): Barra => {
      const bi = Math.max(0, idx(c.ini));
      const bf = Math.min(n, idx(c.fim) + 1);
      const pago = Math.min(bf, Math.max(bi, idx(addMeses(c.ini, c.pagas))));
      return {
        id: c.id, nome: c.nome, valor: c.valor, cor: c.cor, ini: bi, fim: bf, antes: idx(c.ini) < 0, depois: idx(c.fim) >= n, rot: 0,
        extra: ` · faltam ${c.total - c.pagas} de ${c.total}`,
        segs: [{ ini: bi, fim: pago, valor: c.valor, pago: true }, { ini: pago, fim: bf, valor: c.valor }].filter((s) => s.fim > s.ini),
        det: { tipo: 'parc', nome: c.nome, origem: c.origem, valor: c.valor, pagas: c.pagas, total: c.total, fim: c.fim, falta: c.falta, link: c.link },
      };
    });
    const tot = meses.map((m) => (m < atual ? 0 : soma(l, (c) => c.porMes.get(m) ?? 0)));
    const max = Math.max(1, ...tot);
    rotulos(barras, meses.length * 40, 40);
    return { meses, col: 40, hoje: this.xHoje(ini, 40), barras, comprometido: tot.map((valor) => ({ valor, h: (valor / max) * 100 })) };
  });

  private gFixas = computed<Gantt>(() => {
    const atual = this.mesHoje;
    const ini = addMeses(atual, -12);
    const fim = addMeses(atual, 11);
    const meses = this.eixo(ini, fim);
    const idx = (m: string) => mesesEntre(ini, m);
    const todas = this.s.recorrencias();
    const contas = todas.filter((r) => r.tipo === 'conta');
    const ids = new Set(contas.map((r) => r.id));
    const prev = new Map(this.s.recorrenciasPrev().map((r) => [r.id, r.valor]));
    const cats = this.s.catMap();
    const barras: Barra[] = [];
    for (const raiz of contas.filter((r) => !r.reajuste_de || !ids.has(r.reajuste_de))) {
      const versoes = historicoReajustes(todas, raiz.id)
        .filter((v) => v.ativo)
        .map((v) => ({ valor: prev.get(v.id) ?? v.valor, inicio: inicioMes(v.inicio), fim: v.fim ? inicioMes(v.fim) : null }));
      if (!versoes.length) continue;
      const ultima = versoes.at(-1)!;
      const r = historicoReajustes(todas, raiz.id).at(-1)!;
      const cor = cats.get(r.categoria_id ?? '')?.cor ?? '#64748b';
      const segs: Seg[] = [];
      versoes.forEach((v, i) => {
        const si = Math.max(0, idx(v.inicio));
        const sf = Math.min(meses.length, v.fim ? idx(v.fim) + 1 : meses.length);
        // versão seguinte começa onde esta acaba (o reajuste pode ter gravado o fim no mesmo mês)
        const prox = versoes[i + 1];
        const corte = prox ? Math.min(sf, Math.max(si, idx(prox.inicio))) : sf;
        const forca = versoes.length > 1 ? Math.round(55 + (45 * i) / (versoes.length - 1)) : 100;
        if (corte > si) segs.push({ ini: si, fim: corte, valor: v.valor, tom: `color-mix(in srgb, var(--cor) ${forca}%, var(--card))` });
      });
      if (!segs.length) continue;
      const comeco = versoes[0].inicio;
      barras.push({
        id: raiz.id, nome: r.descricao, valor: ultima.valor, cor, ini: segs[0].ini, fim: segs.at(-1)!.fim,
        antes: idx(comeco) < 0, depois: !ultima.fim || idx(ultima.fim) >= meses.length, rot: 0,
        extra: (r.variavel ? ' (média)' : '') + (ultima.fim ? ` · até ${nomeMes(ultima.fim, true)}/${ultima.fim.slice(2, 4)}` : ''),
        segs,
        det: { tipo: 'fixa', nome: r.descricao, valor: ultima.valor, variavel: r.variavel, desde: comeco, fim: ultima.fim, versoes: versoes.map((v) => ({ valor: v.valor, inicio: v.inicio })) },
      });
    }
    barras.sort((a, b) => Number(a.depois === false) - Number(b.depois === false) || b.valor - a.valor);
    rotulos(barras, meses.length * 34, 34);
    return { meses, col: 34, hoje: this.xHoje(ini, 34), barras, comprometido: null };
  });

  protected g = computed(() => (this.aba() === 'parcelas' ? this.gParcelas() : this.gFixas()));
  protected detalhe = computed(() => this.g().barras.find((b) => b.id === this.sel())?.det ?? null);

  /** Mês seguinte à última parcela: quanto sai da renda e quanto segue comprometido */
  protected libera = computed(() => {
    const l = this.compromissos();
    const m = new Map<string, { valor: number; nomes: string[] }>();
    for (const c of l) {
      const mes = addMeses(c.fim, 1);
      if (mes <= this.mesHoje) continue;
      const a = m.get(mes) ?? { valor: 0, nomes: [] };
      a.valor += c.porMes.get(c.fim) ?? c.valor;
      a.nomes.push(c.nome);
      m.set(mes, a);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([mes, a]) => ({ mes, valor: a.valor, nomes: a.nomes.join(', '), resta: soma(l, (c) => c.porMes.get(mes) ?? 0) }));
  });

  constructor() {
    effect(() => {
      this.s.mudou();
      if (this.s.carteiraId()) untracked(() => this.carregar());
    });
    effect(() => {
      const ids = this.s.dividas().flatMap((d) => this.cadeia(d.recorrencia_id));
      this.s.mudou();
      if (ids.length) untracked(() => this.carregarPagas(ids));
    });
    // ao abrir cada aba: rola até uns meses antes de hoje
    let rolada = '';
    effect(() => {
      const el = this.rolo()?.nativeElement;
      const g = this.g();
      const chave = this.aba();
      if (!el || rolada === chave) return;
      rolada = chave;
      afterNextRender(() => (el.scrollLeft = Math.max(0, g.hoje - 2.5 * g.col)), { injector: this.injector });
    });
  }

  trocar(a: 'parcelas' | 'fixas') {
    this.aba.set(a);
    this.sel.set(null);
  }

  protected rotMes(m: string, primeiro: boolean) {
    const n = nomeMes(m, true);
    return primeiro || m.endsWith('-01-01') ? `${n}/${m.slice(2, 4)}` : n;
  }

  /** valor curto para caber na coluna: 850, 1,2k */
  protected curto(v: number) {
    if (privado()) return '•••';
    return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + 'k' : String(Math.round(v));
  }

  private eixo(ini: string, fim: string) {
    return Array.from({ length: mesesEntre(ini, fim) + 1 }, (_, i) => addMeses(ini, i));
  }

  /** posição de hoje dentro da coluna do mês */
  private xHoje(ini: string, col: number) {
    const h = hoje();
    return (mesesEntre(ini, this.mesHoje) + (Number(h.slice(8)) - 0.5) / diasNoMes(h)) * col;
  }

  /** conta fixa reajustada vira outra: os pagamentos ficam espalhados pela cadeia */
  private cadeia(id: string | null) {
    return id ? historicoReajustes(this.s.recorrencias(), id).map((r) => r.id) : [];
  }

  private async carregar() {
    try {
      const id = this.s.carteiraId()!;
      const [dados, parcelas] = await Promise.all([
        q<Parcelamento[]>(supabase.from('parcelamentos').select('*').eq('carteira_id', id)),
        q<Parcela[]>(supabase.from('gastos').select('id, parcelamento_id, parcela, valor, data, fatura_mes').eq('carteira_id', id).not('parcelamento_id', 'is', null)),
      ]);
      this.parcelamentos.set(dados);
      this.parcelas.set(parcelas);
      this.carregado.set(true);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private async carregarPagas(ids: string[]) {
    try {
      const l = await q<{ ref_id: string }[]>(
        supabase.from('pagamentos').select('ref_id').eq('tipo', 'recorrencia').in('ref_id', ids).not('pago_em', 'is', null),
      );
      const m = new Map<string, number>();
      for (const p of l) m.set(p.ref_id, (m.get(p.ref_id) ?? 0) + 1);
      this.pagasConta.set(m);
    } catch (e) {
      this.toast.erro(e);
    }
  }
}

/** rótulo começa com a barra, mas recua perto do fim do eixo */
function rotulos(barras: Barra[], largura: number, col: number) {
  for (const b of barras) b.rot = Math.max(0, Math.min(b.ini * col, largura - 220));
}
