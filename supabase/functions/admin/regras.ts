const ACOES = ['suspender', 'reativar', 'excluir'];

/** Mensagem de erro, ou null quando a ação é permitida */
export function podeAgir(chamador: string, alvo: string, acao: string): string | null {
  if (!ACOES.includes(acao)) return 'Ação inválida';
  if (chamador === alvo) return 'Não é possível agir sobre a própria conta';
  return null;
}
