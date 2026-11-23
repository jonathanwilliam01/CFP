import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { Icon } from './icon';

/** Botão do olho: alterna `ver`; o input usa [type]="ver() ? 'text' : 'password'" dentro de .senha-wrap */
@Component({
  selector: 'app-ver-senha',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="ver.set(!ver())" [attr.aria-label]="ver() ? 'Esconder senha' : 'Mostrar senha'" [attr.aria-pressed]="ver()">
      <app-icon [name]="ver() ? 'visibility_off' : 'visibility'" [size]="20" />
    </button>
  `,
  styles: `
    button { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; display: grid; place-items: center; background: none; border: 0; border-radius: 10px; color: var(--ink-3); cursor: pointer; }
    button:hover { color: var(--ink); }
  `,
})
export class VerSenha {
  readonly ver = model(false);
}
