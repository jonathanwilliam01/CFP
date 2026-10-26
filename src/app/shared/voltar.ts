import { DestroyRef, Injectable, effect, inject, untracked } from '@angular/core';

/** Painéis abertos ocupam uma entrada no histórico: o voltar do celular/navegador fecha o de cima */
@Injectable({ providedIn: 'root' })
export class Voltar {
  private pilha: { id: number; fechar: () => void }[] = [];
  private seq = 0;
  private ignorar = 0;
  private pendentes = 0;

  constructor() {
    addEventListener('popstate', () => {
      if (this.ignorar) this.ignorar--;
      else this.pilha.pop()?.fechar();
    });
  }

  abrir(fechar: () => void) {
    const id = ++this.seq;
    this.pilha.push({ id, fechar });
    history.pushState({ ...history.state, camada: id }, '');
    return id;
  }

  /** Fechado pela tela: tira a entrada do histórico (vários no mesmo ciclo viram um só go) */
  fechar(id: number) {
    if (!this.descartar(id)) return;
    if (this.pendentes++) return;
    queueMicrotask(() => {
      this.ignorar++;
      history.go(-this.pendentes);
      this.pendentes = 0;
    });
  }

  /** Só esquece o painel, sem mexer no histórico (painel destruído por troca de página) */
  descartar(id: number) {
    const i = this.pilha.findIndex((c) => c.id === id);
    if (i >= 0) this.pilha.splice(i, 1);
    return i >= 0;
  }
}

/** Liga um estado aberto/fechado ao voltar. Chamar no construtor. */
export function fecharNoVoltar(aberto: () => boolean, fechar: () => void) {
  const v = inject(Voltar);
  let id = 0;
  effect(() => {
    const a = aberto();
    untracked(() => {
      if (a && !id)
        id = v.abrir(() => {
          id = 0;
          fechar();
        });
      else if (!a && id) {
        v.fechar(id);
        id = 0;
      }
    });
  });
  inject(DestroyRef).onDestroy(() => id && v.descartar(id));
}
