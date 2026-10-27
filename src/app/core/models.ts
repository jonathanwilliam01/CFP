import type { Foto } from './auth';

export type Forma = 'debito' | 'cartao' | 'beneficio';

export interface Carteira {
  id: string;
  nome: string;
  codigo: string;
  criado_por: string;
}

export interface Membro {
  carteira_id: string;
  user_id: string;
  nome: string;
  papel: 'dono' | 'membro';
  /** cópia de user_metadata.foto (trigger 017) */
  foto: Foto | null;
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
}

export interface Pagamento {
  id: string;
  tipo: 'recorrencia' | 'fatura';
  ref_id: string;
  mes: string;
  valor: number;
  pago_em: string;
}

export interface Cofrinho {
  id: string;
  nome: string;
  meta: number;
  prazo: string | null;
  icone: string;
  cor: string;
}

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
}

export interface Plano {
  id: string;
  tipo: 'entrada' | 'saida';
  descricao: string;
  valor: number;
  mes: string;
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
  /** conta fixa paga com benefício */
  beneficio_id?: string | null;
}

export interface Mensagem {
  id: string;
  user_id: string;
  texto: string;
  criado_em: string;
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
  planos: Plano;
  registros: Registro;
  registro_itens: RegistroItem;
}

export type Tabela = keyof Tabelas;

/** Sem id insere, com id atualiza só os campos informados */
export type Dados<T extends Tabela> = Partial<Omit<Tabelas[T], 'id'>> & { id?: string };
