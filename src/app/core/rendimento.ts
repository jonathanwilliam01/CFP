import { addMeses, diasNoMes, fimMes, inicioMes, nomeMes } from './datas';
import { Cofrinho, CofrinhoMov } from './models';

/** Taxa do mês (fração): % do CDI ou taxa fixa ao ano, composta para 1/12 */
export function taxaMensal(c: Pick<Cofrinho, 'rende' | 'rende_pct'>, cdiAno: number | null) {
  const pct = c.rende_pct ?? 0;
  if (!c.rende || pct <= 0) return 0;
  if (c.rende === 'fixo') return Math.pow(1 + pct / 100, 1 / 12) - 1;
  return cdiAno == null ? 0 : (Math.pow(1 + cdiAno / 100, 1 / 12) - 1) * (pct / 100);
}

/** Taxa ao ano equivalente, em % (para mostrar "≈ X% a.a.") */
export const taxaAno = (mensal: number) => (Math.pow(1 + mensal, 12) - 1) * 100;

export interface RendimentoMes {
  cofrinho_id: string;
  rendimento_mes: string;
  data: string;
  valor: number;
  descricao: string;
}

/**
 * Rendimento bruto dos meses fechados que ainda não foram lançados, de rende_desde até o mês antes de `atual`.
 * Depósito no meio do mês rende proporcional aos dias que ficou; rendimento de um mês entra no saldo do seguinte.
 */
export function rendimentosPendentes(c: Cofrinho, movs: CofrinhoMov[], taxa: number, atual: string, limite = 24): RendimentoMes[] {
  if (taxa <= 0 || !c.rende_desde) return [];
  const meus = movs.filter((m) => m.cofrinho_id === c.id);
  const ultimo = meus.reduce<string | null>((u, m) => (m.rendimento_mes && (!u || m.rendimento_mes > u) ? m.rendimento_mes : u), null);
  let mes = inicioMes(c.rende_desde);
  if (ultimo && ultimo >= mes) mes = addMeses(ultimo, 1);
  const fim = addMeses(inicioMes(atual), -1);
  const novos: RendimentoMes[] = [];
  let saldo = meus.filter((m) => m.data < mes).reduce((s, m) => s + m.valor, 0);
  for (let n = 0; mes <= fim && n < limite; n++, mes = addMeses(mes, 1)) {
    const ult = fimMes(mes), dias = diasNoMes(mes);
    const doMes = meus.filter((m) => m.data >= mes && m.data <= ult && !m.rendimento_mes);
    const base = saldo + doMes.reduce((s, m) => s + (m.valor * (dias - +m.data.slice(8) + 1)) / dias, 0);
    const valor = Math.round(base * taxa * 100) / 100;
    saldo += doMes.reduce((s, m) => s + m.valor, 0);
    if (valor > 0) {
      novos.push({ cofrinho_id: c.id, rendimento_mes: mes, data: ult, valor, descricao: `Rendimento de ${nomeMes(mes)}` });
      saldo += valor;
    }
  }
  return novos;
}
