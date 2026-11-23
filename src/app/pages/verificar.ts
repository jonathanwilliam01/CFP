import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

/** Segunda etapa do login: código de 6 dígitos do app autenticador */
@Component({
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tema-escuro' },
  template: `
    <div class="wrap">
      <div class="brand">
        <img class="logo" src="logo.png" alt="CFP" />
        <h1>Verificação em duas etapas</h1>
        <p class="muted">Abra o app autenticador (Google Authenticator, Authy, 1Password…) e digite o código do CFP.</p>
      </div>
      <form class="card form" (ngSubmit)="enviar()">
        <label class="field"><span>Código</span>
          <input name="codigo" [(ngModel)]="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" autofocus required />
        </label>
        <button class="btn block" type="submit" [disabled]="enviando() || codigo.replace(' ', '').length < 6">Confirmar</button>
        <button class="link" type="button" (click)="sair()"><app-icon name="logout" [size]="16" />Entrar com outra conta</button>
      </form>
      <p class="small muted">Perdeu o acesso ao autenticador? Fale com o suporte para recuperar a conta.</p>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--bg); color: var(--ink); }
    .wrap { min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; gap: 24px; padding: 24px 16px; max-width: 420px; margin: 0 auto; }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .logo { align-self: flex-start; width: 64px; height: 64px; }
    input[name='codigo'] { font-size: 1.4rem; letter-spacing: 0.3em; text-align: center; }
    .link { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: none; border: 0; color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; }
  `,
})
export default class Verificar {
  private auth = inject(Auth);
  private router = inject(Router);
  private toast = inject(Toast);
  protected enviando = signal(false);
  codigo = '';

  async enviar() {
    this.enviando.set(true);
    try {
      await this.auth.verificarCodigo(this.codigo);
      this.router.navigateByUrl('/');
    } catch (e) {
      this.toast.erro(e);
      this.codigo = '';
    } finally {
      this.enviando.set(false);
    }
  }

  async sair() {
    await this.auth.sair();
    this.router.navigateByUrl('/login');
  }
}
