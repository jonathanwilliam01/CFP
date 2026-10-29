import { Injectable, computed, signal } from '@angular/core';

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

function ler(): Bloco[] {
  try {
    const salvo: string[] = JSON.parse(localStorage.getItem('cfp.inicio') ?? '[]');
    const l = salvo.filter((id): id is Bloco => PADRAO.includes(id as Bloco));
    return [...l, ...PADRAO.filter((id) => !l.includes(id))];
  } catch {
    return PADRAO;
  }
}

/** Ordem dos blocos do Início, guardada no aparelho */
@Injectable({ providedIn: 'root' })
export class Painel {
  readonly ordem = signal<Bloco[]>(ler());
  readonly lista = computed(() => this.ordem().map((id) => BLOCOS.find((b) => b.id === id)!));

  /** Posição para o `order` do CSS; blocos fixos do topo ficam em 0 */
  pos(id: Bloco) {
    return this.ordem().indexOf(id) + 1;
  }

  mover(i: number, delta: number) {
    const l = [...this.ordem()];
    const j = i + delta;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    this.gravar(l);
  }

  restaurar() {
    this.gravar(PADRAO);
  }

  private gravar(l: Bloco[]) {
    this.ordem.set(l);
    localStorage.setItem('cfp.inicio', JSON.stringify(l));
  }
}
