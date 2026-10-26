import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { addMeses, mesAtual } from '../core/datas';
import { MesPipe } from '../core/formato';
import { Store } from '../core/store';
import { Icon } from './icon';

@Component({
  selector: 'app-mes-picker',
  imports: [Icon, MesPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="mover(-1)" aria-label="Mês anterior"><app-icon name="chevron_left" [size]="18" /></button>
    <button type="button" class="m" (click)="s.mes.set(atual)" [class.fora]="!noAtual()">{{ s.mes() | mes }}</button>
    <button type="button" (click)="mover(1)" aria-label="Próximo mês"><app-icon name="chevron_right" [size]="18" /></button>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
    button { border: 0; background: none; color: var(--ink); font: inherit; cursor: pointer; padding: 8px; display: grid; place-items: center; }
    .m { font-weight: 700; font-size: 0.9rem; text-transform: capitalize; min-width: 118px; padding: 8px 2px; }
    .fora { color: var(--primary); }
    @media (max-width: 380px) { .m { min-width: 96px; font-size: 0.82rem; } button { padding: 8px 4px; } }
  `,
})
export class MesPicker {
  protected s = inject(Store);
  protected atual = mesAtual();
  protected noAtual = computed(() => this.s.mes() === this.atual);
  mover(n: number) {
    this.s.mes.update((m) => addMeses(m, n));
  }
}
