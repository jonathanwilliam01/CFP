import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export const RELATORIOS = [
  { rota: '/relatorios', rotulo: 'Visão geral' },
  { rota: '/resumo', rotulo: 'Resumo mensal' },
  { rota: '/retrospectiva', rotulo: 'Retrospectiva' },
  { rota: '/inflacao', rotulo: 'Inflação' },
  { rota: '/imposto', rotulo: 'Imposto de Renda' },
];

export const ENTRADAS = [
  { rota: '/entradas', rotulo: 'Do mês' },
  { rota: '/receber', rotulo: 'A receber' },
];

/** Título do grupo, ações da tela (conteúdo) e abas entre telas irmãs (cada uma segue com a própria rota) */
@Component({
  selector: 'app-abas',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <h1>{{ titulo() }}</h1>
      <div class="acoes no-print"><ng-content /></div>
    </div>
    <nav class="seg no-print">
      @for (a of abas(); track a.rota) {
        <a [routerLink]="a.rota" routerLinkActive="on" [replaceUrl]="true">{{ a.rotulo }}</a>
      }
    </nav>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 14px; }
    /* muitas abas: rolam de lado no celular */
    .seg { overflow-x: auto; scrollbar-width: none; }
    .seg a { text-decoration: none; flex: 1 0 auto; }
    .acoes { display: flex; gap: 6px; align-items: center; }
  `,
})
export class Abas {
  readonly titulo = input.required<string>();
  readonly abas = input.required<{ rota: string; rotulo: string }[]>();
}
