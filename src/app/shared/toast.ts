import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Toast {
  readonly msg = signal<{ texto: string; erro: boolean } | null>(null);
  private t: ReturnType<typeof setTimeout> | undefined;

  ok(texto: string) {
    this.mostrar(texto, false);
  }

  erro(e: unknown) {
    this.mostrar(e instanceof Error ? e.message : String(e), true);
  }

  private mostrar(texto: string, erro: boolean) {
    this.msg.set({ texto, erro });
    clearTimeout(this.t);
    this.t = setTimeout(() => this.msg.set(null), erro ? 4500 : 2200);
  }
}

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.msg(); as m) {
      <div class="toast" [class.erro]="m.erro" role="status" (click)="toast.msg.set(null)">{{ m.texto }}</div>
    }
  `,
  styles: `
    .toast {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(var(--nav-h) + var(--safe-b) + 84px); z-index: 60;
      background: var(--ink); color: var(--bg); font-weight: 600;
      padding: 12px 18px; border-radius: 14px; max-width: calc(100vw - 32px);
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.2); animation: pop 0.2s;
    }
    .erro { background: var(--danger); color: #fff; }
    @keyframes pop { from { opacity: 0; transform: translate(-50%, 10px); } }
  `,
})
export class ToastView {
  protected toast = inject(Toast);
}
