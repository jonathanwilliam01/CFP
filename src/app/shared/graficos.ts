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
