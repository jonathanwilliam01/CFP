import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { Icon } from './icon';
import { fecharNoVoltar } from './voltar';

/** Foto em tela cheia; fecha ao tocar ou no voltar */
@Component({
  selector: 'app-visor',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url(); as u) {
      <div class="visor" (click)="url.set(null)">
        <img [src]="u" alt="Foto de perfil" />
        <button type="button" class="btn ghost icon fechar" aria-label="Fechar"><app-icon name="close" /></button>
      </div>
    }
  `,
  styles: `
    .visor {
      position: fixed; inset: 0; z-index: 60; background: rgb(0 0 0 / 0.85);
      display: grid; place-items: center; padding: 24px; animation: fade 0.15s;
    }
    .visor img { max-width: 100%; max-height: 100%; border-radius: 16px; object-fit: contain; }
    .fechar { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 12px); right: 12px; }
    @keyframes fade { from { opacity: 0; } }
  `,
})
export class Visor {
  readonly url = model<string | null>(null);

  constructor() {
    fecharNoVoltar(() => !!this.url(), () => this.url.set(null));
  }
}
