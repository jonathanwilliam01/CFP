import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Bloqueio } from '../core/bloqueio';
import { Icon } from '../shared/icon';

/** Tela de desbloqueio por cima de tudo: biometria ou PIN */
@Component({
  selector: 'app-bloqueio',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (b.travado()) {
      <div class="trava" role="dialog" aria-modal="true" aria-label="App bloqueado">
        <app-icon class="cad" name="lock" [size]="44" />
        <h1>CFP bloqueado</h1>
        <form (ngSubmit)="entrar()">
          <input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="PIN" aria-label="PIN"
            [ngModel]="pin()" (ngModelChange)="pin.set($event); erro.set(false)" [class.erro]="erro()" />
          <button class="btn block" [disabled]="pin().length < 4">Desbloquear</button>
        </form>
        @if (erro()) { <p class="neg small">PIN errado</p> }
        @if (b.cfg()?.cred) {
          <button class="btn ghost" type="button" (click)="b.biometria()"><app-icon name="fingerprint" [size]="20" />Usar biometria</button>
        }
        <button class="link small" type="button" (click)="esqueci()">Esqueci o PIN (sair da conta)</button>
      </div>
    } @else if (b.coberto()) {
      <div class="trava capa" aria-hidden="true"><app-icon class="cad" name="lock" [size]="44" /></div>
    }
  `,
  styles: `
    .trava {
      position: fixed; inset: 0; z-index: 100; background: var(--bg); color: var(--ink);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px;
    }
    .cad { color: var(--primary); }
    form { display: flex; flex-direction: column; gap: 10px; width: min(280px, 100%); }
    input { text-align: center; font-size: 1.4rem; letter-spacing: 0.4em; }
    input.erro { border-color: var(--danger); }
    .link { border: 0; background: none; color: var(--ink-3); cursor: pointer; text-decoration: underline; margin-top: 12px; font: inherit; }
  `,
})
export class BloqueioTela {
  protected b = inject(Bloqueio);
  private auth = inject(Auth);
  private router = inject(Router);
  protected pin = signal('');
  protected erro = signal(false);

  constructor() {
    // ao travar e ao voltar ao app já pede a biometria (não no blur: o próprio pedido tira o foco);
    // navegador que exige toque fica com o botão
    effect(() => {
      this.b.voltou();
      if (this.b.travado() && !document.hidden && untracked(this.b.cfg)?.cred) untracked(() => this.b.biometria());
    });
  }

  async entrar() {
    const ok = await this.b.conferirPin(this.pin());
    this.erro.set(!ok);
    this.pin.set('');
  }

  async esqueci() {
    if (!confirm('Sair da conta e desligar o bloqueio neste aparelho? Para voltar, entre com e-mail e senha.')) return;
    this.b.desativar();
    await this.auth.sair();
    this.router.navigateByUrl('/login');
  }
}
