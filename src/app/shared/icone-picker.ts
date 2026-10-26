import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { Icon } from './icon';

const ICONES = [
  'shopping_cart', 'restaurant', 'lunch_dining', 'local_cafe', 'local_bar', 'bakery_dining',
  'directions_car', 'car_repair', 'local_gas_station', 'directions_bus', 'two_wheeler', 'local_parking', 'flight',
  'home', 'bolt', 'water_drop', 'wifi', 'phone_iphone', 'construction',
  'medical_services', 'medication', 'fitness_center', 'spa', 'content_cut', 'checkroom',
  'celebration', 'sports_esports', 'movie', 'music_note', 'beach_access', 'park',
  'shopping_bag', 'redeem', 'school', 'menu_book', 'child_care', 'pets',
  'subscriptions', 'tv', 'payments', 'attach_money', 'savings', 'account_balance',
  'credit_card', 'receipt_long', 'trending_up', 'work', 'volunteer_activism', 'church',
  'sell', 'inventory_2', 'build', 'handyman', 'favorite', 'star',
];

/** Grade de ícones Material para escolher o ícone de categorias, cofrinhos e registros */
@Component({
  selector: 'app-icone-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (i of icones; track i) {
      <button type="button" [class.on]="valor() === i" [style.--c]="cor()" (click)="valor.set(i)" [attr.aria-label]="i" [title]="i">
        <app-icon [name]="i" [fill]="valor() === i" />
      </button>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 6px; max-height: 196px; overflow-y: auto; }
    button {
      height: 42px; border-radius: 10px; border: 1px solid var(--line); background: var(--card-2);
      color: var(--ink-2); display: grid; place-items: center; cursor: pointer;
    }
    button.on { border-color: var(--c, var(--primary)); color: var(--c, var(--primary)); background: color-mix(in srgb, var(--c, var(--primary)) 14%, transparent); }
  `,
})
export class IconePicker {
  readonly valor = model('sell');
  readonly cor = input<string | null>(null);
  protected icones = ICONES;
}
