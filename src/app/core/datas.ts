// Datas trafegam como 'YYYY-MM-DD'; mês é sempre o dia 1.

const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const hoje = () => iso(new Date());

export const inicioMes = (s: string) => s.slice(0, 8) + '01';

export const mesAtual = () => inicioMes(hoje());

export function addMeses(s: string, n: number) {
  const d = parse(s);
  const dia = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(dia, diasNoMes(iso(r))));
  return iso(r);
}

export function addDias(s: string, n: number) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export const diasNoMes = (s: string) => {
  const d = parse(s);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

export const fimMes = (s: string) => s.slice(0, 8) + pad(diasNoMes(s));

/** Data do dia `dia` no mês, ajustada para meses curtos */
export const diaNoMes = (mes: string, dia: number) => mes.slice(0, 8) + pad(Math.min(dia, diasNoMes(mes)));

export const diffDias = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export const mesesEntre = (a: string, b: string) => {
  const x = parse(a), y = parse(b);
  return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth();
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const nomeMes = (s: string, curto = false) => {
  const d = parse(s);
  const m = MESES[d.getMonth()];
  return curto ? m.slice(0, 3) : `${m} ${d.getFullYear()}`;
};

export function rotuloDia(s: string) {
  const d = diffDias(s, hoje());
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  if (d === -1) return 'Amanhã';
  return parse(s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Contagem até o prazo: "faltam 3 meses", "faltam 12 dias" */
export function faltaPara(prazo: string, de = hoje()) {
  const d = diffDias(de, prazo);
  if (d < 0) return 'prazo passou';
  if (d === 0) return 'prazo é hoje';
  if (d < 60) return `faltam ${d} dia${d > 1 ? 's' : ''}`;
  return `faltam ${mesesEntre(de, prazo)} meses`;
}

/** Mês (dia 1) em que vence a fatura de uma compra. Mesma regra de calc_fatura no banco. */
export function mesFatura(data: string, fech: number, venc: number) {
  let m = inicioMes(data);
  if (parse(data).getDate() >= fech) m = addMeses(m, 1);
  if (venc <= fech) m = addMeses(m, 1);
  return m;
}

/** Primeiro dia de compra que cai na fatura `mes` (inverso de mesFatura) */
export function inicioFatura(mes: string, fech: number, venc: number) {
  const m = addMeses(mes, venc <= fech ? -2 : -1);
  return fech > diasNoMes(m) ? addMeses(m, 1) : diaNoMes(m, fech);
}
