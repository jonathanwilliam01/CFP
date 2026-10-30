import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Chat } from '../core/chat';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { VERSAO } from '../core/versao';
import { CHAT, Menus } from '../layout/menu';
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

      @for (g of grupos(); track g.nome) {
        <h2 class="grupo">{{ g.nome }}</h2>
        <div class="grid">
          @for (a of g.itens; track a.rota) {
            <a class="card at" [routerLink]="a.rota">
              <app-icon class="e" [name]="a.icone" [size]="30" />
              <span class="r">{{ a.rotulo }}</span>
              @if (badge(a.rota); as n) {
                <span class="n">{{ n }}</span>
              }
            </a>
          }
        </div>
      }

      <a class="org" routerLink="/config"><app-icon name="tune" [size]="16" />Organizar o menu em Configurações</a>
      <a class="versao" routerLink="/novidades">CFP {{ versao }} · Novidades</a>
    </div>
  `,
  styles: `
    .grupo { font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); margin: 6px 2px -4px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .at { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 8px; color: var(--ink); text-align: center; }
    .at:active { transform: scale(0.97); }
    .e { color: var(--primary); }
    .r { font-size: 0.8rem; font-weight: 700; }
    .n { position: absolute; top: 8px; right: 8px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--danger); color: #fff; font-size: 0.68rem; font-weight: 800; display: grid; place-items: center; padding: 0 4px; }
    .org { align-self: center; display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 700; padding-top: 4px; }
    .versao { align-self: center; font-size: 0.8rem; color: var(--ink-3); font-weight: 600; padding: 12px; }
    @media (min-width: 720px) { .grid { grid-template-columns: repeat(4, 1fr); } }
  `,
})
export default class Mais {
  protected s = inject(Store);
  protected insights = inject(Insights);
  private chat = inject(Chat);
  private menus = inject(Menus);
  /** Chat entra no primeiro grupo (no celular não fica na barra inferior) */
  protected grupos = computed(() => this.menus.visiveis().map((g, i) => (i ? g : { ...g, itens: [CHAT, ...g.itens] })));
  protected versao = VERSAO;

  badge(rota: string) {
    return rota === '/notificacoes' ? this.insights.naoLidas().length : rota === '/chat' ? this.chat.naoLidas() : 0;
  }
}
