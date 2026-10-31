import { parseValor } from './formato';
import { Categoria } from './models';

export interface ItemExtrato {
  data: string;
  /** título original do arquivo */
  titulo: string;
  /** título sem o número da parcela, para lembrar descrição e categoria */
  chave: string;
  descricao: string;
  valor: number;
  parcela: number | null;
  parcelas: number | null;
}

/** nubank e csv: fatura ou extrato em CSV; ofx-cartao/ofx-conta: OFX de cartão ou de conta */
export type Origem = 'nubank' | 'csv' | 'ofx-cartao' | 'ofx-conta';

export interface Extrato {
  itens: ItemExtrato[];
  /** pagamentos (e créditos fora da fatura do cartão) e linhas sem data/valor */
  ignorados: number;
  origem: Origem;
}

// "Loja - Parcela 1/4", "Loja Parcela 1/4" ou "Parcelamento de Compra - Loja - 5/5"
const PARCELA = /^(?:Parcelamento de Compra\s*-\s*)?(.*?)(?:\s*-\s*(?:Parcela\s+)?|\s+Parcela\s+)(\d{1,3})\/(\d{1,3})$/i;

/** OFX pelo conteúdo; CSV do Nubank pelas colunas date,title,amount; senão CSV genérico */
export function lerExtrato(texto: string): Extrato {
  texto = texto.replace(/^\uFEFF/, '');
  if (/<OFX>/i.test(texto)) return lerOfx(texto);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  const sep = (linhas[0]?.split(';').length ?? 0) > (linhas[0]?.split(',').length ?? 0) ? ';' : ',';
  const tab = linhas.map((l) => campos(l, sep));
  const cab = (tab.shift() ?? []).map(normalizar);
  if (['date', 'title', 'amount'].every((c) => cab.includes(c))) return lerNubank(cab, tab);
  return lerCsv(cab, tab);
}

/** Fatura do Nubank: valor positivo é compra; negativo é estorno/crédito, menos o pagamento da fatura */
function lerNubank(cab: string[], tab: string[][]): Extrato {
  const [iD, iT, iV] = ['date', 'title', 'amount'].map((c) => cab.indexOf(c));
  return montar(tab.map((l) => ({ data: l[iD], titulo: l[iT], valor: parseValor(l[iV]) })), 'nubank');
}

/** CSV de banco: acha as colunas de data, descrição e valor pelo nome. Gasto é o sinal da maioria dos valores. */
function lerCsv(cab: string[], tab: string[][]): Extrato {
  const col = (re: RegExp) => cab.findIndex((c) => re.test(c));
  const iD = col(/^(data|date|dt)/);
  const iT = col(/descri|hist|titulo|title|estabelec|lancamento|memo|detalhe/);
  const iV = col(/^(valor|amount|value|quantia)/);
  if (iD < 0 || iT < 0 || iV < 0) throw new Error('Não achei as colunas de data, descrição e valor no CSV');
  const brutos = tab.map((l) => ({ data: l[iD], titulo: l[iT], valor: parseValor(l[iV]) }));
  const negativos = brutos.filter((x) => x.valor < 0).length;
  const sinal = negativos > brutos.length - negativos ? -1 : 1;
  return montar(brutos.map((x) => ({ ...x, valor: x.valor * sinal })), 'csv');
}

/** OFX (SGML ou XML): débitos têm TRNAMT negativo, tanto no cartão quanto na conta */
function lerOfx(texto: string): Extrato {
  const tag = (bloco: string, t: string) => bloco.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'))?.[1].trim() ?? '';
  const brutos = [...texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi)].map(([, b]) => ({
    data: tag(b, 'DTPOSTED').slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
    titulo: tag(b, 'MEMO') || tag(b, 'NAME'),
    valor: -parseValor(tag(b, 'TRNAMT')),
  }));
  return montar(brutos, /<CCSTMTRS>/i.test(texto) ? 'ofx-cartao' : 'ofx-conta');
}

const PAGAMENTO = /pagamento|pagto|pgto/i;

function montar(brutos: { data?: string; titulo?: string; valor: number }[], origem: Origem): Extrato {
  const itens: ItemExtrato[] = [];
  // na fatura do cartão, valor negativo que não é o pagamento é estorno ou crédito e abate a fatura
  const creditos = origem === 'nubank' || origem === 'ofx-cartao';
  let ignorados = 0;
  for (const b of brutos) {
    const data = dataIso(b.data ?? '');
    const titulo = (b.titulo ?? '').trim();
    const credito = creditos && b.valor < 0 && !PAGAMENTO.test(titulo);
    if (!(b.valor > 0 || credito) || !data) {
      ignorados++;
      continue;
    }
    const p = credito ? null : titulo.match(PARCELA);
    const parcelado = p && +p[2] >= 1 && +p[2] <= +p[3] && +p[3] > 1;
    const base = parcelado ? p[1] : titulo;
    itens.push({
      data, titulo, chave: base.toLowerCase(), descricao: limpar(base), valor: Math.round(b.valor * 100) / 100,
      parcela: parcelado ? +p[2] : null, parcelas: parcelado ? +p[3] : null,
    });
  }
  return { itens, ignorados, origem };
}

/** dd/mm/aaaa, dd/mm/aa ou aaaa-mm-dd → aaaa-mm-dd; inválida → '' */
export function dataIso(s: string) {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return '';
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const normalizar = (c: string) => c.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function campos(linha: string, sep: string) {
  const r: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"' && aspas && linha[i + 1] === '"') atual += linha[++i];
    else if (c === '"') aspas = !aspas;
    else if (c === sep && !aspas) {
      r.push(atual);
      atual = '';
    } else atual += c;
  }
  r.push(atual);
  return r;
}

// Marketplaces ficam só com o nome dele, sem a loja
const NOMES: [RegExp, string][] = [
  [/^shopee/i, 'Shopee'],
  [/^amazon/i, 'Amazon'],
  [/^mercado ?livre/i, 'Mercado Livre'],
  [/^loja 11\b/i, 'Semar'],
];

/** Tira prefixo de intermediador ("Dl *", "Mp *"), asteriscos e números soltos no início/fim ("211 Shibata", "Raia3790") */
function limpar(t: string) {
  const s = t.replace(/^(dl|mp|pg|ec)\s*\*\s*/i, '');
  const nome = NOMES.find(([re]) => re.test(s));
  if (nome) return nome[1];
  const r = s.replace(/\s*\*\s*/g, ' ').replace(/^\d+\s+|\s*\d+$/g, '').replace(/\s+/g, ' ').trim();
  return r || s.trim();
}

const PALAVRAS: [RegExp, string][] = [
  [/uber|\b99\b|cabify|metr[oô]|[oô]nibus/i, 'transporte'],
  [/posto|ipiranga|shell|petrobras|\bbr mania|combust/i, 'gasolina'],
  [/auto ?center|autozone|motoservice|estaciona|sem parar|veloe|mec[aâ]nica/i, 'carro'],
  [/drogaria|raia|drogasil|farm[aá]c|pague menos/i, 'saúde'],
  [/padaria|panifica|espetinho|restaurante|lanche|burger|ifood|pizza|a[cç]a[ií]/i, 'alimentação'],
  [/claro|vivo|\btim\b|netflix|spotify|google|github|apple|disney|hbo|prime video/i, 'assinaturas'],
  [/shopee|amazon|mercado ?li|magalu|shein|aliexpress|\bloja/i, 'compras'],
  [/mercado|supermerc|atacad|assa[ií]|shibata|semar|carrefour|hortifruti/i, 'mercado'],
];

/** Categoria pelo nome do estabelecimento */
export function palpiteCategoria(texto: string, cats: Categoria[]) {
  for (const [re, nome] of PALAVRAS) {
    if (!re.test(texto)) continue;
    const c = cats.find((x) => x.nome.toLowerCase() === nome);
    if (c) return c.id;
  }
  return null;
}
