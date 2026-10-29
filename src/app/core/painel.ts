import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Auth } from './auth';
import { supabase } from './supabase';

/** Blocos do Início na ordem padrão */
export const BLOCOS = [
  { id: 'recebimento', nome: 'Por recebimento' },
  { id: 'proximas', nome: 'Próximas contas' },
  { id: 'saldos', nome: 'Saldos de benefícios e cofrinhos' },
  { id: 'comprometida', nome: 'Renda comprometida' },
  { id: 'pessoas', nome: 'Quem gastou o quê' },
  { id: 'avisos', nome: 'Avisos' },
  { id: 'diaadia', nome: 'Saldo dia a dia' },
  { id: 'onde', nome: 'Onde está indo o dinheiro' },
  { id: 'orcamentos', nome: 'Orçamentos' },
  { id: 'ultimos', nome: 'Últimos gastos' },
  { id: 'dica', nome: 'Dica' },
] as const;
export type Bloco = (typeof BLOCOS)[number]['id'];

const PADRAO: Bloco[] = BLOCOS.map((b) => b.id);

/** Preferências do Início: ordem, blocos ocultos e recolhidos */
export interface Prefs {
  ordem: Bloco[];
  ocultos: Bloco[];
  fechados: Bloco[];
}

const validos = (l: unknown) => (Array.isArray(l) ? l.filter((id): id is Bloco => PADRAO.includes(id)) : []);

function normalizar(p: Partial<Prefs> | null | undefined): Prefs {
  const ordem = validos(p?.ordem);
  return { ordem: [...ordem, ...PADRAO.filter((id) => !ordem.includes(id))], ocultos: validos(p?.ocultos), fechados: validos(p?.fechados) };
}

function ler(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem('cfp.inicio') ?? 'null');
    // formato antigo: só a lista da ordem
    return normalizar(Array.isArray(v) ? { ordem: v } : v);
  } catch {
    return normalizar(null);
  }
}

/** Preferências do Início: cópia no aparelho e na conta (user_metadata.inicio), para valer em todo aparelho */
@Injectable({ providedIn: 'root' })
export class Painel {
  private auth = inject(Auth);
  readonly prefs = signal<Prefs>(ler());
  readonly lista = computed(() => {
    const p = this.prefs();
    return p.ordem.map((id) => ({ ...BLOCOS.find((b) => b.id === id)!, oculto: p.ocultos.includes(id) }));
  });
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const conta = this.auth.user()?.user_metadata?.['inicio'] as Partial<Prefs> | undefined;
      if (!conta || this.timer) return;
      const p = normalizar(conta);
      this.prefs.set(p);
      localStorage.setItem('cfp.inicio', JSON.stringify(p));
    });
  }

  /** Posição para o `order` do CSS; blocos fixos do topo ficam em 0 */
  pos(id: Bloco) {
    return this.prefs().ordem.indexOf(id) + 1;
  }

  oculto(id: Bloco) {
    return this.prefs().ocultos.includes(id);
  }

  fechado(id: Bloco) {
    return this.prefs().fechados.includes(id);
  }

  /** Move o bloco da posição i para j */
  mover(i: number, j: number) {
    const ordem = [...this.prefs().ordem];
    if (j < 0 || j >= ordem.length || i === j) return;
    ordem.splice(j, 0, ...ordem.splice(i, 1));
    this.gravar({ ...this.prefs(), ordem });
  }

  alternarOculto(id: Bloco) {
    this.gravar({ ...this.prefs(), ocultos: alterna(this.prefs().ocultos, id) });
  }

  alternarFechado(id: Bloco) {
    this.gravar({ ...this.prefs(), fechados: alterna(this.prefs().fechados, id) });
  }

  restaurar() {
    this.gravar(normalizar(null));
  }

  private gravar(p: Prefs) {
    this.prefs.set(p);
    localStorage.setItem('cfp.inicio', JSON.stringify(p));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      supabase.auth.updateUser({ data: { inicio: this.prefs() } }).finally(() => (this.timer = undefined));
    }, 1500);
  }
}

const alterna = (l: Bloco[], id: Bloco) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
