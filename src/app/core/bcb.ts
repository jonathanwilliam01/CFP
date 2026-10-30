import { signal } from '@angular/core';

/** Taxas do Banco Central (SGS: sem chave e com CORS liberado), em % */
export interface Taxas {
  cdi: number;
  selic: number;
  ipca12: number;
  poupanca: number;
  cheque: number;
  emprestimo: number;
  rotativo: number;
  /** data do CDI, AAAA-MM-DD */
  data: string;
  buscado: string;
}

// CDI a.a., Selic meta a.a., IPCA 12 meses, poupança no mês e médias de juros PF ao mês (cheque especial, pessoal não consignado, rotativo)
const SERIES = { cdi: 4389, selic: 432, ipca12: 13522, poupanca: 195, cheque: 25463, emprestimo: 25464, rotativo: 25477 } as const;
const CHAVE = 'cfp.bcb';

function ler(): Taxas | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
  } catch {
    return null;
  }
}

export const taxasBcb = signal<Taxas | null>(ler());

const hojeIso = () => new Date().toISOString().slice(0, 10);
const iso = (d: string) => d.split('/').reverse().join('-');

async function ultimo(serie: number) {
  const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`);
  if (!r.ok) throw new Error(`BCB ${serie}: ${r.status}`);
  const [v] = (await r.json()) as { data: string; valor: string }[];
  return { data: iso(v.data), valor: Number(v.valor) };
}

/** Busca uma vez por dia; sem internet fica com a última guardada */
export async function atualizarTaxas() {
  if (taxasBcb()?.buscado === hojeIso()) return;
  try {
    const l = await Promise.all(Object.values(SERIES).map(ultimo));
    const v = Object.fromEntries(Object.keys(SERIES).map((k, i) => [k, l[i].valor])) as Omit<Taxas, 'data' | 'buscado'>;
    if (Object.values(v).some((x) => !isFinite(x))) return;
    const t: Taxas = { ...v, data: l[0].data, buscado: hojeIso() };
    taxasBcb.set(t);
    localStorage.setItem(CHAVE, JSON.stringify(t));
  } catch {
    // fora do ar ou sem rede: continua com o padrão
  }
}
