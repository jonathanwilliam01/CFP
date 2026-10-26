import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { VERSAO } from '../core/versao';
import { ATALHOS } from '../layout/menu';
import { Icon } from '../shared/icon';

@Component({
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Mais</h1>
        <span class="badge">{{ s.carteira()?.nome }}</span>
      </div>

      <div class="grid">
        @for (a of atalhos; track a.rota) {
          <a class="card at" [routerLink]="a.rota">
            <app-icon class="e" [name]="a.icone" [size]="30" />
            <span class="r">{{ a.rotulo }}</span>
            @if (a.rota === '/notificacoes' && insights.naoLidas().length) {
              <span class="n">{{ insights.naoLidas().length }}</span>
            }
          </a>
        }
      </div>

      <a class="versao" routerLink="/novidades">CFP {{ versao }} · Novidades</a>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .at { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 8px; color: var(--ink); text-align: center; }
    .at:active { transform: scale(0.97); }
    .e { color: var(--primary); }
    .r { font-size: 0.8rem; font-weight: 700; }
    .n { position: absolute; top: 8px; right: 8px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--danger); color: #fff; font-size: 0.68rem; font-weight: 800; display: grid; place-items: center; padding: 0 4px; }
    .versao { align-self: center; font-size: 0.8rem; color: var(--ink-3); font-weight: 600; padding: 12px; }
    @media (min-width: 720px) { .grid { grid-template-columns: repeat(4, 1fr); } }
  `,
})
export default class Mais {
  protected s = inject(Store);
  protected insights = inject(Insights);
  protected atalhos = ATALHOS;
  protected versao = VERSAO;
}
