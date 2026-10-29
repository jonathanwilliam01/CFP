import { addDias, addMeses, diaNoMes, diasNoMes, diffDias, fimMes, inicioMes, mesFatura, mesesEntre } from './datas';
import { pct, soma } from './formato';
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
  const mes = mesFatura(hoje, c.fechamento_dia, c.vencimento_dia);
  const m = inicioMes(hoje);
  const fecha = Number(hoje.slice(8, 10)) >= c.fechamento_dia ? diaNoMes(addMeses(m, 1), c.fechamento_dia) : diaNoMes(m, c.fechamento_dia);
  const abriu = diaNoMes(addMeses(inicioMes(fecha), -1), c.fechamento_dia);
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
