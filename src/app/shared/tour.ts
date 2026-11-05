import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from './icon';

interface Passo {
  /** seletores do alvo, o primeiro visível vale (celular e computador têm elementos diferentes) */
  alvo?: string[];
  icone: string;
  titulo: string;
  texto: string;
}

const PASSOS: Passo[] = [
  { icone: 'waving_hand', titulo: 'Bem-vindo ao CFP', texto: 'Em um minuto: onde lançar, onde ver as contas e o que cadastrar primeiro. Dá para pular e rever depois em Mais.' },
  { alvo: ['.fab', '.side .lanca'], icone: 'add_circle', titulo: 'Lançar', texto: 'Toque no + para lançar um gasto. Segure para escolher parcelado, entrada ou conta fixa. Dá para digitar "35 mercado" ou falar.' },
  { alvo: ['app-mes-picker'], icone: 'calendar_month', titulo: 'Mês', texto: 'Tudo mostra o mês escolhido aqui. No celular, deslizar a tela de lado também troca o mês.' },
  { alvo: ['.nav a[href="/"]', '.side nav a[href="/"]'], icone: 'home', titulo: 'Início', texto: 'Saldo previsto do mês: entradas menos contas, faturas e gastos. Abaixo, avisos, contas que vencem e orçamentos.' },
  { alvo: ['.nav a[href="/gastos"]', '.side nav a[href="/gastos"]'], icone: 'receipt_long', titulo: 'Gastos', texto: 'Tudo que foi lançado no mês, por dia. Deslize para a esquerda para excluir; segure para selecionar vários.' },
  { alvo: ['.nav a[href="/contas"]', '.side nav a[href="/contas"]'], icone: 'event_available', titulo: 'Contas', texto: 'Contas fixas e faturas do mês. Marque como paga quando pagar; o app avisa as que estão para vencer.' },
  { alvo: ['.nav a[href="/mais"]', '.side nav'], icone: 'apps', titulo: 'Mais', texto: 'Cartões, benefícios, entradas fixas, orçamentos, cofrinhos, planejamento e relatórios.' },
  { alvo: ['.acoes button[aria-label$="valores"]'], icone: 'visibility', titulo: 'Esconder valores', texto: 'O olho troca os valores por R$ ••• para usar o app perto de outras pessoas.' },
  { icone: 'checklist', titulo: 'Comece por aqui', texto: 'Cadastre os cartões, o salário em Entradas e as contas fixas. O Início mostra um checklist até terminar.' },
];

const CHAVE = 'cfp.tour';

@Injectable({ providedIn: 'root' })
export class Tour {
  readonly passo = signal<number | null>(null);

  get visto() {
    return localStorage.getItem(CHAVE) === '1';
  }

  iniciar() {
    this.passo.set(0);
  }

  fechar() {
    localStorage.setItem(CHAVE, '1');
    this.passo.set(null);
  }
}

@Component({
  selector: 'app-tour',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'medir()', '(document:keydown.escape)': 'tour.fechar()' },
  template: `
    @if (atual(); as p) {
      <div class="fundo" [class.escuro]="!caixa()" (click)="tour.fechar()"></div>
      @if (foco(); as f) {
        <div class="foco" [style.top.px]="f.top" [style.left.px]="f.left" [style.width.px]="f.width" [style.height.px]="f.height"></div>
      }
      <div class="balao" role="dialog" aria-modal="true" [attr.aria-label]="p.titulo" [style.top]="pos().top" [style.bottom]="pos().bottom" [style.left]="pos().left" [style.transform]="pos().transform">
        <div class="tit"><app-icon [name]="p.icone" [size]="22" [fill]="true" /><b>{{ p.titulo }}</b><span class="n">{{ tour.passo()! + 1 }}/{{ total }}</span></div>
        <p>{{ p.texto }}</p>
        <div class="bts">
          @if (ultimo()) {
            <button type="button" class="btn ghost sm" (click)="tour.fechar()">Fechar</button>
            <button type="button" class="btn sm" (click)="cartoes()">Cadastrar cartão</button>
          } @else {
            <button type="button" class="btn ghost sm" (click)="tour.fechar()">Pular</button>
            <span class="grow"></span>
            @if (tour.passo()) { <button type="button" class="btn ghost sm" (click)="ir(-1)">Voltar</button> }
            <button type="button" class="btn sm" (click)="ir(1)">Próximo</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .fundo { position: fixed; inset: 0; z-index: 60; }
    .fundo.escuro { background: rgb(0 0 0 / 0.55); }
    .foco {
      position: fixed; z-index: 61; border-radius: 16px; pointer-events: none;
      box-shadow: 0 0 0 3px var(--primary), 0 0 0 9999px rgb(0 0 0 / 0.55); transition: all 0.25s;
    }
    .balao {
      position: fixed; z-index: 62; left: 50%; transform: translateX(-50%); width: min(360px, calc(100vw - 32px));
      background: var(--card); color: var(--ink); border-radius: 18px; padding: 14px 16px; box-shadow: 0 14px 40px rgb(0 0 0 / 0.3);
      display: flex; flex-direction: column; gap: 8px; animation: entra 0.2s;
    }
    .tit { display: flex; align-items: center; gap: 8px; font-size: 1.02rem; }
    .tit app-icon { color: var(--primary); }
    .n { margin-left: auto; font-size: 0.78rem; color: var(--ink-3); font-weight: 700; }
    p { margin: 0; color: var(--ink-2); font-size: 0.92rem; }
    .bts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .grow { flex: 1; }
    @keyframes entra { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .foco, .balao { transition: none; animation: none; } }
  `,
})
export class TourView {
  protected tour = inject(Tour);
  private router = inject(Router);
  protected total = PASSOS.length;
  protected atual = computed(() => {
    const i = this.tour.passo();
    return i == null ? null : PASSOS[i];
  });
  protected ultimo = computed(() => this.tour.passo() === PASSOS.length - 1);
  protected caixa = signal<DOMRect | null>(null);

  /** contorno do alvo com folga de 6px, sem passar da borda da tela */
  protected foco = computed(() => {
    const c = this.caixa();
    if (!c) return null;
    const top = Math.max(3, c.top - 6), left = Math.max(3, c.left - 6);
    return { top, left, width: Math.min(innerWidth - 3, c.right + 6) - left, height: Math.min(innerHeight - 3, c.bottom + 6) - top };
  });

  /** balão acima ou abaixo do alvo (onde couber), senão ao lado (alvo alto, como o menu lateral), senão no meio */
  protected pos = computed(() => {
    const meio = { left: '50%', transform: 'translateX(-50%)' };
    const c = this.caixa();
    if (!c) return { ...meio, top: '30%', bottom: 'auto' };
    const acima = c.top - 6, abaixo = innerHeight - c.bottom - 6;
    if (Math.max(acima, abaixo) >= 230)
      return abaixo >= acima ? { ...meio, top: `${c.bottom + 18}px`, bottom: 'auto' } : { ...meio, top: 'auto', bottom: `${innerHeight - c.top + 18}px` };
    if (innerWidth - c.right >= 400)
      return { left: `${c.right + 18}px`, transform: 'none', top: `${Math.min(Math.max(16, c.top), innerHeight - 260)}px`, bottom: 'auto' };
    return { ...meio, top: '30%', bottom: 'auto' };
  });

  constructor() {
    effect(() => {
      this.atual();
      this.medir();
    });
  }

  protected medir() {
    const p = this.atual();
    const el = p?.alvo?.map((s) => document.querySelector<HTMLElement>(s)).find((e) => e && e.getClientRects().length && e.offsetWidth);
    // alvo dentro de lista rolada (menu lateral) pode estar fora da vista
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el?.getBoundingClientRect();
    this.caixa.set(r && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth ? r : null);
  }

  protected ir(d: number) {
    this.tour.passo.update((i) => Math.min(PASSOS.length - 1, Math.max(0, (i ?? 0) + d)));
  }

  protected cartoes() {
    this.tour.fechar();
    this.router.navigate(['/cartoes']);
  }
}
