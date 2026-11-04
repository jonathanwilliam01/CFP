import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

// o CSS do contêiner usa grid-auto-rows: 4px e row-gap: 0; GAP = espaço entre blocos
const LINHA = 4;
const GAP = 14;

/**
 * Mosaico: no computador largo cada filho ocupa tantas linhas finas da grade quanto a própria altura,
 * então um bloco curto não deixa buraco ao lado do comprido. Fora da media query os filhos ficam como estão.
 */
@Directive({ selector: '[mosaico]' })
export class Mosaico {
  private el: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    const mq = matchMedia('(min-width: 1200px)');
    const ro = new ResizeObserver(() => this.ajustar(mq.matches));
    const observar = () => {
      ro.disconnect();
      for (const c of Array.from(this.el.children)) ro.observe(c);
      this.ajustar(mq.matches);
    };
    const mo = new MutationObserver(observar);
    const troca = () => this.ajustar(mq.matches);
    afterNextRender(() => {
      observar();
      mo.observe(this.el, { childList: true });
      mq.addEventListener('change', troca);
    });
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener('change', troca);
    });
  }

  private ajustar(ligado: boolean) {
    for (const c of Array.from(this.el.children) as HTMLElement[]) {
      const h = c.getBoundingClientRect().height;
      c.style.gridRowEnd = ligado && h ? `span ${Math.ceil((h + GAP) / LINHA)}` : '';
    }
  }
}
