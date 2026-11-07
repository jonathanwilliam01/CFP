import { addDias } from './datas';

export interface CodigoLido {
  tipo: 'boleto' | 'convenio' | 'pix';
  valor: number | null;
  vencimento: string | null;
}

/** Fator de vencimento: dias desde 07/10/1997; em 22/02/2025 voltou a 1000. Fica a data mais perto de `ref`. */
function vencimentoFator(fator: number, ref: string) {
  if (!fator) return null;
  const datas = [addDias('1997-10-07', fator)];
  if (fator >= 1000) datas.push(addDias('2025-02-22', fator - 1000));
  const dist = (d: string) => Math.abs(Date.parse(d) - Date.parse(ref));
  return datas.sort((a, b) => dist(a) - dist(b))[0];
}

/** Valor da tag 54 de um Pix copia e cola (EMV) */
function valorPix(t: string) {
  for (let i = 0; i + 4 <= t.length; ) {
    const id = t.slice(i, i + 2);
    const n = Number(t.slice(i + 2, i + 4));
    if (!Number.isInteger(n)) return null;
    if (id === '54') return Number(t.slice(i + 4, i + 4 + n)) || null;
    i += 4 + n;
  }
  return null;
}

/** Lê linha digitável/código de barras de boleto (bancário ou de convênio) ou Pix copia e cola */
export function lerCodigo(texto: string, ref: string): CodigoLido | null {
  const t = texto.trim();
  if (t.startsWith('000201')) return { tipo: 'pix', valor: valorPix(t), vencimento: null };
  const d = t.replace(/\D/g, '');
  if (d.length === 47 && d[0] !== '8')
    return { tipo: 'boleto', valor: Number(d.slice(37)) / 100 || null, vencimento: vencimentoFator(Number(d.slice(33, 37)), ref) };
  if (d.length === 44 && d[0] !== '8')
    return { tipo: 'boleto', valor: Number(d.slice(9, 19)) / 100 || null, vencimento: vencimentoFator(Number(d.slice(5, 9)), ref) };
  // convênio (água, luz): 4 blocos de 11 + DV na linha; 3º dígito 6 ou 8 = valor em reais
  const barras = d.length === 48 && d[0] === '8' ? [0, 12, 24, 36].map((i) => d.slice(i, i + 11)).join('') : d.length === 44 && d[0] === '8' ? d : null;
  if (barras) return { tipo: 'convenio', valor: '68'.includes(barras[2]) ? Number(barras.slice(4, 15)) / 100 || null : null, vencimento: null };
  return null;
}
