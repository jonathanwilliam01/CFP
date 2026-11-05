import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Icon } from './icon';
import { Toast } from './toast';

/** Sair da conta com confirmação (modal no Shell) */
@Injectable({ providedIn: 'root' })
export class Saida {
  readonly aberto = signal(false);

  abrir() {
    this.aberto.set(true);
  }
}

@Component({
  selector: 'app-sair',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'saida.aberto.set(false)' },
  template: `
    @if (saida.aberto()) {
      <div class="fundo" (click)="saida.aberto.set(false)"></div>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="sair-tit" aria-describedby="sair-txt">
        <span class="ic"><app-icon name="logout" [size]="26" /></span>
        <h2 id="sair-tit">Sair do app?</h2>
        <p id="sair-txt">Para voltar, entre de novo com e-mail e senha. Os avisos com o app fechado param neste aparelho.</p>
        <div class="bts">
          <button type="button" class="btn ghost" (click)="saida.aberto.set(false)" [disabled]="saindo()" autofocus>Cancelar</button>
          <button type="button" class="btn sair" (click)="sair()" [disabled]="saindo()">{{ saindo() ? 'Saindo...' : 'Sair' }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .fundo { position: fixed; inset: 0; z-index: 70; background: rgb(0 0 0 / 0.5); animation: aparece 0.15s; }
    .modal {
      position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(360px, calc(100vw - 32px));
      background: var(--card); color: var(--ink); border-radius: 20px; padding: 22px 20px 18px; text-align: center;
      box-shadow: 0 20px 50px rgb(0 0 0 / 0.35); display: flex; flex-direction: column; align-items: center; gap: 8px; animation: aparece 0.15s;
    }
    .ic { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--danger-soft); color: var(--danger); }
    p { margin: 0; color: var(--ink-2); font-size: 0.92rem; }
    .bts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; margin-top: 8px; }
    .sair { background: var(--danger); color: #fff; }
    @keyframes aparece { from { opacity: 0; } }
  `,
})
export class SairModal {
  protected saida = inject(Saida);
  private auth = inject(Auth);
  private router = inject(Router);
  private toast = inject(Toast);
  protected saindo = signal(false);

  async sair() {
    this.saindo.set(true);
    try {
      await this.auth.sair();
      this.saida.aberto.set(false);
      this.router.navigateByUrl('/apresentacao');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.saindo.set(false);
    }
  }
}
