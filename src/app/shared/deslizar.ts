import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { Icon } from './icon';

export interface AcaoDeslizar {
  rotulo: string;
  icone: string;
  /** cor de fundo (var CSS ou hex) */
  cor: string;
}

const LIMITE = 80;

/** Linha de lista que desliza para o lado e dispara uma ação (esquerda: arrasta para a esquerda) */
@Component({
  selector: 'app-deslizar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dx() !== 0) {
      @if (dx() < 0 && esquerda(); as a) {
        <div class="fundo fim" [style.background]="a.cor" [class.pronto]="-dx() >= limite"><app-icon [name]="a.icone" [size]="20" />{{ a.rotulo }}</div>
      } @else if (dx() > 0 && direita(); as a) {
        <div class="fundo" [style.background]="a.cor" [class.pronto]="dx() >= limite"><app-icon [name]="a.icone" [size]="20" />{{ a.rotulo }}</div>
      }
    }
    <div class="conteudo" [class.solto]="!arrastando()" [style.transform]="dx() ? 'translateX(' + dx() + 'px)' : null"
      (pointerdown)="inicio($event)" (pointermove)="mover($event)" (pointerup)="fim()" (pointercancel)="cancelar()">
      <ng-content />
    </div>
  `,
  styles: `
    :host { display: block; position: relative; overflow: hidden; }
    :host(:not(:last-child)) { border-bottom: 1px solid var(--line); }
    .conteudo { position: relative; background: var(--card); touch-action: pan-y; }
    .conteudo.solto { transition: transform 0.2s; }
    .fundo {
      position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; padding: 0 18px;
      color: #fff; font-weight: 700; font-size: 0.88rem; opacity: 0.75; transition: opacity 0.15s;
    }
    .fundo.fim { justify-content: flex-end; }
    .fundo.pronto { opacity: 1; }
  `,
})
export class Deslizar {
  readonly esquerda = input<AcaoDeslizar | null>(null);
  readonly direita = input<AcaoDeslizar | null>(null);
  readonly esquerdaFeito = output<void>();
  readonly direitaFeito = output<void>();

  protected dx = signal(0);
  protected arrastando = signal(false);
  protected limite = LIMITE;
  private x0 = 0;
  private y0 = 0;
  private id: number | null = null;
  /** arrastou: o clique que vem junto com o soltar não abre a linha */
  private bloquearClique = false;

  constructor() {
    inject(ElementRef<HTMLElement>).nativeElement.addEventListener(
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

  inicio(e: PointerEvent) {
    if (e.button !== 0 || (!this.esquerda() && !this.direita())) return;
    this.id = e.pointerId;
    this.x0 = e.clientX;
    this.y0 = e.clientY;
    this.bloquearClique = false;
  }

  mover(e: PointerEvent) {
    if (e.pointerId !== this.id) return;
    const dx = e.clientX - this.x0;
    if (!this.arrastando()) {
      if (Math.abs(e.clientY - this.y0) > 10) return void (this.id = null);
      if (Math.abs(dx) < 10) return;
      this.arrastando.set(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const max = 140;
    const v = dx < 0 ? (this.esquerda() ? Math.max(dx, -max) : 0) : this.direita() ? Math.min(dx, max) : 0;
    this.dx.set(v);
  }

  fim() {
    if (this.arrastando()) {
      this.bloquearClique = true;
      setTimeout(() => (this.bloquearClique = false), 300);
      if (this.dx() <= -LIMITE) this.esquerdaFeito.emit();
      else if (this.dx() >= LIMITE) this.direitaFeito.emit();
    }
    this.cancelar();
  }

  cancelar() {
    this.id = null;
    this.arrastando.set(false);
    this.dx.set(0);
  }
}
