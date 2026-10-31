import { addDias, addMeses, diaNoMes, diasNoMes, diffDias, fechamentoFatura, fimMes, inicioFatura, inicioMes, mesFatura, mesesEntre } from './datas';
import { pct, soma } from './formato';
import { normalizar } from './texto';
import {
  Beneficio, Cartao, Categoria, ContaMes, Frequencia, Gasto, Orcamento, OrcamentoFechado, OrcamentoValor, Pagamento, Recorrencia, UsoBeneficio,
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
      const reg = pago('recorrencia', r.id, m);
      const p = reg?.pago_em ? reg : null;
      return {
        tipo: 'recorrencia',
        ref_id: r.id,
        descricao: r.descricao,
        icone: c?.icone ?? 'receipt_long',
        cor: c?.cor ?? '#64748b',
        vencimento: diaNoMes(m, r.dia),
        mes: m,
        valor: reg?.valor ?? r.valor,
        pago: p,
        media: r.variavel && !reg,
        informado: p ? null : reg,
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
  /** orçamentos com reserva que caem neste recebimento */
  reservas: { orcamento_id: string; nome: string; valor: number }[];
  reservado: number;
  sobra: number;
}

/** Reserva de orçamento distribuída no mês (ver reservasPorDia) */
export interface ReservaDia {
  dia: number;
  valor: number;
  orcamento_id: string;
  nome: string;
  /** dia do vencimento da fatura, mesmo quando vence no mês seguinte */
  vence?: number;
}

/**
 * Contas por dia de recebimento das entradas fixas (ex.: vale dia 20 e salário dia 7).
 * Cada conta fica com o último recebimento até o dia do vencimento; antes do primeiro, com o último do mês.
 * Contas pagas com benefício ficam de fora. Menos de dois dias de recebimento: lista vazia.
 */
export function porRecebimento(
  mes: string,
  contas: ContaMes[],
  recorrencias: Recorrencia[],
  pagamentos: Pagamento[],
  reservas: ReservaDia[] = [],
): Recebimento[] {
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
      res: new Map<string, { nome: string; valor: number }>(),
    }));
  const grupo = (dia: number) => {
    let g = grupos[grupos.length - 1];
    for (const x of grupos) if (x.dia <= dia) g = x;
    return g;
  };
  for (const c of contas) if (!c.beneficio_id) grupo(+c.vencimento.slice(8)).contas.push(c);
  for (const r of reservas) {
    const g = grupo(r.vence ?? r.dia);
    const a = g.res.get(r.orcamento_id) ?? { nome: r.nome, valor: 0 };
    a.valor += r.valor;
    g.res.set(r.orcamento_id, a);
  }
  return grupos.map(({ res, ...g }) => {
    const total = soma(g.contas, (c) => c.valor);
    const lista = [...res.entries()].map(([orcamento_id, a]) => ({ orcamento_id, nome: a.nome, valor: Math.round(a.valor * 100) / 100 }));
    const reservado = soma(lista, (r) => r.valor);
    return { ...g, total, aPagar: soma(g.contas.filter((c) => !c.pago), (c) => c.valor), reservas: lista, reservado, sobra: g.recebe - total - reservado };
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
  /** limite ainda não gasto dos orçamentos com reserva */
  reservado: number;
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
  reservado = 0,
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
  const saidas = avista + faturas + contasFixas + reservado;
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
    reservado,
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
  /** forma de pagamento do orçamento ('' = qualquer) */
  pagamento: string;
  icone: string;
  cor: string;
  gasto: number;
  pct: number;
  nivel: Nivel;
  /** parte do limite ainda não gasta que entra nas saídas previstas (reserva, mês atual em diante) */
  reservado: number;
}

/** Gastos que contam no orçamento: categoria e forma; no cartão, os da fatura que entra nas contas do mês */
export function gastosDoOrcamento(o: Orcamento, gastos: Gasto[], mes: string, cartoes: Cartao[]) {
  const daCat = o.categoria_id ? gastos.filter((g) => g.categoria_id === o.categoria_id) : gastos;
  if (o.forma === 'cartao') {
    const c = cartoes.find((x) => x.id === o.cartao_id);
    return c ? daCat.filter((g) => g.cartao_id === c.id && g.fatura_mes === faturaDoMes(mes, c)) : [];
  }
  return daCat.filter((g) => noMes(g.data, mes) && (!o.forma || g.forma === o.forma));
}

export function statusOrcamentos(
  orcamentos: Orcamento[],
  gastos: Gasto[],
  mes: string,
  categorias: Map<string, Categoria>,
  cartoes: Cartao[] = [],
  atual = mes,
): StatusOrcamento[] {
  return orcamentos
    .map((o) => {
      const c = o.categoria_id ? categorias.get(o.categoria_id) : undefined;
      const gasto = soma(gastosDoOrcamento(o, gastos, mes, cartoes), (g) => g.valor);
      const p = o.valor > 0 ? Math.round((gasto / o.valor) * 100) : 0;
      const pagamento = o.forma === 'cartao' ? cartoes.find((x) => x.id === o.cartao_id)?.nome ?? 'Cartão' : o.forma === 'debito' ? 'Pix/Débito' : '';
      return {
        orcamento: o,
        nome: c?.nome ?? 'Geral (todos os gastos)',
        pagamento,
        icone: c?.icone ?? 'bar_chart',
        cor: c?.cor ?? '#0f766e',
        gasto,
        pct: p,
        nivel: (p >= 100 ? 'estourado' : p >= o.alerta_pct ? 'alerta' : 'ok') as Nivel,
        reservado: o.reserva && o.forma && mes >= atual ? Math.max(0, Math.round((o.valor - gasto) * 100) / 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

/**
 * Reservas no saldo dia a dia: no cartão, no vencimento da fatura (vence no mês seguinte: último dia);
 * no débito, dividida pelos dias que restam do mês.
 */
export function reservasPorDia(mes: string, status: StatusOrcamento[], cartoes: Cartao[], hoje: string) {
  const n = diasNoMes(mes);
  const l: ReservaDia[] = [];
  for (const s of status.filter((x) => x.reservado > 0)) {
    const o = s.orcamento;
    const nome = s.pagamento ? `${s.nome} · ${s.pagamento}` : s.nome;
    const c = o.forma === 'cartao' ? cartoes.find((x) => x.id === o.cartao_id) : undefined;
    if (c) {
      const venc = diaNoMes(faturaDoMes(mes, c), c.vencimento_dia);
      l.push({ dia: noMes(venc, mes) ? Number(venc.slice(8, 10)) : n, valor: s.reservado, orcamento_id: o.id, nome, vence: Number(venc.slice(8, 10)) });
      continue;
    }
    const ini = noMes(hoje, mes) ? Number(hoje.slice(8, 10)) : 1;
    for (let d = ini; d <= n; d++) l.push({ dia: d, valor: s.reservado / (n - ini + 1), orcamento_id: o.id, nome });
  }
  return l;
}

/** Ajuste do orçamento que vale no mês: entre os que cobrem o mês, o que começou por último */
export function ajusteOrcamento(o: Orcamento, valores: OrcamentoValor[], mes: string) {
  let v: OrcamentoValor | undefined;
  for (const x of valores)
    if (x.orcamento_id === o.id && x.mes <= mes && (!x.ate || x.ate >= mes) && (!v || x.mes > v.mes || (x.mes === v.mes && x.criado_em > v.criado_em)))
      v = x;
  return v;
}

/** Orçamentos com o limite do mês; sobra desconsiderada no mês tira a reserva */
export const orcamentosNoMes = (orcamentos: Orcamento[], valores: OrcamentoValor[], mes: string, fechados: OrcamentoFechado[] = []) =>
  orcamentos.map((o) => {
    const f = fechados.find((x) => x.orcamento_id === o.id && x.mes === mes);
    return { ...o, valor: ajusteOrcamento(o, valores, mes)?.valor ?? o.valor, ...(f ? { reserva: false, fechado_id: f.id } : {}) };
  });

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
    ? { inicio: mesFatura(data, cartao), dia: cartao.vencimento_dia }
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

export interface DiaSaldo {
  dia: number;
  data: string;
  entra: number;
  sai: number;
  saldo: number;
}

/**
 * Saldo acumulado dia a dia no mês; o último dia bate com o saldo do resumo.
 * Entradas fixas no dia previsto (ou no recebimento), avulsas e à vista na data, contas no vencimento (paga: no pagamento).
 * Conta que vence no mês seguinte (salário do mês anterior) cai no último dia.
 */
export function saldoDiario(
  mes: string,
  gastos: Gasto[],
  entradas: { data: string; valor: number }[],
  recorrencias: Recorrencia[],
  contas: ContaMes[],
  pagamentos: Pagamento[],
  reservas: { dia: number; valor: number }[] = [],
): DiaSaldo[] {
  const n = diasNoMes(mes);
  const entra = new Array<number>(n + 1).fill(0);
  const sai = new Array<number>(n + 1).fill(0);
  const dia = (d: string) => Number(d.slice(8, 10));
  for (const r of recorrencias.filter((x) => x.tipo === 'entrada' && ativaNoMes(x, mes))) {
    const p = pagamentos.find((x) => x.ref_id === r.id && x.mes === mes);
    entra[p?.pago_em && noMes(p.pago_em, mes) ? dia(p.pago_em) : Math.min(r.dia, n)] += p?.valor ?? r.valor;
  }
  for (const e of entradas) if (noMes(e.data, mes)) entra[dia(e.data)] += e.valor;
  for (const g of gastos) if (g.forma === 'debito' && noMes(g.data, mes)) sai[dia(g.data)] += g.valor;
  for (const r of reservas) sai[r.dia] += r.valor;
  for (const c of contas) {
    if (c.beneficio_id) continue;
    const pg = c.pago?.pago_em;
    sai[pg && noMes(pg, mes) ? dia(pg) : noMes(c.vencimento, mes) ? dia(c.vencimento) : n] += c.valor;
  }
  let saldo = 0;
  return Array.from({ length: n }, (_, i) => {
    const d = i + 1;
    saldo += entra[d] - sai[d];
    return { dia: d, data: diaNoMes(mes, d), entra: entra[d], sai: sai[d], saldo: Math.round(saldo * 100) / 100 };
  });
}

/** Parcelas que pesam no mês: no cartão pela fatura das contas do mês, no débito pela data */
export function parcelasDoMes(mes: string, gastos: Gasto[], cartoes: Cartao[]) {
  const porId = new Map(cartoes.map((c) => [c.id, c]));
  const p = gastos.filter((g) => g.parcelamento_id);
  return {
    cartao: soma(p.filter((g) => {
      const c = g.forma === 'cartao' && g.cartao_id ? porId.get(g.cartao_id) : undefined;
      return !!c && g.fatura_mes === faturaDoMes(mes, c);
    }), (g) => g.valor),
    debito: soma(p.filter((g) => g.forma === 'debito' && noMes(g.data, mes)), (g) => g.valor),
  };
}

/** % do mês já passado (só no mês corrente) */
export const ritmoMes = (mes: string, hoje: string) =>
  inicioMes(hoje) === mes ? Math.round((Number(hoje.slice(8, 10)) / diasNoMes(mes)) * 100) : null;

export const ACIMA_CATEGORIA = 1.5;

/**
 * Categorias com gasto no mês 50% ou mais acima da média mensal dos meses anteriores (até 3, mínimo 2 com gasto).
 * Média abaixo de `minimo` fica de fora para não avisar por pouco.
 */
export function categoriasAcima(
  doMes: { categoria_id: string | null; valor: number }[],
  anteriores: { categoria_id: string | null; valor: number; data: string }[],
  categorias: Map<string, Categoria>,
  minimo = 50,
) {
  const meses = new Set(anteriores.map((g) => inicioMes(g.data))).size;
  if (meses < 2) return [];
  const media = new Map(porCategoria(anteriores, categorias).map((c) => [c.id, c.total / meses]));
  return porCategoria(doMes, categorias)
    .map((c) => ({ ...c, media: media.get(c.id) ?? 0 }))
    .filter((c) => c.id && c.media >= minimo && c.total >= c.media * ACIMA_CATEGORIA)
    .map((c) => ({ ...c, acima: Math.round((c.total / c.media - 1) * 100) }));
}

/**
 * Fatura aberta na data: total atual e projeção até o fechamento.
 * Compras avulsas do ciclo seguem o ritmo diário; parcelas e contas fixas entram como estão. Menos de 3 dias de ciclo: sem projeção.
 */
export function faturaProjetada(
  c: Cartao,
  gastos: Pick<Gasto, 'cartao_id' | 'valor' | 'data' | 'fatura_mes' | 'parcelamento_id'>[],
  recorrencias: Recorrencia[],
  hoje: string,
) {
  const mes = mesFatura(hoje, c);
  const fecha = fechamentoFatura(mes, c);
  const abriu = inicioFatura(mes, c);
  const dela = gastos.filter((g) => g.cartao_id === c.id && g.fatura_mes === mes);
  const atual = soma(dela, (g) => g.valor) + soma(fixasNaFatura(mes, c, recorrencias), (f) => f.valor);
  const avulsas = soma(dela.filter((g) => !g.parcelamento_id && g.data >= abriu && g.data <= hoje), (g) => g.valor);
  const passados = diffDias(abriu, hoje) + 1;
  const resto = diffDias(abriu, fecha) - passados;
  const projetada = passados >= 3 ? atual + (avulsas / passados) * Math.max(resto, 0) : atual;
  return { mes, fecha, atual, projetada: Math.round(projetada * 100) / 100 };
}

const PASSO: Record<Frequencia, (d: string, i: number) => string> = {
  semana: (d, i) => addDias(d, 7 * i),
  quinzena: (d, i) => addDias(d, 15 * i),
  mes: (d, i) => addMeses(d, i),
};

/**
 * Depósitos de `valor` a cada período, o primeiro em `de`: quantos e em que data cobrem o que falta;
 * com prazo, quanto junta até ele e quantos dias antes (negativo: depois) a meta chega.
 */
export function simularDepositos(falta: number, valor: number, freq: Frequencia, de: string, prazo: string | null) {
  if (valor <= 0 || falta <= 0) return null;
  const depositos = Math.ceil(falta / valor - 1e-9);
  const data = PASSO[freq](de, depositos - 1);
  let noPrazo = 0;
  if (prazo) while (noPrazo < depositos && PASSO[freq](de, noPrazo) <= prazo) noPrazo++;
  return {
    depositos,
    data,
    total: depositos * valor,
    ...(prazo ? { ateOPrazo: Math.min(noPrazo * valor, falta), folga: diffDias(data, prazo) } : {}),
  };
}

/** Quanto depositar por período para cobrir o que falta até o prazo (primeiro depósito em `de`) */
export function depositoNecessario(falta: number, freq: Frequencia, de: string, prazo: string) {
  if (falta <= 0 || prazo < de) return null;
  let n = 0;
  while (PASSO[freq](de, n) <= prazo) n++;
  return Math.ceil((falta / n) * 100) / 100;
}

export type GastoHist = Pick<Gasto, 'descricao' | 'valor' | 'data' | 'categoria_id' | 'forma' | 'cartao_id' | 'fatura_mes' | 'parcelamento_id'>;

export interface CompraRecorrente {
  chave: string;
  descricao: string;
  valor: number;
  dia: number;
  categoria_id: string | null;
  cartao_id: string | null;
  /** primeiro mês da conta fixa: o seguinte ao último lançamento (fatura, no cartão) */
  inicio: string;
}

/**
 * Gasto avulso lançado uma vez por mês nos 3 meses antes de `mes`, com valor parecido (até 25% de diferença)
 * e sem conta fixa de mesmo nome: candidato a virar conta fixa.
 */
export function comprasRecorrentes(gastos: GastoHist[], recorrencias: Recorrencia[], mes: string): CompraRecorrente[] {
  const fixas = new Set(recorrencias.filter((r) => r.tipo === 'conta').map((r) => normalizar(r.descricao)));
  const meses = [-3, -2, -1].map((n) => addMeses(mes, n));
  const grupos = new Map<string, GastoHist[]>();
  for (const g of gastos) {
    if (g.parcelamento_id || g.forma === 'beneficio') continue;
    const k = normalizar(g.descricao);
    if (k && !fixas.has(k)) grupos.set(k, [...(grupos.get(k) ?? []), g]);
  }
  const l: CompraRecorrente[] = [];
  for (const [chave, gs] of grupos) {
    if (!meses.every((m) => gs.filter((g) => noMes(g.data, m)).length === 1)) continue;
    const valores = gs.map((g) => g.valor);
    if (Math.max(...valores) > Math.min(...valores) * 1.25) continue;
    const ult = gs.reduce((a, b) => (b.data > a.data ? b : a));
    const base = ult.forma === 'cartao' && ult.fatura_mes ? ult.fatura_mes : inicioMes(ult.data);
    l.push({
      chave, descricao: ult.descricao, valor: ult.valor, dia: Number(ult.data.slice(8, 10)), categoria_id: ult.categoria_id,
      cartao_id: ult.forma === 'cartao' ? ult.cartao_id : null, inicio: addMeses(base, 1),
    });
  }
  return l.sort((a, b) => b.valor - a.valor);
}

export interface Transferencia {
  de: string;
  para: string;
  valor: number;
}

/**
 * Acerto do mês entre os membros: gastos divididos com data no mês (sem benefício) rateados por igual.
 * Saldo positivo = tem a receber. Acertos já feitos no mês entram no saldo; transferências quitam do maior devedor ao maior credor.
 */
export function acertoMes(
  gastos: Pick<Gasto, 'valor' | 'data' | 'forma' | 'criado_por' | 'pago_por' | 'dividido'>[],
  membros: string[],
  acertos: { mes: string; de: string; para: string; valor: number }[],
  mes: string,
) {
  const div = gastos.filter((g) => g.dividido !== false && g.forma !== 'beneficio' && noMes(g.data, mes));
  const total = soma(div, (g) => g.valor);
  const parte = membros.length ? total / membros.length : 0;
  const saldo = new Map(membros.map((m) => [m, -parte]));
  const somar = (id: string, v: number) => saldo.has(id) && saldo.set(id, saldo.get(id)! + v);
  for (const g of div) somar(g.pago_por ?? g.criado_por ?? '', g.valor);
  for (const a of acertos.filter((a) => a.mes === mes)) {
    somar(a.de, a.valor);
    somar(a.para, -a.valor);
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const deve = [...saldo].filter(([, v]) => v < -0.004).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const recebe = [...saldo].filter(([, v]) => v > 0.004).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const transferencias: Transferencia[] = [];
  for (const d of deve)
    for (const c of recebe) {
      const v = Math.min(d.v, c.v);
      if (v < 0.005) continue;
      transferencias.push({ de: d.id, para: c.id, valor: r2(v) });
      d.v -= v;
      c.v -= v;
    }
  return { total: r2(total), parte: r2(parte), saldos: new Map([...saldo].map(([k, v]) => [k, r2(v)])), transferencias };
}

/** Alíquota do IR na renda fixa pelo prazo em meses (tabela regressiva) */
export const aliquotaIR = (meses: number) => (meses <= 6 ? 0.225 : meses <= 12 ? 0.2 : meses <= 24 ? 0.175 : 0.15);

/** Taxa mensal líquida de IR de uma aplicação a `pctCdi`% de um CDI anual (em %), pelo prazo em meses */
export function taxaMensal(cdiAno: number, pctCdi: number, meses: number, comIR = true) {
  const bruta = Math.pow(1 + (cdiAno / 100) * (pctCdi / 100), 1 / 12) - 1;
  return comIR ? bruta * (1 - aliquotaIR(meses)) : bruta;
}

/**
 * À vista x parcelado: o dinheiro do à vista fica aplicado a `taxa` ao mês e paga uma parcela por mês
 * (a primeira daqui a 1 mês, ou hoje com `entrada`). `custoHoje` é quanto precisa ter aplicado hoje
 * para pagar todas; `sobra` é o que resta aplicado no fim; `juros` é a taxa mensal embutida no parcelado.
 */
export function avistaOuParcelado(avista: number, parcela: number, n: number, taxa: number, entrada = false) {
  if (avista <= 0 || parcela <= 0 || n < 1) return null;
  const desc = (i: number) => Array.from({ length: n }, (_, k) => parcela / Math.pow(1 + i, k + (entrada ? 0 : 1))).reduce((a, b) => a + b, 0);
  const custoHoje = desc(taxa);
  let saldo = avista;
  const meses: { mes: number; saldo: number }[] = [];
  for (let k = entrada ? 0 : 1; k <= n - (entrada ? 1 : 0); k++) {
    if (k > 0) saldo *= 1 + taxa;
    saldo -= parcela;
    meses.push({ mes: k, saldo: Math.round(saldo * 100) / 100 });
  }
  // juros embutidos: taxa que iguala o valor presente das parcelas ao preço à vista
  let juros: number | null = null;
  if (parcela * n > avista) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (desc(m) > avista) lo = m;
      else hi = m;
    }
    juros = (lo + hi) / 2;
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { total: r2(parcela * n), custoHoje: r2(custoHoje), economia: r2(avista - custoHoje), sobra: r2(saldo), meses, juros, compensa: custoHoje < avista ? ('parcelado' as const) : ('avista' as const) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Parcela fixa (tabela Price) de `pv` a `i` ao mês em `n` meses */
export const parcelaPrice = (pv: number, i: number, n: number) => (i > 0 ? (pv * i) / (1 - Math.pow(1 + i, -n)) : pv / n);

/**
 * Empréstimo de `valor` em `n` parcelas fixas a `taxa` ao mês. Com `iof`, financia junto o IOF de pessoa física
 * (0,38% + 0,0082% ao dia sobre cada amortização, até 365 dias). `custo` = tudo que paga além do valor.
 */
export function emprestimo(valor: number, taxa: number, n: number, iof = false) {
  if (valor <= 0 || n < 1) return null;
  const imposto = (pv: number) => {
    const p = parcelaPrice(pv, taxa, n);
    let saldo = pv;
    let t = pv * 0.0038;
    for (let k = 1; k <= n; k++) {
      const amort = p - saldo * taxa;
      saldo -= amort;
      t += amort * 0.000082 * Math.min(k * 30, 365);
    }
    return t;
  };
  let pv = valor;
  if (iof) for (let k = 0; k < 4; k++) pv = valor + imposto(pv);
  const parcela = r2(parcelaPrice(pv, taxa, n));
  return { parcela, total: r2(parcela * n), custo: r2(parcela * n - valor), iof: r2(pv - valor) };
}

/**
 * Dívida que rola a `taxa` ao mês pagando `pagamento` por mês. `teto` limita a soma dos juros
 * (rotativo do cartão: no máximo 100% da dívida, Lei 14.690/2023). `meses` null = o pagamento não cobre os juros.
 */
export function quitarDivida(divida: number, taxa: number, pagamento: number, teto = Infinity) {
  if (divida <= 0 || pagamento <= 0) return null;
  const jurosMes = r2(divida * taxa);
  if (teto === Infinity && pagamento <= divida * taxa) return { meses: null, juros: 0, total: 0, jurosMes, tabela: [] };
  let saldo = divida;
  let juros = 0;
  const tabela: { mes: number; juros: number; pago: number; saldo: number }[] = [];
  for (let k = 1; saldo > 0.005 && k <= 600; k++) {
    const j = Math.min(saldo * taxa, Math.max(teto - juros, 0));
    juros += j;
    saldo += j;
    const pago = Math.min(pagamento, saldo);
    saldo -= pago;
    tabela.push({ mes: k, juros: r2(j), pago: r2(pago), saldo: r2(saldo) });
  }
  return { meses: saldo <= 0.005 ? tabela.length : null, juros: r2(juros), total: r2(divida + juros), jurosMes, tabela };
}

/** INSS 2026 (progressivo por faixa, teto R$ 8.475,55) */
const INSS: [number, number][] = [[1621, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]];
/** IR mensal: limite da faixa, alíquota e parcela a deduzir */
const IR: [number, number, number][] = [[2428.8, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]];

export function inss(bruto: number) {
  let t = 0;
  let ant = 0;
  for (const [lim, a] of INSS) {
    if (bruto <= ant) break;
    t += (Math.min(bruto, lim) - ant) * a;
    ant = lim;
  }
  return r2(t);
}

/**
 * IR na fonte de 2026: usa o desconto simplificado (R$ 607,20) quando ele é maior que INSS + dependentes,
 * e aplica a redução da Lei 15.270/2025 (zera até R$ 5.000 de rendimento e diminui até R$ 7.350).
 */
export function irFonte(bruto: number, inssPago: number, dependentes = 0) {
  const base = bruto - Math.max(inssPago + dependentes * 189.59, 607.2);
  const [, a, d] = IR.find(([lim]) => base <= lim)!;
  const ir = Math.max(base * a - d, 0);
  const reducao = bruto <= 5000 ? ir : bruto <= 7350 ? 978.62 - 0.133145 * bruto : 0;
  return r2(Math.max(ir - reducao, 0));
}

export function salarioLiquido(bruto: number, dependentes = 0, outros = 0) {
  if (bruto <= 0) return null;
  const i = inss(bruto);
  const ir = irFonte(bruto, i, dependentes);
  return { inss: i, ir, outros: r2(outros), liquido: r2(bruto - i - ir - outros), fgts: r2(bruto * 0.08) };
}

/**
 * `inicial` hoje e `aporte` no começo de cada mês, por `n` meses a `taxa` bruta ao mês.
 * Com `ir`, cada depósito paga no resgate o IR pelo tempo que ficou aplicado (tabela regressiva).
 */
export function rendimento(inicial: number, aporte: number, n: number, taxa: number, ir = true) {
  if (n < 1 || (inicial <= 0 && aporte <= 0)) return null;
  let bruto = 0;
  let imposto = 0;
  for (let k = 0; k < n; k++) {
    const v = aporte + (k === 0 ? inicial : 0);
    const ganho = v * (Math.pow(1 + taxa, n - k) - 1);
    bruto += v + ganho;
    if (ir) imposto += ganho * aliquotaIR(n - k);
  }
  const depositado = inicial + aporte * n;
  return { depositado: r2(depositado), final: r2(bruto - imposto), imposto: r2(imposto), ganho: r2(bruto - imposto - depositado) };
}

type GastoDup = Pick<Gasto, 'id' | 'descricao' | 'valor' | 'data' | 'parcelamento_id' | 'nao_duplicado'>;

/**
 * Pares de gastos com mesmo valor, mesma descrição e até 1 dia de diferença.
 * Par em que os dois foram confirmados (nao_duplicado) não volta; parcelas do mesmo parcelamento não contam.
 */
export function duplicados<T extends GastoDup>(gastos: T[]): [T, T][] {
  const grupos = new Map<string, T[]>();
  for (const g of gastos) {
    const k = `${g.valor.toFixed(2)}|${normalizar(g.descricao)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), g]);
  }
  const pares: [T, T][] = [];
  for (const l of grupos.values()) {
    if (l.length < 2) continue;
    l.sort((a, b) => a.data.localeCompare(b.data));
    for (let i = 0; i < l.length; i++)
      for (let j = i + 1; j < l.length && diffDias(l[i].data, l[j].data) <= 1; j++) {
        const [a, b] = [l[i], l[j]];
        if ((a.nao_duplicado && b.nao_duplicado) || (a.parcelamento_id && a.parcelamento_id === b.parcelamento_id)) continue;
        pares.push([a, b]);
      }
  }
  return pares;
}
