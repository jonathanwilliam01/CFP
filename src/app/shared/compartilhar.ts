import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { Icon } from './icon';
import { Sheet } from './sheet';
import { Toast } from './toast';

/** Mensagem pronta para indicar o app */
export const TEXTO_APP = 'Uso o CFP para controlar as finanças: lanço um gasto em segundos e vejo contas do mês, cartões, orçamentos e quanto sobra. É grátis e dá para usar a dois. Experimenta:';

/** Compartilhar mensagem pronta + link nas redes; "Mais opções" abre o menu do aparelho (Instagram etc.) */
@Component({
  selector: 'app-compartilhar',
  imports: [Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [(open)]="open" [titulo]="titulo()">
      <p class="msg">{{ completo() }}</p>
      <div class="redes">
        @for (r of redes(); track r.nome) {
          <a class="rede" [href]="r.href" target="_blank" rel="noopener" (click)="open.set(false)">
            <span class="bola" [style.background]="r.cor"><app-icon [name]="r.icone" [size]="22" /></span>{{ r.nome }}
          </a>
        }
        <button class="rede" type="button" (click)="copiar()">
          <span class="bola cinza"><app-icon name="content_copy" [size]="22" /></span>Copiar
        </button>
        @if (temShare) {
          <button class="rede" type="button" (click)="mais()">
            <span class="bola cinza"><app-icon name="ios_share" [size]="22" /></span>Mais opções
          </button>
        }
      </div>
      @if (temShare) { <p class="small muted">Instagram e outros apps aparecem em Mais opções.</p> }
    </app-sheet>
  `,
  styles: `
    .msg { background: var(--card-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; white-space: pre-line; font-size: 0.9rem; margin: 0 0 14px; overflow-wrap: anywhere; }
    .redes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 6px; }
    .rede { display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: 0; font: inherit; font-size: 0.75rem; font-weight: 700; color: var(--ink); cursor: pointer; text-decoration: none; }
    .bola { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
    .cinza { background: var(--card-2); color: var(--ink); border: 1px solid var(--line); }
  `,
})
export class Compartilhar {
  readonly open = model(false);
  readonly titulo = input('Compartilhar');
  readonly texto = input.required<string>();
  readonly url = input.required<string>();
  private toast = inject(Toast);
  protected temShare = typeof navigator !== 'undefined' && !!navigator.share;

  protected completo = computed(() => `${this.texto()}\n${this.url()}`);
  protected redes = computed(() => {
    const t = encodeURIComponent(this.texto());
    const u = encodeURIComponent(this.url());
    const tudo = encodeURIComponent(this.completo());
    return [
      { nome: 'WhatsApp', icone: 'chat', cor: '#25d366', href: `https://wa.me/?text=${tudo}` },
      { nome: 'Telegram', icone: 'send', cor: '#229ed9', href: `https://t.me/share/url?url=${u}&text=${t}` },
      { nome: 'Facebook', icone: 'thumb_up', cor: '#1877f2', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
      { nome: 'X', icone: 'tag', cor: '#111', href: `https://x.com/intent/post?text=${t}&url=${u}` },
      { nome: 'LinkedIn', icone: 'work', cor: '#0a66c2', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
      { nome: 'E-mail', icone: 'mail', cor: '#ea4335', href: `mailto:?subject=${encodeURIComponent(this.titulo())}&body=${tudo}` },
    ];
  });

  async copiar() {
    try {
      await navigator.clipboard.writeText(this.completo());
      this.toast.ok('Mensagem copiada');
      this.open.set(false);
    } catch {
      this.toast.erro('Não deu para copiar');
    }
  }

  async mais() {
    try {
      await navigator.share({ title: this.titulo(), text: this.texto(), url: this.url() });
      this.open.set(false);
    } catch {
      // cancelado
    }
  }
}
