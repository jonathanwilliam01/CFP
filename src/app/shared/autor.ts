import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Store } from '../core/store';
import { Avatar } from './avatar';

/** Selo de quem lançou: foto/iniciais pequenas com o nome no title; some em carteira de uma pessoa só */
@Component({
  selector: 'app-autor',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (m(); as m) { <app-avatar [size]="size()" [nome]="m.nome" [foto]="m.foto ?? null" [attr.title]="m.nome" [attr.aria-label]="'Lançado por ' + m.nome" /> }`,
  styles: `:host { display: inline-flex; flex-shrink: 0; vertical-align: middle; }`,
})
export class Autor {
  private s = inject(Store);
  readonly id = input<string | null | undefined>();
  readonly size = input(18);
  protected m = computed(() => (this.s.membros().length > 1 && this.id() ? this.s.membroPorId().get(this.id()!) ?? null : null));
}
