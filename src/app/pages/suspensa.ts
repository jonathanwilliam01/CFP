import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <h1>Conta suspensa</h1>
      <p class="muted">Conta suspensa. Fale com o suporte.</p>
      <button class="btn ghost" type="button" (click)="sair()">Sair</button>
    </div>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 16px; padding: 24px 16px; text-align: center; }
  `,
})
export default class Suspensa {
  private auth = inject(Auth);
  private router = inject(Router);

  async sair() {
    await this.auth.sair();
    this.router.navigateByUrl('/login');
  }
}
