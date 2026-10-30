import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { Icon } from './icon';

export interface ItemOrdem {
  id: string;
  nome: string;
  oculto: boolean;
  /** não pode ser escondido */
  fixo?: boolean;
}

/** Lista ordenável (alça de arrastar, subir/descer) com olho para mostrar ou esconder */
@Component({
  selector: 'app-ordenar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (b of itens(); track b.id; let i = $index, ult = $last) {
      <div class="bl" [attr.data-i]="i" [class.arr]="arrastando() === i" [class.off]="b.oculto">
        <span class="alca" (pointerdown)="arrastar($event, i)"><app-icon name="drag_indicator" [size]="20" /></span>
        <span class="nm">{{ b.nome }}</span>
        <button type="button" class="mv" (click)="alternar.emit(b.id)" [disabled]="b.fixo" [attr.aria-label]="b.oculto ? 'Mostrar' : 'Esconder'">
          <app-icon [name]="b.oculto ? 'visibility_off' : 'visibility'" [size]="18" /></button>
        <button type="button" class="mv" (click)="mover.emit([i, i - 1])" [disabled]="i === 0" aria-label="Subir"><app-icon name="arrow_upward" [size]="18" /></button>
        <button type="button" class="mv" (click)="mover.emit([i, i + 1])" [disabled]="ult" aria-label="Descer"><app-icon name="arrow_downward" [size]="18" /></button>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; }
    .bl { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
    .bl:last-child { border-bottom: 0; }
    .bl .nm { flex: 1; min-width: 0; }
    .bl.off .nm { color: var(--ink-3); text-decoration: line-through; }
    .bl.arr { background: var(--primary-soft); border-radius: 10px; }
    .alca { touch-action: none; cursor: grab; color: var(--ink-3); display: grid; padding: 6px 2px; }
    .mv { border: 0; background: none; color: var(--ink-2); cursor: pointer; padding: 6px; border-radius: 8px; display: grid; }
    .mv:disabled { opacity: 0.3; cursor: default; }
  `,
})
export class Ordenar {
  readonly itens = input.required<ItemOrdem[]>();
  readonly mover = output<[number, number]>();
  readonly alternar = output<string>();
  protected arrastando = signal<number | null>(null);

  /** Arrastar pela alça (mouse ou toque): troca de lugar ao passar sobre outra linha */
  arrastar(e: PointerEvent, i: number) {
    e.preventDefault();
    this.arrastando.set(i);
    const el = (e.currentTarget as HTMLElement).closest('app-ordenar')!;
    const mover = (ev: PointerEvent) => {
      const alvo = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.bl[data-i]');
      const j = alvo && el.contains(alvo) ? Number(alvo.dataset['i']) : null;
      const de = this.arrastando();
      if (j === null || de === null || j === de) return;
      this.mover.emit([de, j]);
      this.arrastando.set(j);
    };
    const soltar = () => {
      this.arrastando.set(null);
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
      removeEventListener('pointercancel', soltar);
    };
    addEventListener('pointermove', mover);
    addEventListener('pointerup', soltar);
    addEventListener('pointercancel', soltar);
  }
}
