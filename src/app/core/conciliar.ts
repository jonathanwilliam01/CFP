import { diffDias } from './datas';
import { normalizar } from './texto';

export interface LinhaBanco {
  data: string;
  titulo: string;
  descricao: string;
  valor: number;
  parcela: number | null;
  parcelas: number | null;
}

export interface ItemApp {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  parcela?: number | null;
}

export interface Conciliacao<G extends ItemApp, F extends ItemApp> {
  /** mesmo valor */
  ok: { b: LinhaBanco; g: G }[];
  /** mesmo nome, valor diferente */
  valor: { b: LinhaBanco; g: G }[];
  /** conta fixa do cartão (diferente = preço mudou) */
  fixas: { b: LinhaBanco; f: F; diferente: boolean }[];
  /** no banco e não no app */
  faltam: LinhaBanco[];
  /** no app e não no banco */
  sobram: G[];
  fixasSobram: F[];
}

const palavras = (s: string) => normalizar(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length >= 3 && !/^\d+$/.test(p));

/** Nome parecido: um contém o outro ou dividem uma palavra de 3+ letras */
export function parecido(a: string, b: string) {
  const x = palavras(a);
  const y = palavras(b);
  if (!x.length || !y.length) return false;
  const jx = x.join(' ');
  const jy = y.join(' ');
  return jx.includes(jy) || jy.includes(jx) || x.some((p) => y.includes(p));
}

const mesmoValor = (a: number, b: number) => Math.abs(a - b) < 0.005;
const nomeBate = (b: LinhaBanco, g: ItemApp) => parecido(b.descricao, g.descricao) || parecido(b.titulo, g.descricao);
const parcelaBate = (b: LinhaBanco, g: ItemApp) => b.parcela == null || g.parcela == null || b.parcela === g.parcela;

/** Casa as linhas da fatura do banco com os gastos e as contas fixas da mesma fatura no app */
export function conciliar<G extends ItemApp, F extends ItemApp>(banco: LinhaBanco[], gastos: G[], fixas: F[]): Conciliacao<G, F> {
  const r: Conciliacao<G, F> = { ok: [], valor: [], fixas: [], faltam: [], sobram: [], fixasSobram: [] };
  const g = [...gastos];
  const f = [...fixas];
  let resto: LinhaBanco[] = [];

  const melhor = <T extends ItemApp>(b: LinhaBanco, l: T[], filtro: (x: T) => boolean) => {
    let i = -1;
    let nota = -Infinity;
    l.forEach((x, k) => {
      if (!filtro(x)) return;
      const n = (nomeBate(b, x) ? 4 : 0) + (b.parcela != null && b.parcela === x.parcela ? 2 : 0) - Math.min(Math.abs(diffDias(b.data, x.data)), 60) / 30;
      if (n > nota) [i, nota] = [k, n];
    });
    return i < 0 ? null : l.splice(i, 1)[0];
  };

  for (const b of banco) {
    const x = melhor(b, g, (x) => mesmoValor(x.valor, b.valor) && parcelaBate(b, x));
    if (x) r.ok.push({ b, g: x });
    else resto.push(b);
  }

  const semFixa: LinhaBanco[] = [];
  for (const b of resto) {
    const x = b.parcela == null && b.valor > 0 ? melhor(b, f, (x) => nomeBate(b, x)) ?? melhor(b, f, (x) => mesmoValor(x.valor, b.valor)) : null;
    if (x) r.fixas.push({ b, f: x, diferente: !mesmoValor(x.valor, b.valor) });
    else semFixa.push(b);
  }
  resto = semFixa;

  for (const b of resto) {
    const x = melhor(b, g, (x) => nomeBate(b, x) && parcelaBate(b, x) && Math.sign(x.valor) === Math.sign(b.valor));
    if (x) r.valor.push({ b, g: x });
    else r.faltam.push(b);
  }

  r.sobram = g;
  r.fixasSobram = f;
  return r;
}
