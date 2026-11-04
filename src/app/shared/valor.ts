import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { BrlPipe } from '../core/formato';

const calmo = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

/** Valor em reais que corre do anterior até o novo (troca de mês, lançamento); sem animação se o sistema pedir */
@Component({
  selector: 'app-valor',
  imports: [BrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ mostrado() | brl }}`,
})
export class Valor {
  readonly v = input(0);
  protected mostrado = signal(0);
  private quadro = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.quadro));
    effect(() => {
      const alvo = this.v();
      untracked(() => this.correr(alvo));
    });
  }

  private correr(alvo: number) {
    cancelAnimationFrame(this.quadro);
    const de = this.mostrado();
    if (calmo() || de === alvo) return this.mostrado.set(alvo);
    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / 450);
      const e = 1 - Math.pow(1 - p, 3);
      this.mostrado.set(p < 1 ? Math.round((de + (alvo - de) * e) * 100) / 100 : alvo);
      if (p < 1) this.quadro = requestAnimationFrame(passo);
    };
    this.quadro = requestAnimationFrame(passo);
  }
}
