// Versão: v1.AA.MM.N (AA = ano, MM = mês, N = build publicado no mês). Nova entrega entra no topo.

export interface Nota {
  versao: string;
  data: string;
  itens: string[];
}

export const NOTAS: Nota[] = [
  {
    versao: 'v1.26.10.2',
    data: '2026-10-26',
    itens: [
      'Chat entre os membros da carteira, com aviso de mensagem nova',
      'Importação da fatura do Nubank (CSV) com categoria sugerida, parcelas e aviso de gasto já lançado',
      'Voltar do celular fecha o painel aberto (lançamento, edição, foto) em vez de sair da página',
      'Conta fixa com opção de pagar com o salário do mês anterior ao vencimento',
    ],
  },
  {
    versao: 'v1.26.10.1',
    data: '2026-10-26',
    itens: [
      'Primeira versão do CFP',
      'Lançamento rápido de gastos, entradas e compras parceladas',
      'Cartões com fechamento, vencimento, cartão padrão e fatura nas contas do mês',
      'Compras no crédito do mês por cartão, com a fatura em que cada uma cai',
      'Opção no cartão para pagar a fatura com o salário do mês anterior ao vencimento',
      'Contas fixas e entradas fixas (salário) com baixa mensal',
      'Contas fixas cobradas no cartão: entram na fatura aberta, vencem com ela e são pagas junto',
      'Contas de valor variável (ex.: luz) com previsão pela média das últimas contas',
      'Benefícios (VR/VA) descontados sem entrar nas contas do mês',
      'Cofrinhos com meta, histórico e percentual',
      'Orçamentos por categoria com bandeiras vermelhas',
      'Planejamento dos próximos meses, relatórios e resumo mensal',
      'Registros avulsos (ex.: gastos com o carro) fora das contas do mês',
      'Notificações, dicas e carteira compartilhada por código de convite',
      'Tema claro/escuro/automático',
      'Desktop com menu lateral recolhível e acesso à conta do usuário no topo',
      'Foto de perfil com visualização e ajuste de enquadramento (zoom e posição)',
      'Instalável no celular como "Controle Financeiro"',
    ],
  },
];

export const VERSAO = NOTAS[0].versao;
