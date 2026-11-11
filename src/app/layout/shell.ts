import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Admin } from '../core/admin';
import { Auth } from '../core/auth';
import { Chat } from '../core/chat';
import { Fila } from '../core/fila';
import { funcaoDaRota, Funcoes } from '../core/funcoes';
import { Comunicados } from '../core/comunicados';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Atualizacao } from '../shared/atualizar';
import { Patrimonios } from '../core/patrimonio';
import { Tema } from '../core/tema';
import { VERSAO } from '../core/versao';
import { addMeses, diffDias, hoje, mesAtual, nomeMes } from '../core/datas';
import { alternarPrivado, moeda, privado } from '../core/formato';
import { Avatar } from '../shared/avatar';
import { BloqueioTela } from './bloqueio';
import { eExtrato, extratoPendente, tirarCompartilhado } from '../core/arquivos';
import { prepararComprovante } from '../core/comprovante';
import { Buscador } from '../shared/buscador';
import { Calculadora } from '../shared/calculadora';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';
import { Tour, TourView } from '../shared/tour';
import { Saida, SairModal } from '../shared/sair';
import { Lancar, LancarSheet, Modo } from '../shared/lancar';
import { MesPicker } from '../shared/mes-picker';
import { Destaque } from '../shared/destaque';
import { Avisos } from './avisos';
import { Conta } from './conta';
import { Menus, PRINCIPAIS } from './menu';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar, Icon, MesPicker, LancarSheet, Conta, Buscador, Avisos, Calculadora, BloqueioTela, TourView, SairModal, Destaque],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.recolhido]': 'recolhido()', '(document:keydown)': 'atalho($event)', '(document:dragover)': 'arrastando($event)', '(document:dragleave)': 'saiu($event)', '(document:drop)': 'soltou($event)', '(window:scroll)': 'rolou()' },
  template: `
    <app-bloqueio />
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
          @if (insights.naoLidas().length + comunicados.naoLidos().length; as n) {
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
            @if (m.rota === '/config') {
              <button type="button" class="recolher" (click)="tour.iniciar()" aria-label="Passo a passo" (mouseenter)="dica($event, 'Passo a passo')" (mouseleave)="tip.set(null)">
                <app-icon name="tour" /><span class="r">Passo a passo</span>
              </button>
            }
          }
          @if (g.nome === 'App') {
            @if (admin.eAdmin()) {
              <a routerLink="/admin" routerLinkActive="on" aria-label="Painel admin" (mouseenter)="dica($event, 'Painel admin')" (mouseleave)="tip.set(null)">
                <app-icon name="admin_panel_settings" /><span class="r">Painel admin</span>
              </a>
            }
            <button type="button" class="recolher sair" (click)="saida.abrir()" aria-label="Sair do app" (mouseenter)="dica($event, 'Sair do app')" (mouseleave)="tip.set(null)">
              <app-icon name="logout" /><span class="r">Sair do app</span>
            </button>
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

    @if (puxado() || atualizando()) {
      <div class="puxar" [style.--p]="atualizando() ? 1 : puxado() / 70" aria-live="polite">
        <app-icon name="refresh" [size]="22" [class.gira]="atualizando()" [style.transform]="atualizando() ? null : 'rotate(' + puxado() * 4 + 'deg)'" />
      </div>
    }
    @if (emManutencao()) {
      <div class="manut" role="status"><app-icon name="construction" [size]="18" /> Em manutenção para os usuários</div>
    }
    <main (touchstart)="toque($event)" (touchmove)="puxando($event)" (touchend)="arrastou($event)"><router-outlet /></main>

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
      <div class="fabs" [class.some]="descendo()">
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
    <app-tour />
    <app-sair />
    <app-destaque />
    @if (soltando()) {
      <div class="soltar"><app-icon name="upload_file" [size]="48" /><b>Solte o arquivo</b><span>CSV ou OFX vai para Importar · foto ou PDF vira lançamento com comprovante</span></div>
    }
  `,
  styles: `
    .soltar {
      position: fixed; inset: 12px; z-index: 60; border: 3px dashed var(--primary); border-radius: 24px; background: color-mix(in srgb, var(--bg) 88%, transparent);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--primary); pointer-events: none; text-align: center; padding: 24px;
    }
    .soltar span { color: var(--ink-2); font-size: 0.9rem; }
    .puxar {
      position: fixed; z-index: 25; left: 50%; top: calc(64px + env(safe-area-inset-top, 0px)); transform: translate(-50%, calc(var(--p) * 30px - 20px));
      width: 40px; height: 40px; border-radius: 50%; background: var(--card); box-shadow: var(--shadow), 0 2px 10px rgb(0 0 0 / 0.15);
      display: grid; place-items: center; color: var(--primary); opacity: min(1, var(--p));
    }
    .puxar .gira { animation: gira 0.8s linear infinite; }
    @keyframes gira { to { transform: rotate(360deg); } }
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
      /* à esquerda no celular: cobre os ícones das linhas, não os valores */
      position: fixed; z-index: 31; left: 16px; bottom: calc(var(--nav-h) + var(--safe-b) + 16px);
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .fabs { transition: transform 0.2s, opacity 0.2s; }
    .fabs.some { transform: translateX(-80px); opacity: 0; pointer-events: none; }
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
    /* nada da tela passa da largura: com fonte grande do sistema a página rolava de lado e a barra de baixo saía da tela */
    .manut { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 12px; font-size: 0.85rem; font-weight: 600; background: var(--warn-soft); color: var(--text); }
    main { display: block; overflow-x: clip; }
    @keyframes desce { from { opacity: 0; transform: translateY(-6px); } }
    .side { display: none; }
    @media (min-width: 720px) {
      .nome { display: block; }
      .nav { max-width: 720px; margin: 0 auto 12px; border: 1px solid var(--line); border-radius: 20px; }
      .fab { bottom: 34px; }
      .fabs { left: 24px; bottom: 100px; }
      .pop { left: auto; right: 12px; width: 380px; max-height: min(560px, calc(100dvh - 120px)); }
      .pop.larga { width: 460px; }
    }
    /* desktop: menu lateral no lugar da barra inferior */
    @media (min-width: 1024px) {
      :host.recolhido { --side-w: 76px; }
      .nav, .fab, .menu-lanc, .menu-back { display: none; }
      .fabs { bottom: 24px; left: auto; right: 24px; }
      .fabs.some { transform: translateX(80px); }
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
      .side .sair { color: var(--danger); }
      .side .sair:hover { background: var(--danger-soft); color: var(--danger); }
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
  protected admin = inject(Admin);
  private funcoes = inject(Funcoes);
  protected insights = inject(Insights);
  protected comunicados = inject(Comunicados);
  protected chat = inject(Chat);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);
  protected tema = inject(Tema);
  protected tour = inject(Tour);
  protected saida = inject(Saida);
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
  /** rolando para baixo: chat e calculadora saem da frente dos valores */
  protected descendo = signal(false);
  private y0 = 0;
  private toque0: { x: number; y: number; t: number } | null = null;
  private pressao: ReturnType<typeof setTimeout> | undefined;
  private segurou = false;
  private router = inject(Router);
  protected url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects.split('?')[0])), {
    initialValue: this.router.url.split('?')[0],
  });

  protected emManutencao = computed(() => !!this.admin.eAdmin() && this.funcoes.status()[funcaoDaRota(this.url())?.chave ?? '']?.ativa === false);

  // atalho do ícone (?lancar=gasto), lembrete da noite e compartilhado com o app (sw.js guarda texto e arquivo: ?compartilhado=1;
  // titulo/texto/link na URL ficam para o manifesto antigo instalado)
  constructor() {
    // passo a passo sozinho uma vez, só em carteira ainda vazia
    effect(() => {
      const s = this.s;
      if (s.pronto() && !this.tour.visto && this.tour.passo() == null && !s.cartoes().length && !s.recorrencias().length && !s.recentes().length)
        untracked(() => this.tour.iniciar());
    });
    const sub = inject(ActivatedRoute).queryParamMap.subscribe((p) => {
      if (p.get('compartilhado')) {
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
        return void this.abrirCompartilhado();
      }
      const modo = p.get('lancar');
      const texto = ['titulo', 'texto', 'link'].map((k) => p.get(k)).filter(Boolean).join('\n');
      if (!modo && !texto) return;
      if (texto) this.lancar.deTexto(texto);
      else if (modo === 'gasto' || modo === 'parcelado' || modo === 'entrada') this.lancar.novo(modo);
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    });
    const nav = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.pop.set(null));
    // foto do patrimônio uma vez por dia, depois dos cadastros carregados
    const pat = inject(Patrimonios);
    effect(() => {
      if (this.s.carteiraId() && !this.s.carregando() && this.s.contasBancarias().length + this.s.cofrinhos().length) untracked(() => pat.diaria());
    });
    effect(() => {
      if (!this.s.pronto() || this.s.mes() !== mesAtual()) return;
      const d = hoje();
      this.urgentes.set(this.s.contasMes().filter((c) => !c.pago && !c.beneficio_id && diffDias(d, c.vencimento) <= 3).length);
    });
    effect(() => {
      const n = this.urgentes();
      const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      (n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
    });
    // sobra automática: uma vez por sessão e carteira, com os dados carregados
    const sobraVista = new Set<string>();
    effect(() => {
      const c = this.s.carteira();
      if (!this.s.pronto() || !c?.sobra_cofrinho || sobraVista.has(c.id)) return;
      sobraVista.add(c.id);
      untracked(() =>
        this.s.guardarSobraAuto().then((d) => {
          if (d) this.toast.feito(`Guardamos ${moeda(d.valor)} da sobra de ${nomeMes(addMeses(mesAtual(), -1))} em ${d.cofrinho}`, () => this.s.excluir('cofrinho_movs', d.id));
        }).catch((e) => console.error('Sobra automática', e)),
      );
    });
    inject(DestroyRef).onDestroy(() => (sub.unsubscribe(), nav.unsubscribe()));
  }

  /** Contas do mês corrente vencidas ou vencendo em até 3 dias, sem pagar: no menu e no ícone do app */
  protected urgentes = signal(0);

  /** Arrastar arquivo para a janela (desktop) */
  protected soltando = signal(false);
  private temArquivo = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  arrastando(e: DragEvent) {
    if (!this.temArquivo(e) || document.querySelector('[role="dialog"]')) return;
    e.preventDefault();
    this.soltando.set(true);
  }
  saiu(e: DragEvent) {
    if (!e.relatedTarget) this.soltando.set(false);
  }
  soltou(e: DragEvent) {
    const f = e.dataTransfer?.files[0];
    if (!this.soltando() || !f) return;
    e.preventDefault();
    this.soltando.set(false);
    this.abrirArquivo(f, '');
  }
  private async abrirArquivo(f: File, texto: string) {
    if (eExtrato(f)) {
      extratoPendente.set(f);
      return void this.router.navigateByUrl('/importar');
    }
    if (!/^image\/|^application\/pdf$/.test(f.type)) return this.toast.erro('Use CSV/OFX, foto ou PDF');
    this.lancar.deTexto(texto, await prepararComprovante(f));
  }

  private async abrirCompartilhado() {
    try {
      const c = await tirarCompartilhado();
      if (!c) return;
      if (c.arquivo && eExtrato(c.arquivo)) return this.abrirArquivo(c.arquivo, c.texto);
      this.lancar.deTexto(c.texto, c.arquivo ? await prepararComprovante(c.arquivo) : null);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  abrir(p: 'busca' | 'avisos') {
    this.pop.set(this.pop() === p ? null : p);
  }

  badge(rota: string) {
    if (rota === '/contas') return this.urgentes();
    return rota === '/notificacoes' ? this.insights.naoLidas().length + this.comunicados.naoLidos().length : rota === '/chat' ? this.chat.naoLidas() : 0;
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

  /** Fora de campos e painéis: N lança gasto, / abre a busca, ← e → trocam o mês */
  atalho(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.pop()) return this.pop.set(null);
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      return this.pop.set(this.pop() === 'busca' ? null : 'busca');
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const k = e.key === '/' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? e.key : e.key.toLowerCase();
    if (k !== 'n' && k !== '/' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    const alvo = e.target as HTMLElement;
    if (alvo.closest?.('input, textarea, select, [contenteditable], app-deslizar') || document.querySelector('[role="dialog"]')) return;
    e.preventDefault();
    if (k === 'n') return this.lancar.novo();
    if (k === '/') return this.pop.set('busca');
    if (k === 'ArrowLeft' && this.s.mes() === this.s.inicio()) return;
    this.s.mes.update((m) => addMeses(m, k === 'ArrowLeft' ? -1 : 1));
  }

  rolou() {
    const y = window.scrollY;
    if (Math.abs(y - this.y0) < 12) return;
    this.descendo.set(y > this.y0 && y > 80);
    this.y0 = y;
  }

  // puxar para baixo no topo da tela recarrega só os dados (o recarregar do navegador está desligado no CSS)
  protected puxado = signal(0);
  protected atualizando = signal(false);
  private puxar0: number | null = null;
  private atualizacao = inject(Atualizacao);

  puxando(e: TouchEvent) {
    if (this.puxar0 === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - this.puxar0;
    this.puxado.set(dy > 0 && window.scrollY <= 0 ? Math.min(dy * 0.5, 90) : 0);
  }

  private async atualizarDados() {
    this.atualizando.set(true);
    try {
      await this.s.atualizarTudo();
      this.atualizacao.verificar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.atualizando.set(false);
    }
  }

  // arrastar para o lado em área vazia troca o mês
  toque(e: TouchEvent) {
    this.toque0 = null;
    this.puxar0 = e.touches.length === 1 && window.scrollY <= 0 && !document.querySelector('[role="dialog"]') ? e.touches[0].clientY : null;
    if (e.touches.length !== 1 || this.url() === '/chat' || this.rolaDeLado(e.target as HTMLElement)) return;
    const t = e.touches[0];
    this.toque0 = { x: t.clientX, y: t.clientY, t: e.timeStamp };
  }

  arrastou(e: TouchEvent) {
    if (this.puxado() >= 70 && !this.atualizando()) this.atualizarDados();
    this.puxado.set(0);
    this.puxar0 = null;
    const i = this.toque0;
    this.toque0 = null;
    if (!i || e.timeStamp - i.t > 600) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - i.x;
    const dy = t.clientY - i.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const n = dx < 0 ? 1 : -1;
    if (n < 0 && this.s.mes() === this.s.inicio()) return;
    this.s.mes.update((m) => addMeses(m, n));
  }

  /** toque em controle, linha deslizável, painel ou algo que rola na horizontal */
  private rolaDeLado(el: HTMLElement | null) {
    if (el?.closest('a, button, input, textarea, select, label, [contenteditable], app-deslizar, [role="dialog"], canvas, svg')) return true;
    for (; el && el.tagName !== 'MAIN'; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  }

  alternarMenu() {
    this.tip.set(null);
    this.recolhido.update((v) => !v);
    localStorage.setItem('cfp.menu', this.recolhido() ? 'recolhido' : '');
  }
}
