import { parseValor } from './formato';
import { Categoria } from './models';

export interface ItemFatura {
  data: string;
  /** título original da fatura */
  titulo: string;
  /** título sem o número da parcela, para lembrar descrição e categoria */
  chave: string;
  descricao: string;
  valor: number;
  parcela: number | null;
  parcelas: number | null;
}

// "Loja - Parcela 1/4" ou "Parcelamento de Compra - Loja - 5/5"
const PARCELA = /^(?:Parcelamento de Compra\s*-\s*)?(.*?)\s*-\s*(?:Parcela\s+)?(\d+)\/(\d+)$/i;

/** CSV da fatura do Nubank (date,title,amount). Pagamentos e estornos (valor negativo) ficam de fora. */
export function lerNubank(csv: string) {
  const linhas = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map(campos);
  const cab = linhas.shift()?.map((c) => c.trim().toLowerCase()) ?? [];
  const [iD, iT, iV] = ['date', 'title', 'amount'].map((c) => cab.indexOf(c));
  if (iD < 0 || iT < 0 || iV < 0) throw new Error('Arquivo não é uma fatura do Nubank (colunas date, title, amount)');
  const itens: ItemFatura[] = [];
  let ignorados = 0;
  for (const l of linhas) {
    const data = (l[iD] ?? '').trim().replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
    const valor = parseValor(l[iV]);
    if (!(valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      ignorados++;
      continue;
    }
    const titulo = (l[iT] ?? '').trim();
    const p = titulo.match(PARCELA);
    const base = p ? p[1] : titulo;
    itens.push({ data, titulo, chave: base.toLowerCase(), descricao: limpar(base), valor, parcela: p ? +p[2] : null, parcelas: p ? +p[3] : null });
  }
  return { itens, ignorados };
}

function campos(linha: string) {
  const r: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"' && aspas && linha[i + 1] === '"') atual += linha[++i];
    else if (c === '"') aspas = !aspas;
    else if (c === ',' && !aspas) {
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
  [/auto ?center|autozone|posto|ipiranga|motoservice|estaciona|sem parar|veloe|mec[aâ]nica/i, 'carro'],
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
