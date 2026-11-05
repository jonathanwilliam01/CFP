import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Comunicados } from '../core/comunicados';
import { Icon } from './icon';

/** Janela de destaque: um comunicado por vez */
@Component({
  selector: 'app-destaque',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'depois()' },
  template: `
    @if (c.destaque(); as d) {
      <div class="fundo" (click)="depois()"></div>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dest-tit" aria-describedby="dest-txt">
        <span class="ic"><app-icon name="campaign" [size]="26" /></span>
        <h2 id="dest-tit">{{ d.titulo }}</h2>
        <p id="dest-txt">{{ d.texto }}</p>
        <div class="bts">
          <button type="button" class="btn ghost" (click)="depois()" autofocus>Depois</button>
          @if (d.link) { <button type="button" class="btn" (click)="ver()">Ver</button> }
        </div>
      </div>
    }
  `,
  styles: `
    .fundo { position: fixed; inset: 0; z-index: 70; background: rgb(0 0 0 / 0.5); animation: aparece 0.15s; }
    .modal {
      position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 32px)); max-height: 80vh; overflow: auto;
      background: var(--card); color: var(--ink); border-radius: 20px; padding: 22px 20px 18px; text-align: center;
      box-shadow: 0 20px 50px rgb(0 0 0 / 0.35); display: flex; flex-direction: column; align-items: center; gap: 8px; animation: aparece 0.15s;
    }
    .ic { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--primary-soft, var(--bg)); color: var(--primary); }
    p { margin: 0; color: var(--ink-2); font-size: 0.92rem; white-space: pre-line; }
    .bts { display: flex; gap: 8px; width: 100%; margin-top: 8px; }
    .bts .btn { flex: 1; }
    @keyframes aparece { from { opacity: 0; } }
  `,
})
export class Destaque {
  protected c = inject(Comunicados);
  private router = inject(Router);

  depois() {
    const d = this.c.destaque();
    if (d) this.c.marcarLidos([d.id]);
  }

  ver() {
    const d = this.c.destaque();
    if (!d) return;
    this.c.marcarLidos([d.id]);
    if (!d.link) return;
    if (/^https?:\/\//i.test(d.link)) window.open(d.link, '_blank', 'noopener');
    else this.router.navigateByUrl(d.link);
  }
}
