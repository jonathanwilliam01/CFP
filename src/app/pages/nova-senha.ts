import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Toast } from '../shared/toast';

/** Destino do link de "Esqueci minha senha": a sessão já veio do link */
@Component({
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="brand">
        <span class="logo">CFP</span>
        <h1>Nova senha</h1>
        <p class="muted">{{ auth.user()?.email }}</p>
      </div>
      <form class="card form" (ngSubmit)="salvar()">
        <label class="field"><span>Nova senha</span>
          <input name="senha" type="password" [(ngModel)]="senha" minlength="6" required autocomplete="new-password" />
        </label>
        <label class="field"><span>Repita a senha</span>
          <input name="repete" type="password" [(ngModel)]="repete" minlength="6" required autocomplete="new-password" />
        </label>
        <button class="btn block" type="submit" [disabled]="enviando()">Salvar senha</button>
      </form>
    </div>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; gap: 24px; padding: 24px 16px; max-width: 420px; margin: 0 auto; }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .logo { align-self: flex-start; font-weight: 800; letter-spacing: 0.04em; background: var(--primary); color: var(--primary-ink); border-radius: 12px; padding: 8px 12px; font-size: 1.2rem; }
  `,
})
export default class NovaSenha {
  protected auth = inject(Auth);
  private router = inject(Router);
  private toast = inject(Toast);
  protected enviando = signal(false);
  senha = '';
  repete = '';

  async salvar() {
    if (this.senha.length < 6) return this.toast.erro('A senha precisa ter ao menos 6 caracteres');
    if (this.senha !== this.repete) return this.toast.erro('As senhas não conferem');
    this.enviando.set(true);
    try {
      await this.auth.trocarSenha(this.senha);
      this.toast.ok('Senha alterada');
      this.router.navigateByUrl('/');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.enviando.set(false);
    }
  }
}
