import { Injectable, computed, effect, signal } from '@angular/core';

export type ModoTema = 'auto' | 'claro' | 'escuro';

/** Cor principal no tema claro (barra do navegador); o escuro usa o fundo */
export const CORES = {
  azul: { hex: '#1d5bd8', nome: 'Azul' },
  indigo: { hex: '#4338ca', nome: 'Índigo' },
  roxo: { hex: '#7c3aed', nome: 'Roxo' },
  rosa: { hex: '#db2777', nome: 'Rosa' },
  vinho: { hex: '#9f1239', nome: 'Vinho' },
  vermelho: { hex: '#d0353f', nome: 'Vermelho' },
  laranja: { hex: '#d9620b', nome: 'Laranja' },
  verde: { hex: '#15803d', nome: 'Verde' },
  ciano: { hex: '#0e7490', nome: 'Ciano' },
  grafite: { hex: '#475569', nome: 'Grafite' },
} as const;
export type Cor = keyof typeof CORES;

@Injectable({ providedIn: 'root' })
export class Tema {
  readonly modo = signal<ModoTema>((localStorage.getItem('cfp.tema') as ModoTema) || 'auto');
  readonly cor = signal<Cor>(localStorage.getItem('cfp.cor') as Cor in CORES ? (localStorage.getItem('cfp.cor') as Cor) : 'azul');
  private sistemaEscuro = signal(false);
  readonly escuro = computed(() => (this.modo() === 'auto' ? this.sistemaEscuro() : this.modo() === 'escuro'));

  constructor() {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    this.sistemaEscuro.set(mq.matches);
    mq.addEventListener('change', (e) => this.sistemaEscuro.set(e.matches));

    effect(() => {
      const m = this.modo();
      const c = this.cor();
      const html = document.documentElement;
      if (m === 'auto') delete html.dataset['theme'];
      else html.dataset['theme'] = m === 'escuro' ? 'dark' : 'light';
      if (c === 'azul') delete html.dataset['cor'];
      else html.dataset['cor'] = c;
      localStorage.setItem('cfp.tema', m);
      localStorage.setItem('cfp.cor', c);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.escuro() ? '#0d1119' : CORES[c].hex);
    });
  }

  alternar() {
    this.modo.set(this.escuro() ? 'claro' : 'escuro');
  }
}
