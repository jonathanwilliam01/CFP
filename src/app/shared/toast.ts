import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Toast {
  readonly msg = signal<{ texto: string; erro: boolean; desfazer?: () => void } | null>(null);
  private t: ReturnType<typeof setTimeout> | undefined;
  /** ação adiada à espera do "Desfazer" */
  private pendente: (() => void) | null = null;

  constructor() {
    // app fechado ou em segundo plano: executa já o que estava esperando
    addEventListener('pagehide', () => this.pendente?.());
    document.addEventListener('visibilitychange', () => document.hidden && this.pendente?.());
  }

  ok(texto: string) {
    this.mostrar(texto, false);
  }

  erro(e: unknown) {
    this.mostrar(e instanceof Error ? e.message : String(e), true);
  }

  /** Ação já feita: mostra a mensagem com "Desfazer" por 5s */
  feito(texto: string, desfazer: () => Promise<unknown>) {
    this.msg.set({
      texto, erro: false,
      desfazer: () => {
        this.msg.set(null);
        desfazer().catch((e) => this.erro(e));
      },
    });
    clearTimeout(this.t);
    this.t = setTimeout(() => this.msg.set(null), 5000);
  }

  /** Mostra a mensagem com "Desfazer" e só executa a ação se não for desfeita em 5s */
  adiar(texto: string, acao: () => Promise<unknown>, desfeita: () => unknown) {
    this.pendente?.();
    let fim = false;
    const executar = () => {
      if (fim) return;
      fim = true;
      this.pendente = null;
      acao().catch((e) => {
        this.erro(e);
        desfeita();
      });
    };
    this.pendente = executar;
    this.msg.set({
      texto, erro: false,
      desfazer: () => {
        fim = true;
        this.pendente = null;
        this.msg.set(null);
        desfeita();
      },
    });
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      executar();
      if (this.msg()?.texto === texto) this.msg.set(null);
    }, 5000);
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
      <div class="toast" [class.erro]="m.erro" role="status" (click)="m.desfazer || toast.msg.set(null)">
        {{ m.texto }}
        @if (m.desfazer) {
          <button type="button" (click)="m.desfazer()">Desfazer</button>
        }
      </div>
    }
  `,
  styles: `
    .toast {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(var(--nav-h) + var(--safe-b) + 84px); z-index: 60;
      background: var(--ink); color: var(--bg); font-weight: 600;
      padding: 12px 18px; border-radius: 14px; max-width: calc(100vw - 32px);
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.2); animation: pop 0.2s;
      display: flex; align-items: center; gap: 14px;
    }
    button {
      border: 0; background: none; font: inherit; font-weight: 800; color: var(--primary-soft);
      padding: 4px 2px; cursor: pointer; text-transform: uppercase; font-size: 0.82rem; letter-spacing: 0.03em;
    }
    .erro { background: var(--danger); color: #fff; }
    @keyframes pop { from { opacity: 0; transform: translate(-50%, 10px); } }
  `,
})
export class ToastView {
  protected toast = inject(Toast);
}
