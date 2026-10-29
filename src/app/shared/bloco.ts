import { Directive, inject, input } from '@angular/core';
import { Bloco as Id, Painel } from '../core/painel';

/** Bloco do Início: posição, oculto e recolhido (toque no título) conforme as preferências */
@Directive({
  selector: '[bloco]',
  host: {
    '[style.order]': 'painel.pos(bloco())',
    '[style.display]': 'painel.oculto(bloco()) ? "none" : null',
    '[class.fechado]': 'painel.fechado(bloco())',
    '(click)': 'clique($event)',
  },
})
export class Bloco {
  protected painel = inject(Painel);
  readonly bloco = input.required<Id>();

  clique(e: Event) {
    if (!(e.target as Element).closest('.card-head h2')) return;
    e.preventDefault();
    this.painel.alternarFechado(this.bloco());
  }
}
