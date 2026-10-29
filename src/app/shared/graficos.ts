import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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
