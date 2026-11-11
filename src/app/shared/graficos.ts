import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { addDias, parse } from '../core/datas';
import { BrlPipe } from '../core/formato';

export interface Fatia {
  nome: string;
  valor: number;
  cor: string;
}

@Component({
  selector: 'app-donut',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 42 42" [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="rotulo()">
      <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--card-2)" stroke-width="6" />
      @for (a of arcos(); track a.nome) {
        <circle cx="21" cy="21" r="15.915" fill="none" [attr.stroke]="a.cor" stroke-width="6"
          [attr.stroke-dasharray]="a.dash" [attr.stroke-dashoffset]="a.off"><title>{{ a.nome }}: {{ a.valor | brl }}</title></circle>
      }
    </svg>
    <div class="c">
      <small>{{ rotulo() }}</small>
      <b class="num">{{ total() | brl }}</b>
    </div>
  `,
  styles: `
    :host { position: relative; display: inline-grid; place-items: center; }
    svg { transform: rotate(-90deg); }
    circle { transition: stroke-dasharray 0.4s; }
    .c { position: absolute; text-align: center; display: flex; flex-direction: column; }
    small { font-size: 0.7rem; color: var(--ink-2); font-weight: 600; }
    b { font-size: 0.82rem; }
  `,
})
export class Donut {
  readonly fatias = input<Fatia[]>([]);
  readonly size = input(150);
  readonly rotulo = input('Total');
  protected total = computed(() => this.fatias().reduce((a, f) => a + f.valor, 0));
  protected arcos = computed(() => {
    const t = this.total() || 1;
    let acc = 0;
    return this.fatias().map((f) => {
      const p = (f.valor / t) * 100;
      // pequeno vão entre fatias
      const r = { ...f, dash: `${Math.max(p - 0.6, 0.1)} ${100 - Math.max(p - 0.6, 0.1)}`, off: `${-acc}` };
      acc += p;
      return r;
    });
  });
}

export interface Coluna {
  rotulo: string;
  a: number;
  b: number;
  destaque?: boolean;
}

/** Barras agrupadas: a (verde) x b (vermelho) */
@Component({
  selector: 'app-barras',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g">
      @for (c of colunas(); track c.rotulo) {
        <div class="col" [class.on]="c.destaque">
          <div class="bars">
            <i class="a" [style.height.%]="(c.a / max()) * 100" [title]="legendaA() + ': ' + (c.a | brl)"></i>
            <i class="b" [style.height.%]="(c.b / max()) * 100" [title]="legendaB() + ': ' + (c.b | brl)"></i>
          </div>
          <small>{{ c.rotulo }}</small>
        </div>
      }
    </div>
    <div class="leg">
      <span><i class="a"></i>{{ legendaA() }}</span>
      <span><i class="b"></i>{{ legendaB() }}</span>
    </div>
  `,
  styles: `
    .g { display: flex; align-items: flex-end; gap: 6px; height: 150px; }
    .col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; min-width: 0; }
    .bars { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
    .bars i { width: 42%; max-width: 16px; border-radius: 4px 4px 1px 1px; min-height: 2px; transition: height 0.4s; }
    .a { background: var(--ok); }
    .b { background: var(--danger); opacity: 0.85; }
    small { font-size: 0.7rem; color: var(--ink-3); font-weight: 600; text-transform: capitalize; }
    .on small { color: var(--ink); }
    .leg { display: flex; gap: 14px; justify-content: center; margin-top: 10px; font-size: 0.78rem; color: var(--ink-2); }
    .leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
  `,
})
export class Barras {
  readonly colunas = input<Coluna[]>([]);
  readonly legendaA = input('Entradas');
  readonly legendaB = input('Saídas');
  protected max = computed(() => Math.max(1, ...this.colunas().flatMap((c) => [c.a, c.b])));
}

/** Linha do saldo dia a dia, com área, zero, dia de hoje e o menor ponto marcados */
@Component({
  selector: 'app-linha',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g">
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" role="img" [attr.aria-label]="'Saldo dia a dia, menor ' + (min().v | brl)">
        <path class="area" [attr.d]="area()" />
        @if (zero() !== null) { <line class="zero" x1="0" x2="300" [attr.y1]="zero()" [attr.y2]="zero()" /> }
        @if (marca() !== null) { <line class="hoje" [attr.x1]="x(marca()!)" [attr.x2]="x(marca()!)" y1="0" y2="100" /> }
        <path class="linha" [attr.d]="linha()" />
      </svg>
      <i class="min" [class.neg]="min().v < 0" [style.left.%]="(x(min().i) / 300) * 100" [style.top.%]="y(min().v)"></i>
    </div>
    <div class="eixo"><span>1</span><span>{{ valores().length }}</span></div>
  `,
  styles: `
    .g { position: relative; height: 120px; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .linha { fill: none; stroke: var(--primary); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
    .area { fill: color-mix(in srgb, var(--primary) 12%, transparent); }
    .zero { stroke: var(--danger); stroke-dasharray: 4 4; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.6; }
    .hoje { stroke: var(--ink-3); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-dasharray: 2 3; }
    .min { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--card); border: 2px solid var(--primary); }
    .min.neg { border-color: var(--danger); }
    .eixo { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--ink-3); font-weight: 600; margin-top: 4px; }
  `,
})
export class Linha {
  readonly valores = input<number[]>([]);
  /** índice destacado (hoje) */
  readonly marca = input<number | null>(null);
  private faixa = computed(() => {
    const v = this.valores();
    const lo = Math.min(0, ...v);
    const hi = Math.max(0, ...v);
    return { lo, hi: hi === lo ? lo + 1 : hi };
  });
  protected min = computed(() => this.valores().reduce((m, v, i) => (v < m.v ? { v, i } : m), { v: Infinity, i: 0 }));
  protected zero = computed(() => (this.faixa().lo < 0 ? this.y(0) : null));

  x(i: number) {
    return (i / Math.max(1, this.valores().length - 1)) * 300;
  }

  y(v: number) {
    const { lo, hi } = this.faixa();
    return 4 + (1 - (v - lo) / (hi - lo)) * 92;
  }

  protected linha = computed(() => this.valores().map((v, i) => `${i ? 'L' : 'M'}${this.x(i).toFixed(1)},${this.y(v).toFixed(1)}`).join(''));
  protected area = computed(() => {
    const n = this.valores().length;
    if (!n) return '';
    const base = this.y(Math.max(0, this.faixa().lo)).toFixed(1);
    return `${this.linha()}L${this.x(n - 1).toFixed(1)},${base}L0,${base}Z`;
  });
}

export interface Pilha {
  rotulo: string;
  partes: Fatia[];
  destaque?: boolean;
}

/** Colunas empilhadas (ex.: categorias por mês) com linha de tendência dos totais */
@Component({
  selector: 'app-empilhadas',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g">
      @for (c of colunas(); track c.rotulo) {
        <div class="col" [class.on]="c.destaque">
          <div class="pilha" [title]="c.rotulo + ': ' + (total(c) | brl)">
            @for (p of c.partes; track p.nome) {
              @if (p.valor > 0) { <i [style.height.%]="(p.valor / max()) * 100" [style.background]="p.cor" [title]="p.nome + ': ' + (p.valor | brl)"></i> }
            }
          </div>
          <small>{{ c.rotulo }}</small>
        </div>
      }
      @if (tendencia() && reta(); as r) {
        <svg class="tend" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line [attr.x1]="r.x1" [attr.x2]="r.x2" [attr.y1]="r.y1" [attr.y2]="r.y2" />
        </svg>
      }
    </div>
    <div class="leg">
      @for (l of legenda(); track l.nome) { <span><i [style.background]="l.cor"></i>{{ l.nome }}</span> }
      @if (tendencia() && reta()) { <span><i class="t"></i>Tendência</span> }
    </div>
  `,
  styles: `
    .g { position: relative; display: flex; align-items: flex-end; gap: 6px; height: 170px; padding-bottom: 18px; }
    .col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; min-width: 0; position: relative; }
    .pilha { flex: 1; width: 62%; max-width: 34px; display: flex; flex-direction: column-reverse; justify-content: flex-start; gap: 1px; }
    .pilha i { display: block; width: 100%; min-height: 2px; transition: height 0.4s; }
    .pilha i:last-child { border-radius: 4px 4px 0 0; }
    small { position: absolute; bottom: -18px; font-size: 0.7rem; color: var(--ink-3); font-weight: 600; text-transform: capitalize; }
    .on small { color: var(--ink); }
    .tend { position: absolute; left: 0; right: 0; top: 0; height: calc(100% - 18px); width: 100%; pointer-events: none; overflow: visible; }
    .tend line { stroke: var(--ink); stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; opacity: 0.7; }
    .leg { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; margin-top: 12px; font-size: 0.76rem; color: var(--ink-2); }
    .leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .leg i.t { height: 0; border-top: 2px dashed var(--ink); border-radius: 0; vertical-align: 3px; }
  `,
})
export class Empilhadas {
  readonly colunas = input<Pilha[]>([]);
  readonly tendencia = input(false);
  protected total = (c: Pilha) => c.partes.reduce((a, p) => a + p.valor, 0);
  protected max = computed(() => Math.max(1, ...this.colunas().map(this.total)));
  protected legenda = computed(() => {
    const m = new Map<string, string>();
    for (const c of this.colunas()) for (const p of c.partes) if (p.valor > 0 && !m.has(p.nome)) m.set(p.nome, p.cor);
    return [...m.entries()].map(([nome, cor]) => ({ nome, cor }));
  });
  /** mínimos quadrados sobre os totais, em % da área */
  protected reta = computed(() => {
    const ys = this.colunas().map(this.total);
    const n = ys.length;
    if (n < 3) return null;
    const mx = (n - 1) / 2;
    const my = ys.reduce((a, y) => a + y, 0) / n;
    let num = 0, den = 0;
    ys.forEach((y, i) => ((num += (i - mx) * (y - my)), (den += (i - mx) ** 2)));
    const a = num / den;
    const y = (i: number) => 100 - (Math.max(0, my + a * (i - mx)) / this.max()) * 100;
    // centro da primeira e da última coluna
    return { x1: 50 / n, x2: 100 - 50 / n, y1: y(0), y2: y(n - 1) };
  });
}

/** Mapa de calor por dia (semanas em colunas, domingo no topo) */
@Component({
  selector: 'app-calor',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g" [style.grid-template-columns]="'repeat(' + semanas().length + ', 1fr)'">
      @for (s of semanas(); track $index) {
        <div class="sem">
          @for (d of s; track $index) {
            @if (d) {
              <i [attr.data-n]="d.nivel" [title]="d.rotulo + ': ' + (d.valor | brl)"></i>
            } @else {
              <i class="vazio"></i>
            }
          }
        </div>
      }
    </div>
    <div class="leg"><span>Menos</span>@for (n of [0, 1, 2, 3, 4]; track n) { <i [attr.data-n]="n"></i> }<span>Mais</span></div>
  `,
  styles: `
    .g { display: grid; gap: 3px; }
    .sem { display: grid; grid-template-rows: repeat(7, 1fr); gap: 3px; }
    i { display: block; aspect-ratio: 1; border-radius: 3px; max-width: 18px; width: 100%; background: var(--card-2); }
    i.vazio { background: none; }
    i[data-n='1'] { background: color-mix(in srgb, var(--primary) 25%, var(--card-2)); }
    i[data-n='2'] { background: color-mix(in srgb, var(--primary) 50%, var(--card-2)); }
    i[data-n='3'] { background: color-mix(in srgb, var(--primary) 75%, var(--card-2)); }
    i[data-n='4'] { background: var(--primary); }
    .leg { display: flex; gap: 3px; align-items: center; justify-content: flex-end; margin-top: 8px; font-size: 0.72rem; color: var(--ink-3); }
    .leg i { width: 11px; }
    .leg span { margin: 0 4px; }
  `,
})
export class Calor {
  /** um item por dia, em ordem */
  readonly dias = input<{ data: string; valor: number }[]>([]);
  protected semanas = computed(() => {
    const d = this.dias();
    if (!d.length) return [];
    const nz = d.map((x) => x.valor).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] ?? 0;
    const cortes = [q(0.25), q(0.5), q(0.75)];
    const nivel = (v: number) => (v <= 0 ? 0 : 1 + cortes.filter((c) => v > c).length);
    const fmt = (s: string) => new Date(s + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    const celulas: ({ rotulo: string; valor: number; nivel: number } | null)[] = Array(new Date(d[0].data + 'T12:00').getDay()).fill(null);
    for (const x of d) celulas.push({ rotulo: fmt(x.data), valor: x.valor, nivel: nivel(x.valor) });
    const l = [];
    for (let i = 0; i < celulas.length; i += 7) l.push(celulas.slice(i, i + 7));
    return l;
  });
}

interface No {
  nome: string;
  valor: number;
  cor: string;
  y: number;
  h: number;
}

const LARG = 340;
const ALT = 240;
const VAO = 6;

/** Fluxo do mês (Sankey de 3 colunas): entradas → total → destinos; sobra ou falta fecham a conta */
@Component({
  selector: 'app-fluxo',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (d(); as x) {
      <svg [attr.viewBox]="'0 0 ' + larg + ' ' + (x.alt + 26)" role="img" [attr.aria-label]="'Fluxo do mês: ' + (x.total | brl)">
        <g transform="translate(0, 22)">
          @for (b of x.faixas; track $index) {
            <path class="faixa" [attr.d]="b.d" [attr.fill]="b.cor"><title>{{ b.nome }}: {{ b.valor | brl }}</title></path>
          }
          @for (n of x.esq; track n.nome) {
            <rect x="0" [attr.y]="n.y" width="8" [attr.height]="n.h" [attr.fill]="n.cor" rx="2" />
            <text x="12" [attr.y]="n.y + n.h / 2" dominant-baseline="middle"><tspan class="n">{{ n.nome }}</tspan><tspan class="v" dx="4">{{ n.valor | brl }}</tspan></text>
          }
          <rect [attr.x]="larg / 2 - 4" [attr.y]="x.meio.y" width="8" [attr.height]="x.meio.h" fill="var(--ink-3)" rx="2" />
          @for (n of x.dir; track n.nome) {
            <rect [attr.x]="larg - 8" [attr.y]="n.y" width="8" [attr.height]="n.h" [attr.fill]="n.cor" rx="2" />
            <text [attr.x]="larg - 12" [attr.y]="n.y + n.h / 2" dominant-baseline="middle" text-anchor="end"><tspan class="n">{{ n.nome }}</tspan><tspan class="v" dx="4">{{ n.valor | brl }}</tspan></text>
          }
        </g>
        <text class="topo" [attr.x]="larg / 2" y="10" text-anchor="middle">{{ x.total | brl }}</text>
      </svg>
    }
  `,
  styles: `
    svg { width: 100%; height: auto; display: block; }
    .faixa { opacity: 0.32; transition: opacity 0.2s; }
    .faixa:hover { opacity: 0.6; }
    text { font-size: 9.5px; fill: var(--ink); paint-order: stroke; stroke: var(--card); stroke-width: 3px; stroke-linejoin: round; }
    .n { font-weight: 700; }
    .v { fill: var(--ink-2); font-variant-numeric: tabular-nums; }
    .topo { font-weight: 800; font-size: 11px; }
  `,
})
export class Fluxo {
  readonly entradas = input<Fatia[]>([]);
  readonly saidas = input<Fatia[]>([]);
  protected larg = LARG;
  protected alt = ALT;

  protected d = computed(() => {
    const esq = this.entradas().filter((f) => f.valor > 0);
    const dir = this.saidas().filter((f) => f.valor > 0);
    const te = soma(esq);
    const ts = soma(dir);
    if (!te && !ts) return null;
    if (te > ts) dir.push({ nome: 'Sobra', valor: te - ts, cor: 'var(--ok)' });
    else if (ts > te) esq.push({ nome: 'Faltou', valor: ts - te, cor: 'var(--danger)' });
    const total = Math.max(te, ts);
    const n = Math.max(esq.length, dir.length);
    const k = (ALT - VAO * (n - 1)) / total;
    // nó pequeno ocupa ao menos a altura do rótulo, para os nomes não se sobreporem
    const vaga = (f: Fatia) => Math.max(f.valor * k, 13);
    const coluna = (l: Fatia[]) => {
      // centraliza a coluna com menos nós
      const usado = l.reduce((a, f) => a + vaga(f), 0) + VAO * (l.length - 1);
      let y = Math.max(0, (ALT - usado) / 2);
      return l.map((f): No => {
        const h = Math.max(f.valor * k, 1.5);
        const no = { ...f, y: y + (vaga(f) - h) / 2, h };
        y += vaga(f) + VAO;
        return no;
      });
    };
    const ne = coluna(esq);
    const nd = coluna(dir);
    const meio = { y: (ALT - total * k) / 2, h: total * k };
    const m = LARG / 2;
    const faixa = (x0: number, a: number, x1: number, b: number, h: number) => {
      const c = (x0 + x1) / 2;
      return `M${x0},${a}C${c},${a} ${c},${b} ${x1},${b}L${x1},${b + h}C${c},${b + h} ${c},${a + h} ${x0},${a + h}Z`;
    };
    const faixas: { d: string; cor: string; nome: string; valor: number }[] = [];
    let y = meio.y;
    for (const n of ne) {
      const h = n.valor * k;
      faixas.push({ d: faixa(8, n.y, m - 4, y, h), cor: n.cor, nome: n.nome, valor: n.valor });
      y += h;
    }
    y = meio.y;
    for (const n of nd) {
      const h = n.valor * k;
      faixas.push({ d: faixa(m + 4, y, LARG - 8, n.y, h), cor: n.cor, nome: n.nome, valor: n.valor });
      y += h;
    }
    const alt = Math.max(ALT, ...[...ne, ...nd].map((n) => n.y + n.h));
    return { esq: ne, dir: nd, meio, faixas, total: te, alt };
  });
}

const soma = (l: Fatia[]) => l.reduce((a, f) => a + f.valor, 0);

export interface Serie {
  nome: string;
  cor: string;
  /** null = sem ponto (linha interrompida) */
  valores: (number | null)[];
  tracejada?: boolean;
}

/** Linhas sobrepostas com rótulos no eixo x (primeiro, último e marcados) */
@Component({
  selector: 'app-curvas',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g">
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" role="img" [attr.aria-label]="rotulo()">
        @if (zero() !== null) { <line class="zero" x1="0" x2="300" [attr.y1]="zero()" [attr.y2]="zero()" /> }
        @if (marca() !== null) { <line class="marca" [attr.x1]="x(marca()!)" [attr.x2]="x(marca()!)" y1="0" y2="100" /> }
        @for (s of linhas(); track s.nome) {
          <path class="linha" [attr.d]="s.d" [attr.stroke]="s.cor" [class.trac]="s.tracejada" />
        }
      </svg>
      @for (s of linhas(); track s.nome) {
        @if (s.fim; as f) { <i class="ponto" [style.left.%]="f.x / 3" [style.top.%]="f.y" [style.border-color]="s.cor"></i> }
      }
    </div>
    <div class="eixo">@for (r of eixo(); track $index) {<span>{{ r }}</span>}</div>
    <div class="leg">
      @for (s of series(); track s.nome) {
        <span><i [style.border-color]="s.cor" [class.trac]="s.tracejada"></i>{{ s.nome }}@if (ultimo(s) !== null) { <b class="num">{{ ultimo(s) | brl }}</b>}</span>
      }
    </div>
  `,
  styles: `
    .g { position: relative; height: 130px; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .linha { fill: none; stroke-width: 2.2; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
    .linha.trac { stroke-dasharray: 5 4; }
    .zero { stroke: var(--danger); stroke-dasharray: 4 4; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.6; }
    .marca { stroke: var(--ink-3); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-dasharray: 2 3; }
    .ponto { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--card); border: 2px solid; }
    .eixo { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--ink-3); font-weight: 600; margin-top: 4px; text-transform: capitalize; }
    .leg { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; margin-top: 10px; font-size: 0.78rem; color: var(--ink-2); }
    .leg i { display: inline-block; width: 14px; border-top: 2.5px solid; margin-right: 5px; vertical-align: 3px; }
    .leg i.trac { border-top-style: dashed; }
    .leg b { margin-left: 4px; color: var(--ink); }
  `,
})
export class Curvas {
  readonly series = input<Serie[]>([]);
  /** rótulos do eixo x: só o primeiro, o do meio e o último aparecem */
  readonly rotulos = input<string[]>([]);
  readonly marca = input<number | null>(null);
  readonly rotulo = input('Gráfico de linhas');

  private n = computed(() => Math.max(1, ...this.series().map((s) => s.valores.length)));
  private faixa = computed(() => {
    const v = this.series().flatMap((s) => s.valores.filter((x): x is number => x !== null));
    const lo = Math.min(0, ...v);
    const hi = Math.max(0, ...v);
    return { lo, hi: hi === lo ? lo + 1 : hi };
  });
  protected zero = computed(() => (this.faixa().lo < 0 ? this.y(0) : null));
  protected eixo = computed(() => {
    const r = this.rotulos();
    return r.length > 2 ? [r[0], r[Math.floor((r.length - 1) / 2)], r[r.length - 1]] : r;
  });

  x(i: number) {
    return (i / Math.max(1, this.n() - 1)) * 300;
  }

  y(v: number) {
    const { lo, hi } = this.faixa();
    return 4 + (1 - (v - lo) / (hi - lo)) * 92;
  }

  ultimo(s: Serie) {
    for (let i = s.valores.length - 1; i >= 0; i--) if (s.valores[i] !== null) return s.valores[i];
    return null;
  }

  protected linhas = computed(() =>
    this.series().map((s) => {
      let d = '';
      let novo = true;
      let fim: { x: number; y: number } | null = null;
      s.valores.forEach((v, i) => {
        if (v === null) return void (novo = true);
        d += `${novo ? 'M' : 'L'}${this.x(i).toFixed(1)},${this.y(v).toFixed(1)}`;
        novo = false;
        fim = { x: this.x(i), y: this.y(v) };
      });
      return { ...s, d, fim: fim as { x: number; y: number } | null };
    }),
  );
}

export interface Retangulo<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Treemap squarified (Bruls et al.): blocos do maior para o menor, cada faixa com a proporção mais perto de quadrado */
export function squarify<T extends { valor: number }>(itens: T[], w: number, h: number): Retangulo<T>[] {
  const l = itens.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = l.reduce((a, i) => a + i.valor, 0);
  const out: Retangulo<T>[] = [];
  if (!total || w <= 0 || h <= 0) return out;
  const k = (w * h) / total;
  const pior = (areas: number[], lado: number) => {
    const s = areas.reduce((a, x) => a + x, 0);
    return Math.max((lado * lado * Math.max(...areas)) / (s * s), (s * s) / (lado * lado * Math.min(...areas)));
  };
  let x = 0, y = 0, W = w, H = h, i = 0;
  while (i < l.length) {
    const lado = Math.min(W, H);
    const faixa = [l[i]];
    const areas = [l[i].valor * k];
    i++;
    while (i < l.length) {
      const a = l[i].valor * k;
      if (pior([...areas, a], lado) > pior(areas, lado)) break;
      faixa.push(l[i]);
      areas.push(a);
      i++;
    }
    const s = areas.reduce((a, v) => a + v, 0);
    const esp = s / lado;
    let pos = 0;
    faixa.forEach((item, j) => {
      const t = areas[j] / esp;
      out.push(W >= H ? { item, x, y: y + pos, w: esp, h: t } : { item, x: x + pos, y, w: t, h: esp });
      pos += t;
    });
    if (W >= H) (x += esp), (W -= esp);
    else (y += esp), (H -= esp);
  }
  return out;
}

export interface BlocoMapa {
  nome: string;
  valor: number;
  cor: string;
  filhos?: { nome: string; valor: number }[];
}

const MAPA_L = 300;
const MAPA_A = 200;

/** Treemap em dois níveis: tocar num bloco com filhos entra nele; a trilha volta para todas */
@Component({
  selector: 'app-treemap',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="trilha" aria-label="Nível do mapa">
      @if (atual(); as a) {
        <button type="button" (click)="aberto.set(null)">Todas</button><span aria-hidden="true">›</span><b>{{ a.nome }}</b>
        <span class="tot">{{ a.valor | brl }}</span>
      } @else {
        <b>Todas</b><span class="tot">{{ total() | brl }}</span>
      }
    </nav>
    @if (blocos().length) {
      <div class="mapa" role="group" [attr.aria-label]="(atual()?.nome ?? 'Todas') + ': ' + ((atual()?.valor ?? total()) | brl)">
        @for (b of blocos(); track $index) {
          @if (b.entra) {
            <button type="button" class="b" [style.left.%]="b.x" [style.top.%]="b.y" [style.width.%]="b.w" [style.height.%]="b.h" [style.background]="b.cor"
              (click)="aberto.set(b.nome)" [attr.aria-label]="b.nome + ': ' + (b.valor | brl) + ', ver detalhes'">
              <span class="r"><b>{{ b.nome }}</b><small>{{ b.valor | brl }} · {{ b.pct }}%</small></span>
            </button>
          } @else {
            <div class="b" role="img" [style.left.%]="b.x" [style.top.%]="b.y" [style.width.%]="b.w" [style.height.%]="b.h" [style.background]="b.cor"
              [attr.aria-label]="b.nome + ': ' + (b.valor | brl)" [title]="b.nome + ': ' + (b.valor | brl)">
              <span class="r"><b>{{ b.nome }}</b><small>{{ b.valor | brl }} · {{ b.pct }}%</small></span>
            </div>
          }
        }
      </div>
    } @else {
      <p class="vazio">Nada no período.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .trilha { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; font-size: 0.85rem; color: var(--ink-2); }
    .trilha button { background: none; border: 0; padding: 0; font: inherit; font-weight: 700; color: var(--primary); cursor: pointer; }
    .trilha b { color: var(--ink); }
    .tot { margin-left: auto; font-variant-numeric: tabular-nums; }
    .mapa { position: relative; width: 100%; aspect-ratio: 3 / 2; max-width: 720px; margin: 0 auto; border-radius: 12px; overflow: hidden; }
    .b {
      position: absolute; box-sizing: border-box; border: 1.5px solid var(--card); border-radius: 6px; padding: 6px; margin: 0;
      color: #fff; font: inherit; text-align: left; overflow: hidden; container-type: size;
      transition: left 0.3s, top 0.3s, width 0.3s, height 0.3s;
    }
    button.b { cursor: pointer; }
    button.b:hover { filter: brightness(1.08); }
    button.b:focus-visible { outline: 2px solid var(--ink); outline-offset: -3px; }
    .r { display: flex; flex-direction: column; gap: 1px; min-width: 0; text-shadow: 0 1px 2px rgb(0 0 0 / 0.35); }
    .r b, .r small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .r b { font-size: 0.8rem; }
    .r small { font-size: 0.7rem; opacity: 0.92; font-variant-numeric: tabular-nums; }
    @container (max-height: 44px) { .r small { display: none; } }
    @container (max-width: 56px) or (max-height: 26px) { .r { display: none; } }
    .vazio { text-align: center; color: var(--ink-2); padding: 24px 0; margin: 0; }
    @media (prefers-reduced-motion: reduce) { .b { transition: none; } }
  `,
})
export class Treemap {
  readonly itens = input<BlocoMapa[]>([]);
  protected aberto = signal<string | null>(null);
  protected total = computed(() => this.itens().reduce((a, i) => a + Math.max(0, i.valor), 0));
  protected atual = computed(() => this.itens().find((i) => i.nome === this.aberto() && i.filhos?.length) ?? null);

  protected blocos = computed(() => {
    const a = this.atual();
    // filhos herdam a cor da categoria, do tom cheio ao mais escuro
    const fonte: (BlocoMapa & { entra: boolean })[] = a
      ? a.filhos!.filter((f) => f.valor > 0).sort((x, y) => y.valor - x.valor).map((f, i, l) => ({
          ...f,
          cor: `color-mix(in srgb, ${a.cor} ${l.length > 1 ? Math.round(100 - (45 * i) / (l.length - 1)) : 100}%, #0b1220)`,
          entra: false,
        }))
      : this.itens().map((i) => ({ ...i, entra: !!i.filhos?.length }));
    const total = a ? a.valor : this.total();
    return squarify(fonte, MAPA_L, MAPA_A).map((r) => ({
      ...r.item,
      pct: total > 0 ? Math.round((r.item.valor / total) * 100) : 0,
      x: (r.x / MAPA_L) * 100,
      y: (r.y / MAPA_A) * 100,
      w: (r.w / MAPA_L) * 100,
      h: (r.h / MAPA_A) * 100,
    }));
  });
}

/** Semanas do ano em colunas (domingo a sábado), dias fora do ano = null; `meses` = coluna onde cai o dia 1 */
export function semanasDoAno(ano: number) {
  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const colunas: (string | null)[][] = [];
  const meses: { col: number; mes: string }[] = [];
  for (let d = addDias(ini, -parse(ini).getDay()); d <= fim; ) {
    const col: (string | null)[] = [];
    for (let i = 0; i < 7; i++, d = addDias(d, 1)) {
      const dentro = d >= ini && d <= fim;
      col.push(dentro ? d : null);
      if (dentro && d.endsWith('-01')) meses.push({ col: colunas.length, mes: d });
    }
    colunas.push(col);
  }
  return { colunas, meses };
}
