import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import { Icon } from './icon';
import { Lancar } from './lancar';
import { Toast } from './toast';

const OPS = '+−×÷';

/** Avalia "12,5 + 10% × 3": × e ÷ antes de + e −; "a + b%" soma b% de a */
export function calcular(expr: string): number | null {
  const tokens = expr.replace(/\s/g, '').match(/\d+(?:,\d*)?%?|[+−×÷]/g);
  if (!tokens) return null;
  let soma = 0;
  let termo: number | null = null;
  let sinal = 1;
  let opMul: '×' | '÷' | null = null;
  for (const t of tokens) {
    if (OPS.includes(t)) {
      if (t === '+' || t === '−') {
        if (termo !== null) soma += sinal * termo;
        termo = null;
        opMul = null;
        sinal = t === '+' ? 1 : -1;
      } else opMul = t as '×' | '÷';
      continue;
    }
    let n = Number(t.replace('%', '').replace(',', '.'));
    if (t.endsWith('%')) n = opMul || (termo === null && soma === 0) ? n / 100 : (soma * n) / 100;
    if (opMul && termo !== null) termo = opMul === '×' ? termo * n : n === 0 ? NaN : termo / n;
    else termo = n;
    opMul = null;
  }
  const r = soma + (termo !== null ? sinal * termo : 0);
  return Number.isFinite(r) ? Math.round(r * 1e8) / 1e8 : null;
}

/** Calculadora rápida (botão flutuante): conta simples e lançar o resultado */
@Component({
  selector: 'app-calculadora',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'tecla($event)' },
  template: `
    @if (open()) {
      <div class="back" (click)="open.set(false)"></div>
      <div class="calc" role="dialog" aria-label="Calculadora">
        <div class="visor">
          <div class="expr">{{ expr() || '0' }}</div>
          <div class="res num">{{ previa() }}</div>
        </div>
        <div class="teclas">
          @for (t of teclas; track t) {
            <button type="button" [class.op]="ops.includes(t) || t === '%'" [class.ig]="t === '='" [class.lim]="t === 'C'" (click)="apertar(t)">
              @if (t === '⌫') { <app-icon name="backspace" [size]="20" /> } @else { {{ t }} }
            </button>
          }
        </div>
        <div class="acoes">
          <button type="button" class="btn ghost sm" (click)="copiar()" [disabled]="resultado() === null"><app-icon name="content_copy" [size]="16" />Copiar</button>
          <button type="button" class="btn sm" (click)="lancarValor()" [disabled]="!resultado()"><app-icon name="add" [size]="16" />Lançar</button>
        </div>
      </div>
    }
  `,
  styles: `
    .back { position: fixed; inset: 0; z-index: 33; }
    .calc {
      position: fixed; z-index: 34; right: 12px; bottom: calc(var(--nav-h) + var(--safe-b) + 12px); width: min(300px, calc(100vw - 24px));
      background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 12px; box-shadow: 0 14px 40px rgb(0 0 0 / 0.25);
      display: flex; flex-direction: column; gap: 10px; animation: sobe 0.15s;
    }
    @keyframes sobe { from { opacity: 0; transform: translateY(10px); } }
    .visor { background: var(--card-2); border-radius: 14px; padding: 10px 12px; text-align: right; min-height: 68px; }
    .expr { font-size: 1rem; color: var(--ink-2); word-break: break-all; }
    .res { font-size: 1.5rem; font-weight: 800; color: var(--ink); }
    .teclas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .teclas button {
      height: 46px; border: 0; border-radius: 12px; background: var(--card-2); color: var(--ink); font: inherit; font-size: 1.1rem; font-weight: 700;
      cursor: pointer; display: grid; place-items: center; user-select: none;
    }
    .teclas button:active { transform: scale(0.95); }
    .teclas .op { color: var(--primary); background: var(--primary-soft); }
    .teclas .ig { background: var(--primary); color: var(--primary-ink); }
    .teclas .lim { color: var(--danger); }
    .acoes { display: flex; gap: 8px; }
    .acoes .btn { flex: 1; }
    @media (min-width: 720px) { .calc { bottom: 100px; right: 24px; } }
    @media (min-width: 1024px) { .calc { bottom: 156px; } }
  `,
})
export class Calculadora {
  private lancar = inject(Lancar);
  private toast = inject(Toast);
  readonly open = model(false);
  protected ops = OPS;
  protected teclas = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '00', '='];
  protected expr = signal('');
  protected resultado = computed(() => calcular(this.expr()));
  protected previa = computed(() => {
    const r = this.resultado();
    return r === null ? '' : r.toLocaleString('pt-BR', { maximumFractionDigits: 8 });
  });

  apertar(t: string) {
    const e = this.expr();
    const ult = e.slice(-1);
    if (t === 'C') return this.expr.set('');
    if (t === '⌫') return this.expr.set(e.slice(0, -1));
    if (t === '=') {
      const r = this.resultado();
      return this.expr.set(r === null ? '' : String(r).replace('.', ',').replace('-', '−'));
    }
    if (OPS.includes(t)) {
      if (!e) return t === '−' ? this.expr.set('−') : undefined;
      return this.expr.set(OPS.includes(ult) ? e.slice(0, -1) + t : e + t);
    }
    if (t === '%') return /\d$/.test(e) ? this.expr.set(e + t) : undefined;
    if (t === ',') {
      const num = e.split(/[+−×÷]/).pop() ?? '';
      if (num.includes(',')) return;
      return this.expr.set(e + (/\d$/.test(e) ? ',' : '0,'));
    }
    if (ult === '%') return;
    this.expr.set(e + t);
  }

  /** Teclado do computador com a calculadora aberta */
  tecla(e: KeyboardEvent) {
    if (!this.open() || e.ctrlKey || e.metaKey || e.altKey) return;
    const mapa: Record<string, string> = { '*': '×', x: '×', '/': '÷', '-': '−', '.': ',', Enter: '=', Backspace: '⌫', Delete: 'C' };
    if (e.key === 'Escape') return this.open.set(false);
    const t = mapa[e.key] ?? e.key;
    if (!this.teclas.includes(t)) return;
    e.preventDefault();
    this.apertar(t);
  }

  async copiar() {
    try {
      await navigator.clipboard.writeText(String(this.resultado()).replace('.', ','));
      this.toast.ok('Resultado copiado');
    } catch {
      this.toast.erro('Não deu para copiar');
    }
  }

  lancarValor() {
    const r = this.resultado();
    if (!r) return;
    this.open.set(false);
    this.lancar.deTexto(Math.abs(r).toFixed(2).replace('.', ','));
  }
}
