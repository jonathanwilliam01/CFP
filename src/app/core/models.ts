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
  /** meta de sobra do mês, em % das entradas (033) */
  meta_sobra?: number | null;
  criado_em?: string;
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
  /** push quando outro membro lança gasto (034) */
  push_gastos?: boolean;
  /** push com o resumo do mês no dia 1 (035) */
  resumo_mensal?: boolean;
  /** push no dia em que a fatura fecha e lembrete semanal dos saldos (037) */
  push_fatura?: boolean;
  lembrete_saldos?: boolean;
  /** % do membro na divisão; null em todos = por igual (043) */
  peso?: number | null;
}

export interface Categoria {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  tipo: 'gasto' | 'entrada';
  ordem: number;
  /** dedutível no Imposto de Renda (033) */
  dedutivel?: boolean;
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
  /** caminho no bucket comprovantes (033) */
  comprovante?: string | null;
  /** conferido na fatura (035) */
  conferido?: boolean;
  /** Pix/débito pago com um cofrinho: o banco mantém a retirada (044) */
  cofrinho_id?: string | null;
  criado_em?: string;
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
  /** conta entra nas contas do mês anterior ao vencimento; entrada do mês cai no mês seguinte (salário pago no 5º dia útil) */
  paga_mes_anterior: boolean;
  /** entrada: `dia` é o N-ésimo dia útil (migration 038) */
  dia_util?: boolean;
  /** paga com benefício: desconta do saldo dele e não entra nas saídas */
  beneficio_id: string | null;
  /** recorrência anterior encerrada pelo reajuste */
  reajuste_de?: string | null;
  /** chave Pix ou linha digitável para pagar (043) */
  pagamento?: string | null;
}

export interface Pagamento {
  id: string;
  /** parcela: parcela de parcelamento fora do cartão, ref_id = gasto (036) */
  tipo: 'recorrencia' | 'fatura' | 'parcela';
  ref_id: string;
  mes: string;
  valor: number;
  /** null: valor do mês informado (conta variável), ainda não pago */
  pago_em: string | null;
  /** fatura paga em parte: o que passa para a fatura seguinte (migration 032) */
  resto?: number;
}

/** Saldo real informado de uma conta bancária (migration 032) */
export interface ContaBancaria {
  id: string;
  nome: string;
  saldo: number;
  atualizado_em: string;
  cor: string;
  ativo: boolean;
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
  /** retirada criada pelo gasto (044) */
  gasto_id?: string | null;
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
  de: string | null;
  para: string | null;
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

/** Item da aba Contas: conta fixa, fatura de cartão ou parcela no boleto/débito no mês */
export interface ContaMes {
  tipo: 'recorrencia' | 'fatura' | 'parcela';
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
  /** fatura: o que ficou da fatura anterior paga em parte */
  anterior?: number;
}

export interface Mensagem {
  id: string;
  user_id: string | null;
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

/** Texto contido na descrição → categoria; `descricao` renomeia na importação (035) */
export interface Regra {
  id: string;
  termo: string;
  descricao: string | null;
  categoria_id: string | null;
}

/** Modo viagem (035): com `ativa`, gastos novos ganham o marcador `tag` */
export interface Viagem {
  id: string;
  nome: string;
  tag: string;
  inicio: string;
  fim: string | null;
  orcamento: number | null;
  moeda: string | null;
  cotacao: number | null;
  iof: number;
  ativa: boolean;
}

/** Lista de desejos (035); prioridade 1 alta, 2 média, 3 baixa */
export interface Desejo {
  id: string;
  descricao: string;
  valor: number;
  prioridade: 1 | 2 | 3;
  link: string | null;
  cofrinho_id: string | null;
  comprado_em: string | null;
}

/** Foto mensal do patrimônio (035) */
export interface FotoPatrimonio {
  id: string;
  mes: string;
  bancos: number;
  cofrinhos: number;
  receber: number;
  dividas: number;
  parcelas: number;
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
  contas_bancarias: ContaBancaria;
  regras: Regra;
  viagens: Viagem;
  desejos: Desejo;
  patrimonio: FotoPatrimonio;
}

export type Tabela = keyof Tabelas;

/** Sem id insere, com id atualiza só os campos informados */
export type Dados<T extends Tabela> = Partial<Omit<Tabelas[T], 'id'>> & { id?: string };

/** Painel admin: só contagens e datas, nunca descrição ou valor. SerieDia evita conflito com Serie de shared/graficos */
export interface SerieDia { dia: string; n: number }
export interface AdminUsuario { id: string; email: string; nome: string | null; criado_em: string; ultimo_uso: string | null; versao: string | null; aparelho: string | null;
  carteira: string | null; membros: number; papel: 'dono' | 'membro' | null; lancamentos: number; ultimo_lancamento: string | null; push: boolean; status: 'ativo' | 'suspenso' | 'parado' }
export interface AdminMetricas { usuarios: number; carteiras: number; casais: number; novos: number; dau: number; wau: number; mau: number; parados: number; erros_24h: number;
  push_aparelhos: number; telemetria_desde: string | null; ativos_dia: SerieDia[]; lancamentos_dia: SerieDia[]; cadastros_semana: SerieDia[];
  retencao: { coorte: string; usuarios: number; m1: number | null; m2: number | null; m3: number | null }[]; uso_funcoes: { chave: string; carteiras: number }[]; versoes: { versao: string; n: number }[] }
export interface AdminErros { por_dia: SerieDia[]; frequentes: { mensagem: string; n: number; ultima: string; versoes: string[]; rotas: string[] }[] }
export interface FuncaoStatus { chave: string; ativa: boolean; mensagem: string | null; desde: string | null }
export interface ComunicadoTag { id: string; nome: string; cor: string; arquivada: boolean }
export interface Comunicado { id: string; titulo: string; texto: string; tag_id: string | null; inicio: string; fim: string; link: string | null; push: boolean;
  destaque: boolean; publicado: boolean; push_enviado_em: string | null; criado_em: string; lidos?: number; total_usuarios?: number }
export interface AdminLog { id: number; admin_id: string | null; acao: string; alvo: string | null; detalhe: unknown; criado_em: string }
