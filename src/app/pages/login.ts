import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { conviteGuardado } from '../core/convite';
import { PROVEDORES } from '../core/legal';
import { Icon } from '../shared/icon';
import { VerSenha } from '../shared/ver-senha';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule, RouterLink, Icon, VerSenha],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // mesmo tema da apresentação: escuro azul
  host: { class: 'tema-escuro' },
  template: `
    <div class="wrap">
      <a routerLink="/apresentacao" class="voltar"><app-icon name="arrow_back" [size]="18" />Conhecer o CFP</a>
      <div class="brand">
        <img class="logo" src="logo.png" alt="CFP" />
        <h1>Controle Financeiro Pessoal</h1>
        <p class="muted">Lance gastos em segundos e veja para onde o dinheiro vai.</p>
      </div>

      @if (convite) {
        <p class="aviso"><app-icon name="group_add" [size]="20" />Você foi convidado para uma carteira (código {{ convite }}). Crie sua conta ou entre: o código já vem preenchido.</p>
      }
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
          <span class="senha-wrap">
            <input name="senha" [type]="verSenha() ? 'text' : 'password'" [(ngModel)]="senha" minlength="6" required
              [attr.autocomplete]="modo() === 'entrar' ? 'current-password' : 'new-password'" />
            <app-ver-senha [(ver)]="verSenha" />
          </span>
        </label>
        @if (modo() === 'cadastrar') {
          <label class="check aceite"><input type="checkbox" name="aceite" [(ngModel)]="aceite" />
            <span>Li e aceito os <a routerLink="/termos">Termos de uso</a> e a <a routerLink="/privacidade">Política de privacidade</a></span></label>
        }
        <button class="btn block" type="submit" [disabled]="enviando() || (modo() === 'cadastrar' && !aceite)">{{ modo() === 'entrar' ? 'Entrar' : 'Criar conta' }}</button>
        @if (modo() === 'entrar') {
          <button class="link" type="button" (click)="recuperar()">Esqueci minha senha</button>
        }
        @if (provedores.length) {
          <div class="ou"><span>ou</span></div>
          @for (p of provedores; track p) {
            <button class="btn ghost block social" type="button" [disabled]="enviando()" (click)="entrarCom(p)">
              @if (p === 'google') {
                <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                Continuar com Google
              } @else {
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1-2.8-4zM13.9 5c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z"/></svg>
                Continuar com Apple
              }
            </button>
          }
          @if (modo() === 'cadastrar') { <p class="small muted centro">Ao continuar com Google ou Apple, você aceita os Termos e a Política de privacidade.</p> }
        }
      </form>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--bg); color: var(--ink); }
    .wrap { min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; gap: 24px; padding: 24px 16px; max-width: 420px; margin: 0 auto; }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .logo { align-self: flex-start; width: 64px; height: 64px; }
    .voltar { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.88rem; align-self: flex-start; }
    .aviso { display: flex; gap: 10px; align-items: flex-start; background: var(--primary-soft); border-radius: 14px; padding: 12px; margin: 0; font-size: 0.9rem; font-weight: 600; }
    .link { background: none; border: 0; color: var(--primary); font: inherit; font-weight: 600; cursor: pointer; }
    .aceite { align-items: flex-start; font-size: 0.88rem; }
    .ou { display: flex; align-items: center; gap: 10px; color: var(--ink-3); font-size: 0.8rem; }
    .ou::before, .ou::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .social { gap: 10px; }
    .centro { text-align: center; margin: 0; }
  `,
})
export default class Login implements OnInit {
  /** ?criar=1 abre em Criar conta */
  readonly criar = input<string>();
  private auth = inject(Auth);
  private router = inject(Router);
  private toast = inject(Toast);

  protected convite = conviteGuardado();
  protected modo = signal<'entrar' | 'cadastrar'>('entrar');
  protected enviando = signal(false);
  protected verSenha = signal(false);
  protected provedores = PROVEDORES;
  nome = '';
  aceite = false;

  ngOnInit() {
    if (this.criar() || this.convite) this.modo.set('cadastrar');
  }

  email = '';
  senha = '';

  async enviar() {
    this.enviando.set(true);
    try {
      if (this.modo() === 'entrar') {
        const codigo = await this.auth.entrar(this.email, this.senha);
        this.router.navigateByUrl(codigo ? '/verificar' : '/');
      } else {
        if (!this.nome.trim()) throw new Error('Informe seu nome');
        if (!this.aceite) throw new Error('Aceite os Termos e a Política de privacidade');
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

  async entrarCom(p: 'google' | 'apple') {
    this.enviando.set(true);
    try {
      await this.auth.entrarCom(p);
    } catch (e) {
      this.toast.erro(e);
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
