import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { parse } from '../core/datas';
import { NOTAS } from '../core/versao';
import { Icon } from '../shared/icon';

@Component({
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <a routerLink="/mais" class="btn ghost icon" aria-label="Voltar"><app-icon name="chevron_left" [size]="18" /></a>
        <h1 class="grow">Novidades</h1>
      </div>

      @for (n of notas; track n.versao; let primeira = $first) {
        <div class="card">
          <div class="card-head">
            <h2>{{ n.versao }}</h2>
            @if (primeira) { <span class="badge ok">Atual</span> }
          </div>
          <p class="small muted">{{ data(n.data) }}</p>
          <ul>
            @for (i of n.itens; track i) {
              <li>{{ i }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: `
    .grow { flex: 1; }
    ul { margin: 10px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
  `,
})
export default class Novidades {
  protected notas = NOTAS;
  data(d: string) {
    return parse(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
