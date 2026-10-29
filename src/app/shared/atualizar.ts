import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Icon } from './icon';

/** Procura versão nova do app ao abrir, ao voltar para ele e a cada 30 min (só no build de produção, com service worker) */
@Injectable({ providedIn: 'root' })
export class Atualizacao {
  private sw = inject(SwUpdate);
  readonly pronta = signal(false);

  constructor() {
    if (!this.sw.isEnabled) return;
    this.sw.versionUpdates.subscribe((e) => e.type === 'VERSION_READY' && this.pronta.set(true));
    this.sw.unrecoverable.subscribe(() => this.pronta.set(true));
    navigator.serviceWorker?.ready.then(() => this.verificar());
    document.addEventListener('visibilitychange', () => !document.hidden && this.verificar());
    setInterval(() => this.verificar(), 30 * 60_000);
  }

  verificar() {
    this.sw.checkForUpdate().catch(() => undefined);
  }

  async atualizar() {
    await this.sw.activateUpdate().catch(() => undefined);
    location.reload();
  }
}

@Component({
  selector: 'app-atualizar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (a.pronta()) {
      <button type="button" class="flag" (click)="a.atualizar()">
        <app-icon name="system_update" [size]="20" />
        <span><b>Nova versão disponível</b><small>Toque para atualizar</small></span>
        <app-icon name="refresh" [size]="20" />
      </button>
    }
  `,
  styles: `
    .flag {
      position: fixed; z-index: 45; left: 50%; transform: translateX(-50%);
      top: calc(env(safe-area-inset-top, 0px) + 66px);
      display: flex; align-items: center; gap: 10px; padding: 10px 16px; border: 0; border-radius: 999px; cursor: pointer;
      background: var(--primary); color: var(--primary-ink); font: inherit; text-align: left; white-space: nowrap;
      box-shadow: 0 10px 26px color-mix(in srgb, var(--primary) 40%, transparent);
      animation: entra 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    span { display: flex; flex-direction: column; line-height: 1.2; }
    b { font-size: 0.88rem; }
    small { font-size: 0.75rem; opacity: 0.85; }
    @keyframes entra { from { opacity: 0; transform: translate(-50%, -12px); } }
  `,
})
export class Atualizar {
  protected a = inject(Atualizacao);
}
