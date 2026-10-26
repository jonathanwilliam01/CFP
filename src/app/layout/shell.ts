import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../core/auth';
import { Chat } from '../core/chat';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Tema } from '../core/tema';
import { VERSAO } from '../core/versao';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';
import { Lancar, LancarSheet } from '../shared/lancar';
import { MesPicker } from '../shared/mes-picker';
import { Conta } from './conta';
import { ATALHOS, PRINCIPAIS } from './menu';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar, Icon, MesPicker, LancarSheet, Conta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.recolhido]': 'recolhido()' },
  template: `
    <header class="top">
      <div class="marca">
        <a routerLink="/" class="logo" aria-label="Início">CFP</a>
        <button type="button" class="user" (click)="conta.set(true)" aria-label="Minha conta">
          <app-avatar />
          <span class="nome">{{ auth.nome() }}</span>
        </button>
      </div>
      <app-mes-picker />
      <div class="acoes">
        <button type="button" class="bell" (click)="tema.alternar()" [attr.aria-label]="tema.escuro() ? 'Tema claro' : 'Tema escuro'">
          <app-icon [name]="tema.escuro() ? 'light_mode' : 'dark_mode'" [size]="20" />
        </button>
        <a routerLink="/chat" class="bell" aria-label="Chat">
          <app-icon name="chat" />
          @if (chat.naoLidas(); as n) {
            <span class="dot">{{ n }}</span>
          }
        </a>
        <a routerLink="/notificacoes" class="bell" aria-label="Notificações">
          <app-icon name="notifications" />
          @if (insights.naoLidas().length; as n) {
            <span class="dot">{{ n }}</span>
          }
        </a>
      </div>
    </header>

    <aside class="side">
      <button class="btn block lanca" type="button" (click)="lancar.novo()" title="Lançamento">
        <app-icon name="add" [size]="20" /><span class="r">Lançamento</span>
      </button>
      <nav>
        @for (m of principais; track m.rota) {
          <a [routerLink]="m.rota" routerLinkActive="on" #rla="routerLinkActive" [routerLinkActiveOptions]="{ exact: m.rota === '/' }" [title]="m.rotulo">
            <app-icon [name]="m.icone" [fill]="rla.isActive" /><span class="r">{{ m.rotulo }}</span>
          </a>
        }
        <hr />
        @for (m of atalhos; track m.rota) {
          <a [routerLink]="m.rota" routerLinkActive="on" #rla="routerLinkActive" [title]="m.rotulo">
            <app-icon [name]="m.icone" [fill]="rla.isActive" /><span class="r">{{ m.rotulo }}</span>
            @if (badge(m.rota); as n) {
              <span class="n">{{ n }}</span>
            }
          </a>
        }
      </nav>
      <div class="pe">
        <button type="button" class="recolher" (click)="alternarMenu()" [title]="recolhido() ? 'Expandir menu' : 'Recolher menu'">
          <app-icon [name]="recolhido() ? 'left_panel_open' : 'left_panel_close'" /><span class="r">Recolher menu</span>
        </button>
        <a class="versao r" routerLink="/novidades">CFP {{ versao }} · Novidades</a>
      </div>
    </aside>

    <main><router-outlet /></main>

    <button class="fab" type="button" (click)="lancar.novo()" aria-label="Lançar gasto">
      <app-icon name="add" [size]="28" />
    </button>

    <nav class="nav">
      <a routerLink="/" routerLinkActive="on" #r1="routerLinkActive" [routerLinkActiveOptions]="{ exact: true }"><app-icon name="home" [fill]="r1.isActive" /><span>Início</span></a>
      <a routerLink="/gastos" routerLinkActive="on" #r2="routerLinkActive"><app-icon name="receipt_long" [fill]="r2.isActive" /><span>Gastos</span></a>
      <span class="gap"></span>
      <a routerLink="/contas" routerLinkActive="on" #r3="routerLinkActive"><app-icon name="calendar_month" [fill]="r3.isActive" /><span>Contas</span></a>
      <a routerLink="/mais" routerLinkActive="on" #r4="routerLinkActive"><app-icon name="apps" [fill]="r4.isActive" /><span>Mais</span></a>
    </nav>

    <app-lancar />

    <app-conta [(open)]="conta" />
  `,
  styles: `
    .top {
      position: sticky; top: 0; z-index: 20;
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px;
      padding: calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px;
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(12px);
    }
    .marca { display: flex; align-items: center; gap: 6px; }
    .logo {
      font-weight: 800; font-size: 1.05rem; letter-spacing: 0.04em; color: var(--primary-ink);
      background: var(--primary); border-radius: 10px; padding: 6px 9px;
    }
    .user {
      display: flex; align-items: center; gap: 8px; border: 0; background: none; padding: 2px;
      font: inherit; font-weight: 700; color: var(--ink); cursor: pointer; border-radius: 999px;
    }
    .nome { display: none; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acoes { display: flex; justify-self: end; }
    .bell { position: relative; color: var(--ink); padding: 8px 6px; display: grid; place-items: center; background: none; border: 0; cursor: pointer; }
    .dot {
      position: absolute; top: 2px; right: 0; min-width: 18px; height: 18px; border-radius: 9px;
      background: var(--danger); color: #fff; font-size: 0.68rem; font-weight: 800;
      display: grid; place-items: center; padding: 0 4px; border: 2px solid var(--bg);
    }
    .nav {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
      height: calc(var(--nav-h) + var(--safe-b)); padding-bottom: var(--safe-b);
      display: flex; background: var(--card); border-top: 1px solid var(--line);
    }
    .nav a {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
      color: var(--ink-3); font-size: 0.7rem; font-weight: 700;
    }
    .nav a.on { color: var(--primary); }
    .gap { width: 76px; flex-shrink: 0; }
    .fab {
      position: fixed; z-index: 31; left: 50%; transform: translateX(-50%);
      bottom: calc(var(--safe-b) + 22px);
      width: 62px; height: 62px; border-radius: 20px; border: 0; cursor: pointer;
      background: var(--primary); color: var(--primary-ink);
      display: grid; place-items: center;
      box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 45%, transparent);
      transition: transform 0.1s;
    }
    .fab:active { transform: translateX(-50%) scale(0.93); }
    .side { display: none; }
    @media (min-width: 720px) {
      .nome { display: block; }
      .nav { max-width: 720px; margin: 0 auto 12px; border: 1px solid var(--line); border-radius: 20px; }
      .fab { bottom: 34px; }
    }
    /* desktop: menu lateral no lugar da barra inferior */
    @media (min-width: 1024px) {
      :host.recolhido { --side-w: 76px; }
      .nav, .fab { display: none; }
      .top { padding-left: calc(var(--side-w) + 24px); padding-right: 24px; }
      main { display: block; margin-left: var(--side-w); }
      .top, main { transition: margin 0.2s, padding 0.2s; }
      .side {
        position: fixed; top: 0; bottom: 0; left: 0; z-index: 25; width: var(--side-w);
        display: flex; flex-direction: column; gap: 12px; padding: 16px 12px 0;
        background: var(--card); border-right: 1px solid var(--line); transition: width 0.2s;
      }
      .side nav { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; }
      .side nav a, .recolher {
        position: relative; display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: 10px;
        color: var(--ink-2); font-weight: 600; font-size: 0.92rem; white-space: nowrap;
      }
      .side nav a:hover, .recolher:hover { background: var(--card-2); color: var(--ink); }
      .side nav a.on { background: var(--primary-soft); color: var(--primary); font-weight: 700; }
      .side hr { border: 0; border-top: 1px solid var(--line); margin: 8px 4px; }
      .side .n {
        margin-left: auto; min-width: 20px; height: 20px; border-radius: 10px; padding: 0 5px;
        background: var(--danger); color: #fff; font-size: 0.7rem; font-weight: 800; display: grid; place-items: center;
      }
      .pe { border-top: 1px solid var(--line); padding: 8px 0 12px; display: flex; flex-direction: column; gap: 4px; }
      .recolher { border: 0; background: none; font: inherit; cursor: pointer; width: 100%; }
      .versao { text-align: center; font-size: 0.78rem; color: var(--ink-3); font-weight: 600; padding: 4px; white-space: nowrap; }
      :host.recolhido .r { display: none; }
      :host.recolhido .side nav a, :host.recolhido .recolher { justify-content: center; padding: 10px 0; }
      :host.recolhido .lanca { padding: 0; }
      :host.recolhido .side .n { position: absolute; top: 2px; right: 6px; min-width: 16px; height: 16px; font-size: 0.62rem; }
    }
  `,
})
export class Shell {
  protected s = inject(Store);
  protected auth = inject(Auth);
  protected insights = inject(Insights);
  protected chat = inject(Chat);
  protected lancar = inject(Lancar);
  protected tema = inject(Tema);

  protected principais = PRINCIPAIS;
  protected atalhos = ATALHOS;
  protected versao = VERSAO;
  protected conta = signal(false);
  protected recolhido = signal(localStorage.getItem('cfp.menu') === 'recolhido');

  badge(rota: string) {
    return rota === '/notificacoes' ? this.insights.naoLidas().length : rota === '/chat' ? this.chat.naoLidas() : 0;
  }

  alternarMenu() {
    this.recolhido.update((v) => !v);
    localStorage.setItem('cfp.menu', this.recolhido() ? 'recolhido' : '');
  }
}
