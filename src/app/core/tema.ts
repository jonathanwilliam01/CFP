import { Injectable, computed, effect, signal } from '@angular/core';

export type ModoTema = 'auto' | 'claro' | 'escuro';

@Injectable({ providedIn: 'root' })
export class Tema {
  readonly modo = signal<ModoTema>((localStorage.getItem('cfp.tema') as ModoTema) || 'auto');
  private sistemaEscuro = signal(false);
  readonly escuro = computed(() => (this.modo() === 'auto' ? this.sistemaEscuro() : this.modo() === 'escuro'));

  constructor() {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    this.sistemaEscuro.set(mq.matches);
    mq.addEventListener('change', (e) => this.sistemaEscuro.set(e.matches));

    effect(() => {
      const m = this.modo();
      const html = document.documentElement;
      if (m === 'auto') delete html.dataset['theme'];
      else html.dataset['theme'] = m === 'escuro' ? 'dark' : 'light';
      localStorage.setItem('cfp.tema', m);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.escuro() ? '#0d1119' : '#1d5bd8');
    });
  }

  alternar() {
    this.modo.set(this.escuro() ? 'claro' : 'escuro');
  }
}
