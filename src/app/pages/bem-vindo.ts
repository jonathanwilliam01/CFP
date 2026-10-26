import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Store } from '../core/store';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <h1>Olá, {{ auth.nome() }}</h1>
      <p class="muted">Crie uma carteira para vocês ou entre na de alguém com o código de convite.</p>

      <form class="card form" (ngSubmit)="criar()">
        <h2>Criar carteira</h2>
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="nome" placeholder="Ex.: Casa" /></label>
        <button class="btn block" [disabled]="enviando()">Criar</button>
      </form>

      <form class="card form" (ngSubmit)="entrar()">
        <h2>Tenho um código</h2>
        <label class="field"><span>Código de convite</span>
          <input name="codigo" [(ngModel)]="codigo" placeholder="ABCD2345" maxlength="8" class="cod" />
        </label>
        <button class="btn ghost block" [disabled]="enviando()">Entrar na carteira</button>
      </form>

      <button class="sair" type="button" (click)="sair()">Sair</button>
    </div>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; gap: 16px; padding: 24px 16px; max-width: 420px; margin: 0 auto; }
    .cod { text-transform: uppercase; letter-spacing: 0.2em; font-weight: 700; }
    .sair { background: none; border: 0; color: var(--ink-2); font: inherit; cursor: pointer; }
  `,
})
export default class BemVindo {
  protected auth = inject(Auth);
  private s = inject(Store);
  private router = inject(Router);
  private toast = inject(Toast);
  protected enviando = signal(false);
  nome = 'Casa';
  codigo = '';

  private async exec(f: () => Promise<void>) {
    this.enviando.set(true);
    try {
      await f();
      this.router.navigateByUrl('/');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.enviando.set(false);
    }
  }

  criar() {
    return this.exec(() => this.s.criarCarteira(this.nome.trim() || 'Casa'));
  }

  entrar() {
    return this.exec(() => this.s.entrarCarteira(this.codigo));
  }

  async sair() {
    await this.auth.sair();
    this.router.navigateByUrl('/login');
  }
}
