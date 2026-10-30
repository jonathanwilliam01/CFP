import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export const RELATORIOS = [
  { rota: '/relatorios', rotulo: 'Relatórios' },
  { rota: '/resumo', rotulo: 'Resumo mensal' },
  { rota: '/retrospectiva', rotulo: 'Retrospectiva' },
];

export const ENTRADAS = [
  { rota: '/entradas', rotulo: 'Entradas' },
  { rota: '/receber', rotulo: 'A receber' },
];

/** Abas entre telas irmãs (cada uma segue com a própria rota) */
@Component({
  selector: 'app-abas',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="seg no-print">
      @for (a of abas(); track a.rota) {
        <a [routerLink]="a.rota" routerLinkActive="on" [replaceUrl]="true">{{ a.rotulo }}</a>
      }
    </nav>
  `,
  styles: `
    .seg a { text-decoration: none; }
  `,
})
export class Abas {
  readonly abas = input.required<{ rota: string; rotulo: string }[]>();
}
