import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Icon } from './icon';
import { Toast } from './toast';

/** Pede o aceite dos Termos e da Política quando a versão muda ou a conta veio do Google/Apple */
@Component({
  selector: 'app-termos',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.user() && !auth.aceitouTermos()) {
      <div class="fundo"></div>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="termos-tit">
        <span class="ic"><app-icon name="gavel" [size]="26" /></span>
        <h2 id="termos-tit">Termos e privacidade</h2>
        <p>Para continuar, leia e aceite os <a routerLink="/termos">Termos de uso</a> e a <a routerLink="/privacidade">Política de privacidade</a> do CFP.</p>
        <button type="button" class="btn block" (click)="aceitar()" [disabled]="enviando()">Li e aceito</button>
      </div>
    }
  `,
  styles: `
    .fundo { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / 0.55); }
    .modal {
      position: fixed; z-index: 81; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 32px));
      background: var(--card); color: var(--ink); border-radius: 20px; padding: 22px 20px 18px; text-align: center;
      box-shadow: 0 20px 50px rgb(0 0 0 / 0.35); display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .ic { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); }
    p { margin: 0; color: var(--ink-2); font-size: 0.92rem; }
  `,
})
export class TermosModal {
  protected auth = inject(Auth);
  private toast = inject(Toast);
  protected enviando = signal(false);

  async aceitar() {
    this.enviando.set(true);
    try {
      await this.auth.aceitarTermos();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.enviando.set(false);
    }
  }
}
