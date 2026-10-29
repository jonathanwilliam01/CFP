import { addDias, iso, parse } from './datas';
import { parseValor } from './formato';
import { Beneficio, Cartao, Categoria } from './models';

export interface TextoLido {
  valor: number | null;
  descricao: string;
  data: string | null;
  /** id do cartão, 'debito' ou 'b:<benefício>' */
  pagamento: string | null;
  categoria_id: string | null;
  parcelas: number | null;
  tags: string[];
}

export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const DEBITO = ['pix', 'debito', 'dinheiro', 'especie', 'boleto'];
/** preposições soltas no fim da descrição ("uber no" nubank) */
const SOLTAS = ['no', 'na', 'com', 'pelo', 'pela', 'via', 'em', 'de'];

function lerData(t: string, hoje: string) {
  if (t === 'hoje') return hoje;
  if (t === 'ontem') return addDias(hoje, -1);
  if (t === 'anteontem') return addDias(hoje, -2);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const ano = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : parse(hoje).getFullYear();
  const d = new Date(ano, +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? iso(d) : null;
}

const casaNome = (nome: string, t: string) => {
  const n = normalizar(nome);
  return t.length >= 2 && (n.split(/\s+/).includes(t) || (t.length >= 3 && n.startsWith(t)));
};

function lerPagamento(t: string, cartoes: Cartao[], beneficios: Beneficio[]) {
  if (DEBITO.includes(t)) return 'debito';
  const c = cartoes.find((x) => x.ativo && casaNome(x.nome, t));
  if (c) return c.id;
  const b = beneficios.find((x) => x.ativo && casaNome(x.nome, t));
  return b ? `b:${b.id}` : null;
}

/** "mercado 120,50 nubank ontem #casa" ou "tv 1200 10x inter": valor, descrição, data, pagamento, parcelas e marcadores */
export function lerTexto(texto: string, ctx: { cartoes: Cartao[]; beneficios: Beneficio[]; categorias: Categoria[]; hoje: string }): TextoLido {
  const r: TextoLido = { valor: null, descricao: '', data: null, pagamento: null, categoria_id: null, parcelas: null, tags: [] };
  const resto: string[] = [];
  for (const tk of texto.trim().split(/\s+/).filter(Boolean)) {
    const t = normalizar(tk);
    if (t === 'r$') continue;
    if (tk.startsWith('#') && tk.length > 1) {
      r.tags.push(t.slice(1));
      continue;
    }
    if (r.valor == null && /^(r\$)?(\d{1,3}(\.\d{3})+|\d+)([.,]\d{1,2})?$/.test(t)) {
      r.valor = parseValor(t);
      continue;
    }
    const px = t.match(/^(\d{1,3})x$/);
    if (px && +px[1] >= 2 && !r.parcelas) {
      r.parcelas = +px[1];
      continue;
    }
    const d = r.data ? null : lerData(t, ctx.hoje);
    if (d) {
      r.data = d;
      continue;
    }
    const pg = r.pagamento ? null : lerPagamento(t, ctx.cartoes, ctx.beneficios);
    if (pg) {
      r.pagamento = pg;
      continue;
    }
    resto.push(tk);
  }
  while (resto.length > 1 && SOLTAS.includes(normalizar(resto[resto.length - 1]))) resto.pop();
  const desc = resto.join(' ');
  r.descricao = desc.charAt(0).toUpperCase() + desc.slice(1);
  const nd = normalizar(desc);
  const palavras = nd.split(/\s+/);
  r.categoria_id = ctx.categorias.find((c) => c.tipo === 'gasto' && (normalizar(c.nome) === nd || palavras.includes(normalizar(c.nome))))?.id ?? null;
  return r;
}

/** "viagem, #praia reforma" → ['viagem', 'praia', 'reforma'] */
export const lerTags = (s: string) => [...new Set(s.split(/[\s,;]+/).map((t) => normalizar(t.replace(/^#+/, ''))).filter(Boolean))];
