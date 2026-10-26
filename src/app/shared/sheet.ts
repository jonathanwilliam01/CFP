import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { Icon } from './icon';

/** Painel que sobe de baixo (mobile) ou modal centralizado (desktop) */
@Component({
  selector: 'app-sheet',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="back" (click)="open.set(false)"></div>
      <section class="sheet" role="dialog" [attr.aria-label]="titulo()">
        <header>
          <h2>{{ titulo() }}</h2>
          <button class="btn ghost icon" type="button" (click)="open.set(false)" aria-label="Fechar">
            <app-icon name="close" [size]="18" />
          </button>
        </header>
        <div class="body"><ng-content /></div>
      </section>
    }
  `,
  styles: `
    .back {
      position: fixed; inset: 0; background: rgb(0 0 0 / 0.4); z-index: 50;
      animation: fade 0.15s;
    }
    .sheet {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 51;
      background: var(--card); border-radius: 22px 22px 0 0;
      max-height: 92dvh; display: flex; flex-direction: column;
      padding-bottom: var(--safe-b);
      animation: up 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px 6px;
    }
    .body { overflow-y: auto; padding: 8px 16px 20px; }
    @media (min-width: 720px) {
      .sheet {
        left: 50%; bottom: auto; top: 50%; width: 520px; border-radius: 22px;
        transform: translate(-50%, -50%); animation: fade 0.15s;
      }
    }
    @keyframes up { from { transform: translateY(100%); } }
    @keyframes fade { from { opacity: 0; } }
  `,
})
export class Sheet {
  readonly open = model(false);
  readonly titulo = input('');
}
