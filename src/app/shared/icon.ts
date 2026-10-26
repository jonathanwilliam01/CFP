import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Material Symbols Rounded: name = nome do símbolo (fonts.google.com/icons); outro texto (emoji antigo) sai como está */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class.msr]="simbolo()" [style.font-size.px]="size()" [class.fill]="fill()" aria-hidden="true">{{ name() }}</span>`,
  styles: ':host{display:inline-flex;flex-shrink:0;line-height:1}',
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(22);
  readonly fill = input(false);
  protected simbolo = computed(() => /^[a-z0-9_]+$/.test(this.name()));
}
