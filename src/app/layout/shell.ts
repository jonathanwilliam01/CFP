import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Auth } from '../core/auth';
import { Chat } from '../core/chat';
import { Fila } from '../core/fila';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Tema } from '../core/tema';
import { VERSAO } from '../core/versao';
import { alternarPrivado, privado } from '../core/formato';
import { Avatar } from '../shared/avatar';
import { Buscador } from '../shared/buscador';
import { Calculadora } from '../shared/calculadora';
import { Icon } from '../shared/icon';
import { Lancar, LancarSheet, Modo } from '../shared/lancar';
import { MesPicker } from '../shared/mes-picker';
import { Avisos } from './avisos';
import { Conta } from './conta';
import { Menus, PRINCIPAIS } from './menu';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar, Icon, MesPicker, LancarSheet, Conta, Buscador, Avisos, Calculadora],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.recolhido]': 'recolhido()', '(document:keydown)': 'atalho($event)' },
  template: `
    <header class="top">
      <div class="marca">
        <button type="button" class="user" (click)="conta.set(true)" aria-label="Minha conta">
          <app-avatar />
          <span class="nome">{{ auth.nome() }}</span>
        </button>
      </div>
      <app-mes-picker />
      <div class="acoes">
        @if (fila.itens().length; as n) {
          <button type="button" class="bell" (click)="fila.enviar()" [attr.aria-label]="n + ' lançamento(s) esperando internet'" [title]="n + ' lançamento(s) esperando internet. Toque para tentar enviar'">
            <app-icon name="cloud_upload" />
            <span class="dot espera">{{ n }}</span>
          </button>
        }
        <button type="button" class="bell" [class.on]="pop() === 'busca'" (click)="abrir('busca')" aria-label="Buscar" title="Buscar"><app-icon name="search" [size]="20" /></button>
        <button type="button" class="bell" (click)="alternarPrivado()" [attr.aria-label]="privado() ? 'Mostrar valores' : 'Esconder valores'">
          <app-icon [name]="privado() ? 'visibility_off' : 'visibility'" [size]="20" />
        </button>
        <button type="button" class="bell" [class.on]="pop() === 'avisos'" (click)="abrir('avisos')" aria-label="Notificações" title="Notificações">
          <app-icon name="notifications" [fill]="pop() === 'avisos'" />
          @if (insights.naoLidas().length; as n) {
            <span class="dot">{{ n }}</span>
          }
        </button>
      </div>
      @if (pop(); as p) {
        <div class="pop" [class.larga]="p === 'busca'" role="dialog" [attr.aria-label]="p === 'busca' ? 'Buscar' : 'Notificações'">
          @if (p === 'busca') {
            <app-buscador (fechar)="pop.set(null)" />
          } @else {
            <app-avisos (fechar)="pop.set(null)" />
          }
        </div>
      }
    </header>
    @if (pop()) {
      <div class="pop-back" (click)="pop.set(null)"></div>
    }

    <aside class="side">
      <a routerLink="/" class="side-marca" aria-label="Início">
        <span class="logo">CFP</span>
        <span class="r">Controle Financeiro Pessoal</span>
      </a>
      <button class="btn block lanca" type="button" (click)="lancar.novo()" aria-label="Lançamento" (mouseenter)="dica($event, 'Lançamento (N)')" (mouseleave)="tip.set(null)">
        <app-icon name="add" [size]="20" /><span class="r">Lançamento</span>
      </button>
      <nav>
        <div class="grupo"><span class="r">Principal</span></div>
        @for (m of principais; track m.rota) {
          <a [routerLink]="m.rota" routerLinkActive="on" #rla="routerLinkActive" [routerLinkActiveOptions]="{ exact: m.rota === '/' }" [attr.aria-label]="m.rotulo" (mouseenter)="dica($event, m.rotulo)" (mouseleave)="tip.set(null)">
            <app-icon [name]="m.icone" [fill]="rla.isActive" /><span class="r">{{ m.rotulo }}</span>
            @if (badge(m.rota); as n) {
              <span class="n">{{ n }}</span>
            }
          </a>
        }
        @for (g of menus.visiveis(); track g.nome) {
          <div class="grupo"><span class="r">{{ g.nome }}</span></div>
          @for (m of g.itens; track m.rota) {
            <a [routerLink]="m.rota" routerLinkActive="on" #rla="routerLinkActive" [attr.aria-label]="m.rotulo" (mouseenter)="dica($event, m.rotulo)" (mouseleave)="tip.set(null)">
              <app-icon [name]="m.icone" [fill]="rla.isActive" /><span class="r">{{ m.rotulo }}</span>
              @if (badge(m.rota); as n) {
                <span class="n">{{ n }}</span>
              }
            </a>
          }
        }
      </nav>
      <div class="pe">
        <button type="button" class="recolher" (click)="tema.alternar()" [attr.aria-label]="tema.escuro() ? 'Tema claro' : 'Tema escuro'" (mouseenter)="dica($event, tema.escuro() ? 'Tema claro' : 'Tema escuro')" (mouseleave)="tip.set(null)">
          <app-icon [name]="tema.escuro() ? 'light_mode' : 'dark_mode'" /><span class="r">{{ tema.escuro() ? 'Tema claro' : 'Tema escuro' }}</span>
        </button>
        <button type="button" class="recolher" (click)="alternarMenu()" [attr.aria-label]="recolhido() ? 'Expandir menu' : 'Recolher menu'" (mouseenter)="dica($event, 'Expandir menu')" (mouseleave)="tip.set(null)">
          <app-icon [name]="recolhido() ? 'left_panel_open' : 'left_panel_close'" /><span class="r">Recolher menu</span>
        </button>
        <a class="versao r" routerLink="/novidades">CFP {{ versao }} · Novidades</a>
      </div>
    </aside>

    @if (tip(); as t) {
      <span class="tip" [style.top.px]="t.y">{{ t.texto }}</span>
    }

    <main><router-outlet /></main>

    <button class="fab" type="button" aria-label="Lançar (segure para escolher o tipo)" (click)="tocarFab()"
      (pointerdown)="pressionar()" (pointerup)="soltar()" (pointerleave)="soltar()" (pointercancel)="soltar()" (contextmenu)="$event.preventDefault()">
      <app-icon [name]="menuLanc() ? 'close' : 'add'" [size]="28" />
    </button>

    @if (menuLanc()) {
      <div class="menu-back" (click)="menuLanc.set(false)"></div>
      <div class="menu-lanc" role="menu">
        @for (o of opcoes; track o.rotulo) {
          <button type="button" role="menuitem" (click)="abrirComo(o.modo, o.fixa)"><app-icon [name]="o.icone" [size]="20" />{{ o.rotulo }}</button>
        }
      </div>
    }

    @if (url() !== '/chat') {
      <div class="fabs">
        @if (menus.botao('calc')) {
          <button type="button" class="calc-fab" [class.on]="calc()" (click)="calc.set(!calc())" aria-label="Calculadora" title="Calculadora">
            <app-icon name="calculate" [size]="22" [fill]="calc()" />
          </button>
        }
        @if (menus.botao('chat') && s.membros().length > 1) {
          <a class="chat-fab" routerLink="/chat" aria-label="Chat">
            <app-icon name="chat" [size]="24" [fill]="true" />
            @if (chat.naoLidas(); as n) {
              <span class="dot">{{ n }}</span>
            }
          </a>
        }
      </div>
    }
    <app-calculadora [(open)]="calc" />

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
    .dot.espera { background: var(--warn); }
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
    .fab { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
    .menu-back { position: fixed; inset: 0; z-index: 30; background: rgb(0 0 0 / 0.3); animation: fade 0.15s; }
    .menu-lanc {
      position: fixed; z-index: 32; left: 50%; transform: translateX(-50%); bottom: calc(var(--safe-b) + 96px);
      display: flex; flex-direction: column; gap: 4px; padding: 6px; min-width: 210px;
      background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
      animation: sobe 0.15s;
    }
    .menu-lanc button {
      display: flex; align-items: center; gap: 12px; padding: 11px 14px; border: 0; background: none; border-radius: 10px;
      font: inherit; font-weight: 700; color: var(--ink); cursor: pointer; text-align: left;
    }
    .menu-lanc button:active, .menu-lanc button:hover { background: var(--card-2); }
    .menu-lanc app-icon { color: var(--primary); }
    @keyframes fade { from { opacity: 0; } }
    @keyframes sobe { from { opacity: 0; transform: translate(-50%, 10px); } }
    .fabs {
      position: fixed; z-index: 31; right: 16px; bottom: calc(var(--nav-h) + var(--safe-b) + 16px);
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .chat-fab, .calc-fab {
      position: relative; width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
      background: var(--primary-soft); color: var(--primary); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
      box-shadow: 0 6px 18px color-mix(in srgb, var(--primary) 28%, rgb(0 0 0 / 0.12));
    }
    .calc-fab { width: 42px; height: 42px; cursor: pointer; background: var(--card); box-shadow: 0 4px 12px rgb(0 0 0 / 0.14); }
    .calc-fab.on { background: var(--primary); color: var(--primary-ink); }
    .chat-fab .dot { top: -2px; right: -2px; border-color: var(--primary-soft); }
    .bell.on { color: var(--primary); }
    .pop-back { position: fixed; inset: 0; z-index: 19; }
    .pop {
      position: absolute; top: calc(100% + 6px); left: 8px; right: 8px; max-height: calc(100dvh - 150px); overflow-y: auto;
      background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 12px;
      box-shadow: 0 14px 40px rgb(0 0 0 / 0.22); animation: desce 0.15s; overscroll-behavior: contain;
    }
    @keyframes desce { from { opacity: 0; transform: translateY(-6px); } }
    .side { display: none; }
    @media (min-width: 720px) {
      .nome { display: block; }
      .nav { max-width: 720px; margin: 0 auto 12px; border: 1px solid var(--line); border-radius: 20px; }
      .fab { bottom: 34px; }
      .fabs { right: 24px; bottom: 100px; }
      .pop { left: auto; right: 12px; width: 380px; max-height: min(560px, calc(100dvh - 120px)); }
      .pop.larga { width: 460px; }
    }
    /* desktop: menu lateral no lugar da barra inferior */
    @media (min-width: 1024px) {
      :host.recolhido { --side-w: 76px; }
      .nav, .fab, .menu-lanc, .menu-back { display: none; }
      .fabs { bottom: 24px; right: 24px; }
      .chat-fab { width: 56px; height: 56px; }
      .top { padding-left: calc(var(--side-w) + 24px); padding-right: 24px; }
      main { display: block; margin-left: var(--side-w); }
      .top, main { transition: margin 0.2s, padding 0.2s; }
      .side {
        position: fixed; top: 0; bottom: 0; left: 0; z-index: 25; width: var(--side-w);
        display: flex; flex-direction: column; gap: 12px; padding: 16px 12px 0;
        background: var(--card); border-right: 1px solid var(--line); transition: width 0.2s;
      }
      .side-marca {
        display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 4px 0 4px;
        color: var(--ink-2); font-size: 0.78rem; font-weight: 700; text-align: center; white-space: nowrap;
      }
      .side nav { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; }
      .side nav a, .recolher {
        position: relative; display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: 10px;
        color: var(--ink-2); font-weight: 600; font-size: 0.92rem; white-space: nowrap;
      }
      .side nav a:hover, .recolher:hover { background: var(--card-2); color: var(--ink); }
      .side nav a.on { background: var(--primary-soft); color: var(--primary); font-weight: 700; }
      .grupo {
        margin: 12px 4px 2px; padding: 0 10px 4px; border-bottom: 1px solid var(--line);
        font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); white-space: nowrap;
      }
      .grupo:first-child { margin-top: 0; }
      :host.recolhido .grupo { margin: 8px 4px; padding: 0; }
      .side .n {
        margin-left: auto; min-width: 20px; height: 20px; border-radius: 10px; padding: 0 5px;
        background: var(--danger); color: #fff; font-size: 0.7rem; font-weight: 800; display: grid; place-items: center;
      }
      .tip {
        position: fixed; z-index: 40; left: calc(var(--side-w) + 6px); transform: translateY(-50%); pointer-events: none;
        background: var(--ink); color: var(--bg); font-size: 0.82rem; font-weight: 700; padding: 6px 10px; border-radius: 8px;
        white-space: nowrap; box-shadow: 0 4px 14px rgb(0 0 0 / 0.18);
      }
      .lanca { box-shadow: 0 6px 16px color-mix(in srgb, var(--primary) 35%, transparent); }
      .pe { border-top: 1px solid var(--line); padding: 8px 0 12px; display: flex; flex-direction: column; gap: 4px; }
      .recolher { border: 0; background: none; font: inherit; cursor: pointer; width: 100%; }
      .versao { text-align: center; font-size: 0.78rem; color: var(--ink-3); font-weight: 600; padding: 4px; white-space: nowrap; }
      :host.recolhido .r { display: none; }
      :host.recolhido .side nav a, :host.recolhido .recolher { justify-content: center; padding: 10px 0; }
      :host.recolhido .lanca { padding: 0; width: 52px; height: 52px; margin: 0 auto; border-radius: 16px; flex-shrink: 0; }
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
  protected fila = inject(Fila);

  protected privado = privado;
  protected alternarPrivado = alternarPrivado;
  protected principais = PRINCIPAIS;
  protected menus = inject(Menus);
  protected calc = signal(false);
  /** popover do topo aberto */
  protected pop = signal<'busca' | 'avisos' | null>(null);
  protected versao = VERSAO;
  protected conta = signal(false);
  protected recolhido = signal(localStorage.getItem('cfp.menu') === 'recolhido');
  protected tip = signal<{ texto: string; y: number } | null>(null);
  protected menuLanc = signal(false);
  protected opcoes: { rotulo: string; icone: string; modo: Modo; fixa?: boolean }[] = [
    { rotulo: 'Gasto', icone: 'receipt_long', modo: 'gasto' },
    { rotulo: 'Parcelado', icone: 'event_repeat', modo: 'parcelado' },
    { rotulo: 'Entrada', icone: 'payments', modo: 'entrada' },
    { rotulo: 'Conta fixa', icone: 'calendar_month', modo: 'gasto', fixa: true },
  ];
  private pressao: ReturnType<typeof setTimeout> | undefined;
  private segurou = false;
  private router = inject(Router);
  protected url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects.split('?')[0])), {
    initialValue: this.router.url.split('?')[0],
  });

  // atalho do ícone (?lancar=gasto), lembrete da noite e texto compartilhado com o app (share_target: titulo/texto/link)
  constructor() {
    const sub = inject(ActivatedRoute).queryParamMap.subscribe((p) => {
      const modo = p.get('lancar');
      const texto = ['titulo', 'texto', 'link'].map((k) => p.get(k)).filter(Boolean).join('\n');
      if (!modo && !texto) return;
      if (texto) this.lancar.deTexto(texto);
      else if (modo === 'gasto' || modo === 'parcelado' || modo === 'entrada') this.lancar.novo(modo);
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    });
    const nav = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.pop.set(null));
    inject(DestroyRef).onDestroy(() => (sub.unsubscribe(), nav.unsubscribe()));
  }

  abrir(p: 'busca' | 'avisos') {
    this.pop.set(this.pop() === p ? null : p);
  }

  badge(rota: string) {
    return rota === '/notificacoes' ? this.insights.naoLidas().length : rota === '/chat' ? this.chat.naoLidas() : 0;
  }

  /** Nome do item ao passar o mouse no menu recolhido */
  dica(ev: MouseEvent, texto: string) {
    if (!this.recolhido()) return;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.tip.set({ texto, y: r.top + r.height / 2 });
  }

  // segurar o + abre a escolha do tipo de lançamento
  pressionar() {
    this.segurou = false;
    this.pressao = setTimeout(() => {
      this.segurou = true;
      this.menuLanc.set(true);
      navigator.vibrate?.(15);
    }, 450);
  }

  soltar() {
    clearTimeout(this.pressao);
  }

  tocarFab() {
    if (this.segurou) return;
    if (this.menuLanc()) return this.menuLanc.set(false);
    this.lancar.novo();
  }

  abrirComo(modo: Modo, fixa = false) {
    this.menuLanc.set(false);
    this.lancar.novo(modo, fixa);
  }

  /** N abre um novo lançamento (fora de campos e painéis) */
  atalho(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.pop()) return this.pop.set(null);
    if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const alvo = e.target as HTMLElement;
    if (alvo.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('[role="dialog"]')) return;
    e.preventDefault();
    this.lancar.novo();
  }

  alternarMenu() {
    this.tip.set(null);
    this.recolhido.update((v) => !v);
    localStorage.setItem('cfp.menu', this.recolhido() ? 'recolhido' : '');
  }
}
