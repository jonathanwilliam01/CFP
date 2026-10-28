import { addMeses, diaNoMes, fimMes, inicioMes, mesFatura, mesesEntre } from './datas';
import { pct, soma } from './formato';
import {
  Beneficio, Cartao, Categoria, ContaMes, Gasto, Orcamento, Pagamento, Recorrencia, UsoBeneficio,
} from './models';

export const ativaNoMes = (r: { ativo: boolean; inicio: string; fim: string | null }, mes: string) =>
  r.ativo && inicioMes(r.inicio) <= mes && (!r.fim || inicioMes(r.fim) >= mes);

export const noMes = (data: string, mes: string) => data >= mes && data <= fimMes(mes);

/** Contas fixas no cartão: uma cobrança por fatura; inicio/fim são meses de fatura */
export function fixasNaFatura(mes: string, cartao: Cartao, recorrencias: Recorrencia[]) {
  return recorrencias
    .filter((r) => r.tipo === 'conta' && r.cartao_id === cartao.id && ativaNoMes(r, mes))
    .map((r) => ({ id: `${r.id}-${mes}`, descricao: r.descricao, valor: r.valor, data: diaNoMes(mes, cartao.vencimento_dia), fixa: true }));
}

/** Mês da fatura que entra nas contas do mês */
export const faturaDoMes = (mes: string, c: Cartao) => (c.paga_mes_anterior ? addMeses(mes, 1) : mes);

export function contasDoMes(
  mes: string,
  recorrencias: Recorrencia[],
  cartoes: Cartao[],
  gastos: Gasto[],
  pagamentos: Pagamento[],
  categorias: Map<string, Categoria>,
): ContaMes[] {
  const pago = (tipo: string, id: string, m = mes) =>
    pagamentos.find((p) => p.tipo === tipo && p.ref_id === id && p.mes === m) ?? null;

  // paga com o salário do mês anterior: no mês entra a conta que vence no mês seguinte
  const mesConta = (r: Recorrencia) => (r.paga_mes_anterior ? addMeses(mes, 1) : mes);
  const fixas: ContaMes[] = recorrencias
    .filter((r) => r.tipo === 'conta' && !cartoes.some((c) => c.id === r.cartao_id) && ativaNoMes(r, mesConta(r)))
    .map((r) => {
      const m = mesConta(r);
      const c = r.categoria_id ? categorias.get(r.categoria_id) : undefined;
      const p = pago('recorrencia', r.id, m);
      return {
        tipo: 'recorrencia',
        ref_id: r.id,
        descricao: r.descricao,
        icone: c?.icone ?? 'receipt_long',
        cor: c?.cor ?? '#64748b',
        vencimento: diaNoMes(m, r.dia),
        mes: m,
        valor: p?.valor ?? r.valor,
        pago: p,
        media: r.variavel && !p,
        beneficio_id: r.beneficio_id,
      };
    });

  const faturas: ContaMes[] = cartoes
    .map((c) => {
      const fm = faturaDoMes(mes, c);
      const total =
        soma(gastos.filter((g) => g.cartao_id === c.id && g.fatura_mes === fm), (g) => g.valor) +
        soma(fixasNaFatura(fm, c, recorrencias), (f) => f.valor);
      const p = pago('fatura', c.id, fm);
      return {
        tipo: 'fatura' as const,
        ref_id: c.id,
        descricao: `Fatura ${c.nome}`,
        icone: 'credit_card',
        cor: c.cor,
        vencimento: diaNoMes(fm, c.vencimento_dia),
        mes: fm,
        valor: p?.valor ?? total,
        pago: p,
      };
    })
    .filter((f) => f.valor > 0);

  return [...fixas, ...faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export interface Recebimento {
  dia: number;
  nome: string;
  recebe: number;
  contas: ContaMes[];
  total: number;
  aPagar: number;
  sobra: number;
}

/**
 * Contas por dia de recebimento das entradas fixas (ex.: vale dia 20 e salário dia 7).
 * Cada conta fica com o último recebimento até o dia do vencimento; antes do primeiro, com o último do mês.
 * Contas pagas com benefício ficam de fora. Menos de dois dias de recebimento: lista vazia.
 */
export function porRecebimento(mes: string, contas: ContaMes[], recorrencias: Recorrencia[], pagamentos: Pagamento[]): Recebimento[] {
  const dias = new Map<number, Recorrencia[]>();
  for (const r of recorrencias.filter((r) => r.tipo === 'entrada' && ativaNoMes(r, mes)))
    dias.set(r.dia, [...(dias.get(r.dia) ?? []), r]);
  if (dias.size < 2) return [];
  const grupos = [...dias.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dia, es]) => ({
      dia,
      nome: es.map((e) => e.descricao).join(' + '),
      recebe: soma(es, (e) => pagamentos.find((p) => p.ref_id === e.id && p.mes === mes)?.valor ?? e.valor),
      contas: [] as ContaMes[],
    }));
  for (const c of contas) {
    if (c.beneficio_id) continue;
    const dia = +c.vencimento.slice(8);
    let g = grupos[grupos.length - 1];
    for (const x of grupos) if (x.dia <= dia) g = x;
    g.contas.push(c);
  }
  return grupos.map((g) => {
    const total = soma(g.contas, (c) => c.valor);
    return { ...g, total, aPagar: soma(g.contas.filter((c) => !c.pago), (c) => c.valor), sobra: g.recebe - total };
  });
}

export interface ResumoMes {
  entradas: number;
  entradasFixas: number;
  entradasAvulsas: number;
  saidas: number;
  avista: number;
  faturas: number;
  contasFixas: number;
  beneficios: number;
  consumo: number;
  saldo: number;
  pago: number;
  aPagar: number;
}

export function resumoMes(
  mes: string,
  gastos: Gasto[],
  entradasAvulsas: number,
  recorrencias: Recorrencia[],
  contas: ContaMes[],
  pagamentos: Pagamento[],
): ResumoMes {
  const doMes = gastos.filter((g) => noMes(g.data, mes));
  // contas pagas com benefício contam como benefício, fora das saídas
  const contasBenef = contas.filter((c) => c.beneficio_id);
  contas = contas.filter((c) => !c.beneficio_id);
  const avista = soma(doMes.filter((g) => g.forma === 'debito'), (g) => g.valor);
  const beneficios = soma(doMes.filter((g) => g.forma === 'beneficio'), (g) => g.valor) + soma(contasBenef, (c) => c.valor);
  const faturas = soma(contas.filter((c) => c.tipo === 'fatura'), (c) => c.valor);
  const contasFixas = soma(contas.filter((c) => c.tipo === 'recorrencia'), (c) => c.valor);
  const entradasFixas = soma(
    recorrencias.filter((r) => r.tipo === 'entrada' && ativaNoMes(r, mes)),
    (r) => pagamentos.find((p) => p.ref_id === r.id && p.mes === mes)?.valor ?? r.valor,
  );
  const entradas = entradasFixas + entradasAvulsas;
  const saidas = avista + faturas + contasFixas;
  const pago = soma(contas.filter((c) => c.pago), (c) => c.valor);
  return {
    entradas,
    entradasFixas,
    entradasAvulsas,
    saidas,
    avista,
    faturas,
    contasFixas,
    beneficios,
    consumo: soma(doMes, (g) => g.valor),
    saldo: entradas - saidas,
    pago,
    aPagar: contasFixas + faturas - pago,
  };
}

export interface FatiaCategoria {
  id: string | null;
  nome: string;
  icone: string;
  cor: string;
  total: number;
  pct: number;
  qtd: number;
}

export function porCategoria(gastos: { categoria_id: string | null; valor: number }[], categorias: Map<string, Categoria>): FatiaCategoria[] {
  const m = new Map<string | null, { total: number; qtd: number }>();
  for (const g of gastos) {
    const k = g.categoria_id && categorias.has(g.categoria_id) ? g.categoria_id : null;
    const a = m.get(k) ?? { total: 0, qtd: 0 };
    a.total += g.valor;
    a.qtd++;
    m.set(k, a);
  }
  const total = soma([...m.values()], (a) => a.total);
  return [...m.entries()]
    .map(([id, a]) => {
      const c = id ? categorias.get(id) : undefined;
      return {
        id,
        nome: c?.nome ?? 'Sem categoria',
        icone: c?.icone ?? 'help',
        cor: c?.cor ?? '#94a3b8',
        total: a.total,
        qtd: a.qtd,
        pct: pct(a.total, total),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface CobrancaBeneficio {
  beneficio_id: string;
  ref_id: string;
  mes: string;
  valor: number;
}

/** Uma cobrança por mês de vencimento de cada conta fixa paga com benefício, até o mês */
export function cobrancasBeneficio(recorrencias: Recorrencia[], valores: { ref_id: string; mes: string; valor: number }[], ate: string) {
  const l: CobrancaBeneficio[] = [];
  for (const r of recorrencias) {
    if (r.tipo !== 'conta' || !r.beneficio_id) continue;
    for (let m = inicioMes(r.inicio); m <= ate; m = addMeses(m, 1))
      if (ativaNoMes(r, m))
        l.push({ beneficio_id: r.beneficio_id, ref_id: r.id, mes: m, valor: valores.find((v) => v.ref_id === r.id && v.mes === m)?.valor ?? r.valor });
  }
  return l;
}

export function saldoBeneficio(b: Beneficio, uso: UsoBeneficio[], mes: string, cobrancas: CobrancaBeneficio[] = []) {
  const usos = uso.filter((u) => u.beneficio_id === b.id);
  const contas = cobrancas.filter((c) => c.beneficio_id === b.id && c.mes >= inicioMes(b.inicio));
  const usadoMes = soma(usos.filter((u) => u.mes === mes), (u) => u.total) + soma(contas.filter((c) => c.mes === mes), (c) => c.valor);
  if (!b.acumula) return { saldo: b.valor_mensal - usadoMes, usadoMes };
  const meses = Math.max(0, mesesEntre(inicioMes(b.inicio), mes) + 1);
  const usado = soma(usos.filter((u) => u.mes <= mes), (u) => u.total) + soma(contas.filter((c) => c.mes <= mes), (c) => c.valor);
  return { saldo: meses * b.valor_mensal - usado, usadoMes };
}

/** Crédito dos benefícios ativos no mês (a partir do início de cada um) */
export const creditoBeneficios = (beneficios: Beneficio[], mes: string) =>
  soma(beneficios.filter((b) => b.ativo && inicioMes(b.inicio) <= mes), (b) => b.valor_mensal);

export type Nivel = 'ok' | 'alerta' | 'estourado';

export interface StatusOrcamento {
  orcamento: Orcamento;
  nome: string;
  icone: string;
  cor: string;
  gasto: number;
  pct: number;
  nivel: Nivel;
}

export function statusOrcamentos(orcamentos: Orcamento[], gastosMes: Gasto[], categorias: Map<string, Categoria>): StatusOrcamento[] {
  return orcamentos
    .map((o) => {
      const c = o.categoria_id ? categorias.get(o.categoria_id) : undefined;
      const gasto = soma(o.categoria_id ? gastosMes.filter((g) => g.categoria_id === o.categoria_id) : gastosMes, (g) => g.valor);
      const p = o.valor > 0 ? Math.round((gasto / o.valor) * 100) : 0;
      return {
        orcamento: o,
        nome: c?.nome ?? 'Geral (todos os gastos)',
        icone: c?.icone ?? 'bar_chart',
        cor: c?.cor ?? '#0f766e',
        gasto,
        pct: p,
        nivel: (p >= 100 ? 'estourado' : p >= o.alerta_pct ? 'alerta' : 'ok') as Nivel,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

/** Valor mensal necessário para bater a meta até o prazo */
export function aporteMensal(meta: number, guardado: number, prazo: string | null, mes: string) {
  if (!prazo || guardado >= meta) return null;
  const meses = Math.max(1, mesesEntre(mes, inicioMes(prazo)) + 1);
  return (meta - guardado) / meses;
}

export const MIN_MEDIA = 3;
export const MAX_MEDIA = 12;

/** Média das últimas 12 contas; null com menos de 3 */
export function mediaContas(valores: { mes: string; valor: number }[]) {
  const ult = [...valores].sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, MAX_MEDIA);
  return ult.length >= MIN_MEDIA ? Math.round((soma(ult, (v) => v.valor) / ult.length) * 100) / 100 : null;
}

/** Média de cada conta variável que já tem contas suficientes */
export function mediasVariaveis(recorrencias: Recorrencia[], valores: { ref_id: string; mes: string; valor: number }[]) {
  const m = new Map<string, number>();
  for (const r of recorrencias.filter((x) => x.variavel)) {
    const media = mediaContas(valores.filter((v) => v.ref_id === r.id));
    if (media != null) m.set(r.id, media);
  }
  return m;
}

export const proximosMeses = (mes: string, n: number) => Array.from({ length: n }, (_, i) => addMeses(mes, i));

/** Primeiro mês e dia de uma fixa criada pelo lançamento: no cartão, a fatura da data e o vencimento do cartão */
export function inicioFixa(data: string, cartao?: Cartao) {
  return cartao
    ? { inicio: mesFatura(data, cartao.fechamento_dia, cartao.vencimento_dia), dia: cartao.vencimento_dia }
    : { inicio: inicioMes(data), dia: Number(data.slice(8, 10)) };
}

/** Cadeia de reajustes de uma recorrência, da mais antiga à mais nova */
export function historicoReajustes(recorrencias: Recorrencia[], id: string) {
  const porId = new Map(recorrencias.map((r) => [r.id, r]));
  let r = porId.get(id);
  if (!r) return [];
  const vistos = new Set<string>();
  while (r.reajuste_de && porId.has(r.reajuste_de) && !vistos.has(r.id)) {
    vistos.add(r.id);
    r = porId.get(r.reajuste_de)!;
  }
  const l: Recorrencia[] = [];
  for (let x: Recorrencia | undefined = r; x && !l.includes(x); x = recorrencias.find((y) => y.reajuste_de === x!.id)) l.push(x);
  return l;
}

export const ACIMA_MEDIA = 1.3;

/** Contas variáveis cuja última conta (até o mês seguinte) veio 30% ou mais acima da média das anteriores */
export function variaveisAcima(recorrencias: Recorrencia[], valores: { ref_id: string; mes: string; valor: number }[], mes: string) {
  const l: { r: Recorrencia; mes: string; valor: number; media: number; pct: number }[] = [];
  for (const r of recorrencias.filter((x) => x.variavel)) {
    const vs = valores.filter((v) => v.ref_id === r.id && v.mes <= addMeses(mes, 1)).sort((a, b) => b.mes.localeCompare(a.mes));
    const [ult, ...ant] = vs;
    if (!ult || ult.mes < mes) continue;
    const media = mediaContas(ant);
    if (media && ult.valor >= media * ACIMA_MEDIA) l.push({ r, mes: ult.mes, valor: ult.valor, media, pct: Math.round((ult.valor / media - 1) * 100) });
  }
  return l;
}

/** Variação % dos gastos lançados contra o mês anterior; no mês corrente compara até o mesmo dia */
export function variacaoGastos(gastos: { data: string; valor: number }[], mes: string, hoje: string) {
  const corte = inicioMes(hoje) === mes ? Number(hoje.slice(8, 10)) : 31;
  const ate = (m: string) => soma(gastos.filter((g) => noMes(g.data, m) && Number(g.data.slice(8, 10)) <= corte), (g) => g.valor);
  const ant = ate(addMeses(mes, -1));
  return ant > 0 ? Math.round((ate(mes) / ant - 1) * 100) : null;
}
