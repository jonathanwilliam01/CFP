import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="brand">
        <span class="logo">CFP</span>
        <h1>Controle Financeiro Pessoal</h1>
        <p class="muted">Lance gastos em segundos e veja para onde o dinheiro vai.</p>
      </div>

      <form class="card form" (ngSubmit)="enviar()">
        <div class="seg">
          <button type="button" [class.on]="modo() === 'entrar'" (click)="modo.set('entrar')">Entrar</button>
          <button type="button" [class.on]="modo() === 'cadastrar'" (click)="modo.set('cadastrar')">Criar conta</button>
        </div>
        @if (modo() === 'cadastrar') {
          <label class="field"><span>Seu nome</span><input name="nome" [(ngModel)]="nome" autocomplete="given-name" required /></label>
        }
        <label class="field"><span>E-mail</span><input name="email" type="email" [(ngModel)]="email" autocomplete="email" required /></label>
        <label class="field"><span>Senha</span>
          <input name="senha" type="password" [(ngModel)]="senha" minlength="6" required
            [attr.autocomplete]="modo() === 'entrar' ? 'current-password' : 'new-password'" />
        </label>
        <button class="btn block" type="submit" [disabled]="enviando()">{{ modo() === 'entrar' ? 'Entrar' : 'Criar conta' }}</button>
        @if (modo() === 'entrar') {
          <button class="link" type="button" (click)="recuperar()">Esqueci minha senha</button>
        }
      </form>
    </div>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; gap: 24px; padding: 24px 16px; max-width: 420px; margin: 0 auto; }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .logo { align-self: flex-start; font-weight: 800; letter-spacing: 0.04em; background: var(--primary); color: var(--primary-ink); border-radius: 12px; padding: 8px 12px; font-size: 1.2rem; }
    .link { background: none; border: 0; color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; }
  `,
})
export default class Login {
  private auth = inject(Auth);
  private router = inject(Router);
  private toast = inject(Toast);

  protected modo = signal<'entrar' | 'cadastrar'>('entrar');
  protected enviando = signal(false);
  nome = '';
  email = '';
  senha = '';

  async enviar() {
    this.enviando.set(true);
    try {
      if (this.modo() === 'entrar') {
        await this.auth.entrar(this.email, this.senha);
        this.router.navigateByUrl('/');
      } else {
        if (!this.nome.trim()) throw new Error('Informe seu nome');
        const logou = await this.auth.cadastrar(this.nome.trim(), this.email, this.senha);
        if (logou) this.router.navigateByUrl('/bem-vindo');
        else {
          this.toast.ok('Conta criada! Confirme pelo link enviado ao seu e-mail.');
          this.modo.set('entrar');
        }
      }
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.enviando.set(false);
    }
  }

  async recuperar() {
    if (!this.email) return this.toast.erro('Digite seu e-mail acima');
    try {
      await this.auth.recuperar(this.email);
      this.toast.ok('Enviamos um link para redefinir a senha');
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
