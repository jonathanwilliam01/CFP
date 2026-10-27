import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Auth, Foto } from '../core/auth';

/** Foto do usuário (ou de outro membro, com foto e nome) recortada em círculo; sem foto, as iniciais */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (f(); as f) {
      <img [src]="f.url" alt="" [style.transform]="'translate(' + f.x + '%, ' + f.y + '%) scale(' + f.zoom + ')'" />
    } @else {
      {{ iniciais() }}
    }
  `,
  styles: `
    :host {
      display: grid; place-items: center; flex-shrink: 0; overflow: hidden; border-radius: 50%;
      background: var(--primary-soft); color: var(--primary); font-weight: 800; user-select: none;
    }
    img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  `,
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[style.font-size.px]': 'size() * 0.36' },
})
export class Avatar {
  private auth = inject(Auth);
  readonly size = input(32);
  /** enquadramento em edição; sem ele usa a foto salva */
  readonly foto = input<Foto | null | undefined>(undefined);
  /** nome para as iniciais; sem ele usa o do usuário */
  readonly nome = input<string>();
  protected f = computed(() => (this.foto() === undefined ? this.auth.foto() : this.foto()));
  protected iniciais = computed(
    () => (this.nome() ?? this.auth.nome()).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?',
  );
}
