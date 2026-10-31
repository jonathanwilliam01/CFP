import type { Foto } from './auth';

export type Forma = 'debito' | 'cartao' | 'beneficio';

export interface Carteira {
  id: string;
  nome: string;
  codigo: string;
  criado_por: string;
  /** mês em que começou a usar: antes dele não se navega nem compara (027) */
  inicio?: string | null;
  /** acerto entre os membros ligado (028) */
  divisao?: boolean;
}

export interface Membro {
  carteira_id: string;
  user_id: string;
  nome: string;
  papel: 'dono' | 'membro';
  /** cópia de user_metadata.foto (trigger 017) */
  foto: Foto | null;
  /** push às 21h sem gasto no dia (028) */
  lembrete?: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  tipo: 'gasto' | 'entrada';
  ordem: number;
}

export interface Cartao {
  id: string;
  nome: string;
  fechamento_dia: number;
  vencimento_dia: number;
  /** fecha N dias corridos antes do vencimento (Nubank, C6, Inter...); null = fecha no fechamento_dia (migration 031) */
  fecha_dias: number | null;
  limite: number | null;
  cor: string;
  padrao: boolean;
  ativo: boolean;
  /** fatura entra nas contas do mês anterior ao vencimento */
  paga_mes_anterior: boolean;
}

export interface Beneficio {
  id: string;
  nome: string;
  valor_mensal: number;
  dia_credito: number;
  acumula: boolean;
  inicio: string;
  ativo: boolean;
}

export interface Gasto {
  id: string;
  descricao: string;
  categoria_id: string | null;
  valor: number;
  data: string;
  forma: Forma;
  cartao_id: string | null;
  beneficio_id: string | null;
  fatura_mes: string | null;
  parcelamento_id: string | null;
  parcela: number | null;
  criado_por: string | null;
  /** marcadores livres (migration 020) */
  tags?: string[];
  /** acerto (028): quem pagou (null = quem lançou) e se entra na divisão */
  pago_por?: string | null;
  dividido?: boolean;
  /** confirmado como não duplicado (029) */
  nao_duplicado?: boolean;
}

export interface Parcelamento {
  id: string;
  descricao: string;
  categoria_id: string | null;
  cartao_id: string | null;
  valor_parcela: number;
  num_parcelas: number;
  primeira_data: string;
}

export interface Entrada {
  id: string;
  descricao: string;
  categoria_id: string | null;
  valor: number;
  data: string;
  criado_por: string | null;
}

export interface Recorrencia {
  id: string;
  tipo: 'conta' | 'entrada';
  descricao: string;
  categoria_id: string | null;
  valor: number;
  dia: number;
  inicio: string;
  fim: string | null;
  ativo: boolean;
  cartao_id: string | null;
  variavel: boolean;
  /** conta entra nas contas do mês anterior ao vencimento */
  paga_mes_anterior: boolean;
  /** paga com benefício: desconta do saldo dele e não entra nas saídas */
  beneficio_id: string | null;
  /** recorrência anterior encerrada pelo reajuste */
  reajuste_de?: string | null;
}

export interface Pagamento {
  id: string;
  tipo: 'recorrencia' | 'fatura';
  ref_id: string;
  mes: string;
  valor: number;
  /** null: valor do mês informado (conta variável), ainda não pago */
  pago_em: string | null;
}

export interface Cofrinho {
  id: string;
  nome: string;
  meta: number;
  prazo: string | null;
  icone: string;
  cor: string;
  /** plano de depósitos (migration 021) */
  deposito?: number | null;
  frequencia?: Frequencia | null;
  /** reserva de emergência (028) */
  emergencia?: boolean;
}

export type Frequencia = 'semana' | 'quinzena' | 'mes';

export interface CofrinhoMov {
  id: string;
  cofrinho_id: string;
  valor: number;
  data: string;
  descricao: string | null;
}

export interface Orcamento {
  id: string;
  categoria_id: string | null;
  valor: number;
  alerta_pct: number;
  /** só gastos nessa forma (cartão: no cartao_id, pela fatura do mês); null = qualquer (migration 022) */
  forma?: 'debito' | 'cartao' | null;
  cartao_id?: string | null;
  /** o que falta gastar do limite entra nas saídas previstas */
  reserva?: boolean;
  /** só em memória (orcamentosNoMes): sobra desconsiderada no mês, id em orcamento_fechados */
  fechado_id?: string;
}

/** Mês em que a sobra do orçamento deixou de ser reservada */
export interface OrcamentoFechado {
  id: string;
  orcamento_id: string;
  mes: string;
}

/** Limite do orçamento de mes até ate (null = daí em diante) */
export interface OrcamentoValor {
  id: string;
  orcamento_id: string;
  mes: string;
  ate: string | null;
  valor: number;
  criado_em: string;
}

export interface Plano {
  id: string;
  tipo: 'entrada' | 'saida';
  descricao: string;
  valor: number;
  mes: string;
  /** repete todo ano no mesmo mês (028) */
  anual?: boolean;
}

export interface Registro {
  id: string;
  nome: string;
  icone: string;
  cor: string;
}

export interface RegistroItem {
  id: string;
  registro_id: string;
  descricao: string;
  valor: number;
  data: string;
  obs: string | null;
}

export interface Acerto {
  id: string;
  mes: string;
  de: string;
  para: string;
  valor: number;
}

export interface Receber {
  id: string;
  descricao: string;
  pessoa: string | null;
  valor: number;
  data: string;
  recebido_em: string | null;
}

export interface Divida {
  id: string;
  descricao: string;
  credor: string | null;
  valor_parcela: number;
  num_parcelas: number;
  /** contagem manual quando não está ligada a conta fixa */
  pagas: number;
  inicio: string;
  recorrencia_id: string | null;
}

export interface Desafio {
  id: string;
  descricao: string;
  categoria_id: string | null;
  /** parte da descrição do gasto (ex.: ifood) */
  termo: string | null;
  limite: number;
  inicio: string;
  fim: string;
}

/** Item da aba Contas: conta fixa ou fatura de cartão no mês */
export interface ContaMes {
  tipo: 'recorrencia' | 'fatura';
  ref_id: string;
  descricao: string;
  icone: string;
  cor: string;
  vencimento: string;
  /** mês da baixa (na fatura, o mês da fatura) */
  mes: string;
  valor: number;
  pago: Pagamento | null;
  /** valor previsto pela média de conta variável */
  media?: boolean;
  /** valor do mês informado, ainda não pago */
  informado?: Pagamento | null;
  /** conta fixa paga com benefício */
  beneficio_id?: string | null;
}

export interface Mensagem {
  id: string;
  user_id: string;
  texto: string;
  criado_em: string;
  /** gasto comentado (migration 020) */
  gasto_id?: string | null;
  /** migration 026 */
  editado_em?: string | null;
}

/** Soma dos gastos de um benefício no mês (RPC uso_beneficios) */
export interface UsoBeneficio {
  beneficio_id: string;
  mes: string;
  total: number;
}

/** Tabelas gravadas pelo Store.salvar/excluir */
export interface Tabelas {
  categorias: Categoria;
  cartoes: Cartao;
  beneficios: Beneficio;
  gastos: Gasto;
  entradas: Entrada;
  recorrencias: Recorrencia;
  pagamentos: Pagamento;
  parcelamentos: Parcelamento;
  cofrinhos: Cofrinho;
  cofrinho_movs: CofrinhoMov;
  orcamentos: Orcamento;
  orcamento_valores: OrcamentoValor;
  orcamento_fechados: OrcamentoFechado;
  planos: Plano;
  registros: Registro;
  registro_itens: RegistroItem;
  acertos: Acerto;
  receber: Receber;
  dividas: Divida;
  desafios: Desafio;
}

export type Tabela = keyof Tabelas;

/** Sem id insere, com id atualiza só os campos informados */
export type Dados<T extends Tabela> = Partial<Omit<Tabelas[T], 'id'>> & { id?: string };
