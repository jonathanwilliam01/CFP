import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, TemplateRef, contentChild, inject, input, output, signal, viewChild } from '@angular/core';
import { Icon } from './icon';

export interface ColunaQuadro<T> {
  id: string;
  titulo: string;
  icone?: string;
  cor?: string;
  /** false: não recebe; lista de ids: só recebe vindo dessas colunas */
  aceita?: boolean | string[];
  itens: T[];
}

export interface MoverQuadro<T> {
  item: T;
  de: string;
  para: string;
}

interface Arrasto<T> {
  item: T;
  de: string;
  k: string;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

/** toque: segurar antes de arrastar, para não brigar com a rolagem */
const SEGURAR = 250;
const BORDA = 48;

/** Quadro (kanban) genérico: colunas lado a lado, arrastar com Pointer Events ou menu "Mover para" */
@Component({
  selector: 'app-quadro',
  imports: [NgTemplateOutlet, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'fora($event)', '(contextmenu)': 'menuContexto($event)' },
  template: `
    <nav class="abas" aria-label="Colunas">
      @for (col of colunas(); track col.id; let i = $index) {
        <button type="button" [class.on]="visivel() === i" [style.--cor]="col.cor ?? null" (click)="irPara(i)">
          {{ col.titulo }} <span class="n">{{ col.itens.length }}</span>
        </button>
      }
    </nav>
    <div class="trilho" #trilho [class.arrastando]="!!arr()" (scroll)="rolou()">
      @for (col of colunas(); track col.id) {
        <section class="coluna" [attr.data-coluna]="col.id" [class.alvo]="alvo() === col.id" [class.fosca]="!!arr() && !pode(col, arr()!.de)"
          [style.--cor]="col.cor ?? null" [attr.aria-label]="col.titulo">
          <header class="cab">
            @if (col.icone) { <app-icon [name]="col.icone" [size]="18" /> }
            <b class="tit">{{ col.titulo }}</b>
            <span class="n">{{ col.itens.length }}</span>
            @if (total() && col.itens.length) { <span class="tot">{{ total()!(col.itens) }}</span> }
          </header>
          <div class="itens">
            @for (item of col.itens; track chave()(item)) {
              <div class="cartao" [class.fonte]="arr()?.k === chave()(item)"
                (pointerdown)="inicio($event, item, col.id)" (pointermove)="moverPonteiro($event)" (pointerup)="fim($event)" (pointercancel)="limpar()">
                <div class="conteudo"><ng-container *ngTemplateOutlet="cartao(); context: { $implicit: item, coluna: col.id }" /></div>
                @if (destinos(col.id).length) {
                  <button type="button" class="mv" aria-label="Mover para" [attr.aria-expanded]="menu() === chave()(item)"
                    (pointerdown)="$event.stopPropagation()" (click)="alternarMenu(chave()(item))"><app-icon name="swap_horiz" [size]="18" /></button>
                }
                @if (menu() === chave()(item)) {
                  <div class="menu" role="menu">
                    <span class="small muted">Mover para</span>
                    @for (d of destinos(col.id); track d.id) {
                      <button type="button" role="menuitem" (click)="soltar(item, col.id, d.id)">
                        @if (d.icone) { <app-icon [name]="d.icone" [size]="16" [style.color]="d.cor ?? null" /> }{{ d.titulo }}
                      </button>
                    }
                  </div>
                }
              </div>
            } @empty {
              <p class="vazio small">{{ vazio() }}</p>
            }
          </div>
        </section>
      }
    </div>
    @if (arr(); as a) {
      <div class="fantasma" [style.width.px]="a.w" [style.transform]="'translate(' + pos().x + 'px, ' + pos().y + 'px) rotate(2deg)'" aria-hidden="true">
        <ng-container *ngTemplateOutlet="cartao(); context: { $implicit: a.item, coluna: a.de }" />
      </div>
    }
  `,
  styles: `
    :host { display: block; position: relative; container: quadro / inline-size; }
    .trilho {
      display: grid; grid-auto-flow: column; grid-auto-columns: min(82%, 272px); gap: 10px; align-items: start;
      overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; padding-bottom: 6px; scrollbar-width: thin;
    }
    .trilho.arrastando { scroll-snap-type: none; }
    .abas { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-bottom: 10px; }
    .abas button {
      flex-shrink: 0; display: flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--card); color: var(--ink-2);
      font: inherit; font-size: 0.85rem; font-weight: 600; padding: 6px 12px; border-radius: 999px; cursor: pointer;
    }
    .abas button.on { color: var(--ink); border-color: var(--cor, var(--primary)); box-shadow: inset 0 -2px 0 var(--cor, var(--primary)); }
    /* lado a lado só quando cada coluna tem ao menos ~240px; antes disso rola de lado */
    @container quadro (min-width: 1000px) {
      .trilho { grid-auto-columns: minmax(0, 1fr); scroll-snap-type: none; }
      .abas { display: none; }
    }
    .coluna {
      scroll-snap-align: start; min-width: 0; display: flex; flex-direction: column; gap: 8px;
      background: var(--card-2); border: 1px solid var(--line); border-top: 3px solid var(--cor, var(--line)); border-radius: 14px; padding: 8px;
      transition: box-shadow 0.15s, opacity 0.15s;
    }
    .coluna.alvo { box-shadow: 0 0 0 2px var(--cor, var(--primary)); background: var(--card); }
    .coluna.fosca { opacity: 0.55; }
    .cab { display: flex; align-items: center; gap: 6px; padding: 2px 4px; color: var(--cor, var(--ink-2)); min-width: 0; }
    .tit { color: var(--ink); font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .n { font-size: 0.72rem; font-weight: 700; background: var(--card); color: var(--ink-2); border-radius: 999px; padding: 1px 7px; }
    .tot { margin-left: auto; font-size: 0.8rem; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .itens { display: flex; flex-direction: column; gap: 6px; min-height: 56px; }
    .cartao {
      position: relative; display: flex; flex-wrap: wrap; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 0 30px 0 10px; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; cursor: grab;
    }
    .cartao.fonte { opacity: 0.35; }
    .conteudo { flex: 1; min-width: 0; }
    .mv { position: absolute; top: 4px; right: 2px; width: 28px; height: 28px; display: grid; place-items: center; border: 0; background: none; color: var(--ink-3); border-radius: 10px; cursor: pointer; }
    .mv:hover, .mv[aria-expanded='true'] { color: var(--primary); background: var(--card-2); }
    .menu {
      flex-basis: 100%; display: flex; flex-direction: column; padding: 4px 0 8px; border-top: 1px solid var(--line);
    }
    .menu span { padding: 4px 8px; }
    .menu button {
      display: flex; align-items: center; gap: 8px; border: 0; background: none; font: inherit; font-size: 0.9rem; color: inherit;
      text-align: left; padding: 9px 8px; border-radius: 8px; cursor: pointer;
    }
    .menu button:hover { background: var(--card-2); }
    .vazio { margin: 0; padding: 16px 4px; text-align: center; color: var(--ink-3); border: 1px dashed var(--line); border-radius: 12px; }
    .fantasma {
      position: absolute; left: 0; top: 0; z-index: 20; pointer-events: none; background: var(--card); border: 1px solid var(--primary);
      border-radius: 12px; padding: 0 10px; box-shadow: 0 12px 28px #0004; opacity: 0.95;
    }
  `,
})
export class Quadro<T> {
  readonly colunas = input.required<ColunaQuadro<T>[]>();
  readonly chave = input.required<(item: T) => string>();
  readonly total = input<((itens: T[]) => string) | null>(null);
  readonly vazio = input('Nada aqui');
  readonly mover = output<MoverQuadro<T>>();

  protected cartao = contentChild.required<TemplateRef<{ $implicit: T; coluna: string }>>('cartao');
  private trilho = viewChild.required<ElementRef<HTMLElement>>('trilho');
  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  protected arr = signal<Arrasto<T> | null>(null);
  protected pos = signal({ x: 0, y: 0 });
  protected alvo = signal<string | null>(null);
  protected menu = signal<string | null>(null);
  /** coluna mais à vista no trilho (abas do celular) */
  protected visivel = signal(0);

  protected irPara(i: number) {
    const el = this.trilho().nativeElement;
    const col = el.children[i] as HTMLElement | undefined;
    if (col) el.scrollTo({ left: col.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }

  protected rolou() {
    const el = this.trilho().nativeElement;
    const cols = [...el.children] as HTMLElement[];
    const meio = el.scrollLeft + el.clientWidth / 3;
    const i = cols.findIndex((c) => c.offsetLeft - el.offsetLeft + c.offsetWidth > meio);
    this.visivel.set(Math.max(0, i));
  }

  private pend: { item: T; de: string; el: HTMLElement; id: number; toque: boolean; x0: number; y0: number; timer?: ReturnType<typeof setTimeout> } | null = null;
  private x = 0;
  private y = 0;
  private quadroAnim = 0;
  private bloquearClique = false;

  constructor() {
    // arrastando: o toque não rola a página nem chega ao "puxar para atualizar" do Shell
    this.host.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (!this.arr()) return;
        e.preventDefault();
        e.stopPropagation();
      },
      { passive: false },
    );
    this.host.addEventListener(
      'click',
      (e: Event) => {
        if (!this.bloquearClique) return;
        this.bloquearClique = false;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
  }

  /** soltar na coluna: não é a mesma e aceita vindo de onde */
  protected pode(col: ColunaQuadro<T>, de: string) {
    if (col.id === de || col.aceita === false) return false;
    return Array.isArray(col.aceita) ? col.aceita.includes(de) : true;
  }

  protected destinos(de: string) {
    return this.colunas().filter((c) => this.pode(c, de));
  }

  protected alternarMenu(k: string) {
    this.menu.set(this.menu() === k ? null : k);
  }

  protected fora(e: Event) {
    if (this.menu() && !(e.target as HTMLElement).closest?.('.menu, .mv')) this.menu.set(null);
  }

  protected menuContexto(e: Event) {
    if (this.pend || this.arr()) e.preventDefault();
  }

  protected soltar(item: T, de: string, para: string) {
    this.menu.set(null);
    this.mover.emit({ item, de, para });
  }

  protected inicio(e: PointerEvent, item: T, de: string) {
    if (e.button !== 0 || !this.destinos(de).length) return;
    const toque = e.pointerType !== 'mouse';
    this.pend = { item, de, el: e.currentTarget as HTMLElement, id: e.pointerId, toque, x0: e.clientX, y0: e.clientY };
    this.x = e.clientX;
    this.y = e.clientY;
    if (toque) this.pend.timer = setTimeout(() => this.comecar(), SEGURAR);
  }

  protected moverPonteiro(e: PointerEvent) {
    const p = this.pend;
    if (!p || e.pointerId !== p.id) return;
    this.x = e.clientX;
    this.y = e.clientY;
    if (!this.arr()) {
      const d = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
      if (p.toque && d > 8) this.limpar(); // rolando
      else if (!p.toque && d > 6) this.comecar();
      return;
    }
    this.atualizar();
  }

  protected fim(e: PointerEvent) {
    const a = this.arr();
    if (a && this.pend && e.pointerId === this.pend.id) {
      this.atualizar();
      const para = this.alvo();
      const col = this.colunas().find((c) => c.id === para);
      this.bloquearClique = true;
      setTimeout(() => (this.bloquearClique = false), 300);
      if (col && this.pode(col, a.de)) {
        navigator.vibrate?.(10);
        this.mover.emit({ item: a.item, de: a.de, para: col.id });
      }
    }
    this.limpar();
  }

  protected limpar() {
    if (this.pend?.timer) clearTimeout(this.pend.timer);
    this.pend = null;
    this.arr.set(null);
    this.alvo.set(null);
    cancelAnimationFrame(this.quadroAnim);
  }

  private comecar() {
    const p = this.pend;
    if (!p) return;
    const r = p.el.getBoundingClientRect();
    try {
      p.el.setPointerCapture(p.id);
    } catch {
      return this.limpar(); // o ponteiro já saiu
    }
    this.menu.set(null);
    this.arr.set({ item: p.item, de: p.de, k: this.chave()(p.item), w: r.width, h: r.height, dx: p.x0 - r.left, dy: p.y0 - r.top });
    this.atualizar();
    const passo = () => {
      this.rolarBorda();
      this.quadroAnim = requestAnimationFrame(passo);
    };
    this.quadroAnim = requestAnimationFrame(passo);
  }

  /** fantasma segue o ponteiro (preso dentro do quadro) e a coluna sob ele vira alvo */
  private atualizar() {
    const a = this.arr();
    if (!a) return;
    const h = this.host.getBoundingClientRect();
    const x = Math.min(Math.max(this.x - a.dx - h.left, 0), Math.max(0, h.width - a.w));
    const y = Math.min(Math.max(this.y - a.dy - h.top, 0), Math.max(0, h.height - a.h));
    this.pos.set({ x, y });
    const el = document.elementFromPoint(this.x, this.y)?.closest<HTMLElement>('[data-coluna]');
    this.alvo.set(el && this.host.contains(el) ? el.dataset['coluna']! : null);
  }

  /** perto da borda: rola o quadro de lado e a página na vertical */
  private rolarBorda() {
    const t = this.trilho().nativeElement;
    const r = t.getBoundingClientRect();
    let mudou = false;
    if (t.scrollWidth > t.clientWidth) {
      if (this.x < r.left + BORDA) (t.scrollLeft -= 10), (mudou = true);
      else if (this.x > r.right - BORDA) (t.scrollLeft += 10), (mudou = true);
    }
    const scroller = this.host.closest<HTMLElement>('[role="dialog"] .body');
    const topo = scroller ? scroller.getBoundingClientRect().top : 0;
    const base = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
    const dy = this.y < topo + 60 ? -8 : this.y > base - 90 ? 8 : 0;
    if (dy) {
      if (scroller) scroller.scrollTop += dy;
      else window.scrollBy(0, dy);
      mudou = true;
    }
    if (mudou) this.atualizar();
  }
}
