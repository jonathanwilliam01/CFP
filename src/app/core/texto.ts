import { addDias, iso, parse } from './datas';
import { parseValor } from './valor';
import type { Beneficio, Cartao, Categoria } from './models';

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
/** ligam uma palavra à seguinte ("uber no nubank", "50 de mercado"): saem da descrição quando sobram */
const LIGA = ['no', 'na', 'nos', 'nas', 'num', 'numa', 'com', 'pelo', 'pela', 'via', 'em', 'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'ao',
  'um', 'uma', 'pro', 'pra', 'para', 'por', 'e', 'cartao', 'credito', 'valor', 'total'];
/** jeito de falar que não é descrição ("gastei 50 no mercado") */
const VERBOS = ['gastei', 'gastamos', 'paguei', 'pagamos', 'comprei', 'compramos', 'recebi', 'recebemos', 'ganhei', 'lanca', 'lancar', 'lance', 'anota', 'anotar',
  'adiciona', 'adicionar', 'coloca', 'colocar', 'registra', 'registrar', 'foi', 'foram', 'deu', 'custou', 'saiu', 'gasto', 'novo', 'nova'];
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const UNI: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11,
  doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
const DEZ: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const CEM: Record<string, number> = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };
const MOEDA = ['reais', 'real', 'conto', 'contos', 'pila', 'pilas'];
const VEZES = ['vezes', 'vez', 'parcelas', 'parcela', 'x'];

const peso = (t: string | undefined) => (t == null ? 0 : t in CEM ? 3 : t in DEZ ? 2 : t in UNI ? 1 : 0);
const valorDe = (t: string) => CEM[t] ?? DEZ[t] ?? UNI[t];

/** "cento e vinte e cinco" a partir de i: valor < 1000 e onde parou */
function grupo(ts: string[], i: number) {
  let v = 0, j = i, ordem = 4;
  while (peso(ts[j]) && peso(ts[j]) < ordem) {
    ordem = peso(ts[j]);
    v += valorDe(ts[j++]);
    if (ts[j] === 'e' && peso(ts[j + 1]) && peso(ts[j + 1]) < ordem) j++;
    else break;
  }
  return j > i ? { v, j } : null;
}

/** número falado ("dois mil e quinhentos", "1.200", "3 mil"): valor e onde parou */
function numero(ts: string[], i: number): { v: number; j: number; dec: boolean } | null {
  const t = ts[i];
  if (t == null) return null;
  if (/^(\d{1,3}(\.\d{3})+|\d+)([.,]\d{1,2})?$/.test(t)) {
    const v = parseValor(t);
    if (ts[i + 1] === 'mil' && Number.isInteger(v)) return { v: v * 1000, j: i + 2, dec: false };
    return { v, j: i + 1, dec: /[.,]\d{1,2}$/.test(t) };
  }
  let g = grupo(ts, i);
  let v = g?.v ?? 0, j = g?.j ?? i;
  if (ts[j] === 'mil') {
    v = (g ? v : 1) * 1000;
    j++;
    const r = ts[j] === 'e' ? grupo(ts, j + 1) : grupo(ts, j);
    if (r) [v, j] = [v + r.v, r.j];
  }
  if (j === i) return null;
  // "um"/"uma" sozinho é artigo ("uma pizza"), salvo "um real", "uma vez"
  if (j === i + 1 && (t === 'um' || t === 'uma') && !MOEDA.includes(ts[j]) && !VEZES.includes(ts[j])) return null;
  return { v, j, dec: false };
}

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

const dd = (n: number) => String(n).padStart(2, '0');

/** Fala vira a forma curta: "cento e vinte reais e cinquenta centavos" → "r$120,50", "em dez vezes" → "10x", "dia 5 de outubro" → "05/10" */
export function prepararFala(texto: string, hoje: string) {
  const orig = texto.trim().split(/\s+/).map((t) => t.replace(/[!?;:.,]+$/, '')).filter(Boolean);
  const ts = orig.map((t) => normalizar(t).replace(/-feira$/, ''));
  const out: string[] = [];
  const cents = (k: number) => {
    const c = numero(ts, k);
    return c && !c.dec && c.v >= 1 && c.v <= 99 ? c : null;
  };
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t === 'a' && ts[i + 1] === 'vista') { i++; continue; }
    if (t === 'avista' || t === 'feira' || (t === 'dia' && /^\d{1,2}\/\d{1,2}/.test(ts[i + 1] ?? ''))) continue;
    if ((t === 'parcelado' || t === 'parcelada' || t === 'dividido' || t === 'dividida') && ts[i + 1] === 'em') {
      const n = numero(ts, i + 2);
      if (n && Number.isInteger(n.v)) {
        out.push(`${n.v}x`);
        i = n.j - 1 + (VEZES.includes(ts[n.j]) ? 1 : 0);
        continue;
      }
    }
    // "segunda", "na sexta passada": último dia da semana até hoje
    const sem = SEMANA.indexOf(t);
    if (sem >= 0 && (['na', 'no', 'dia', 'nessa', 'nesse', 'ultima', 'ultimo'].includes(ts[i - 1]) || ['passada', 'passado'].includes(ts[i + 1]) || orig[i].includes('-'))) {
      const h = parse(hoje);
      out.push(iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - ((h.getDay() - sem + 7) % 7) - (['passada', 'passado'].includes(ts[i + 1]) && h.getDay() === sem ? 7 : 0))).split('-').reverse().join('/'));
      if (['passada', 'passado'].includes(ts[i + 1])) i++;
      continue;
    }
    // "dia 5", "dia cinco de outubro", "5 de outubro"
    const ini = t === 'dia' ? i + 1 : i;
    const d = numero(ts, ini);
    if (d && Number.isInteger(d.v) && d.v >= 1 && d.v <= 31) {
      const mes = ts[d.j] === 'de' ? MESES.indexOf(ts[d.j + 1]) : -1;
      if (mes >= 0 || t === 'dia') {
        let fim = mes >= 0 ? d.j + 2 : d.j;
        let ano = '';
        const a = mes >= 0 && ts[fim] === 'de' ? numero(ts, fim + 1) : null;
        if (a && a.v >= 2000 && a.v < 2100) [ano, fim] = [`/${a.v}`, a.j];
        out.push(`${dd(d.v)}/${dd(mes >= 0 ? mes + 1 : parse(hoje).getMonth() + 1)}${ano}`);
        i = fim - 1;
        continue;
      }
    }
    const n = numero(ts, i);
    if (!n) {
      out.push(orig[i]);
      continue;
    }
    let j = n.j, v = n.v, moeda = t.startsWith('r$') || ts[i - 1] === 'r$';
    if (VEZES.includes(ts[j]) && Number.isInteger(v) && !moeda) {
      out.push(`${v}x`);
      i = j;
      continue;
    }
    if (ts[j] === 'centavos' && !n.dec) {
      out.push(`r$0,${dd(v)}`);
      i = j;
      continue;
    }
    if (MOEDA.includes(ts[j])) [moeda, j] = [true, j + 1];
    // "120 reais e 50 centavos", "doze e cinquenta", "vinte com cinquenta"
    const c = !n.dec && (ts[j] === 'e' || ts[j] === 'com') ? cents(j + 1) : null;
    if (c && (moeda || ts[c.j] === 'centavos' || (ts[j] === 'e' ? c.v >= 10 : true)) && !VEZES.includes(ts[c.j])) {
      v += c.v / 100;
      j = c.j + (ts[c.j] === 'centavos' ? 1 : 0);
      moeda = true;
    }
    out.push((moeda ? 'r$' : '') + (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')));
    i = j - 1;
  }
  return out.join(' ');
}

/** chave para comparar nome falado com o cadastrado: sem espaço, acento, letra dobrada e com som parecido ("nu bank", "new bank" → nubanc; "elly" → eli; "joy" → joi) */
const chave = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '').replace(/w/g, 'u').replace(/y/g, 'i').replace(/k/g, 'c').replace(/ph/g, 'f').replace(/([a-z])\1+/g, '$1');

function distancia(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let ant = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let k = 1; k <= b.length; k++) cur[k] = Math.min(ant[k] + 1, cur[k - 1] + 1, ant[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[b.length];
}

/** Cartão/benefício citado em 1 a 3 palavras: nome inteiro > nome parecido > palavra do nome > começo > palavra parecida; empate fica o primeiro.
 * Palavra que é nome de categoria só vale com o nome inteiro ("mercado" ≠ Mercado Pago). */
function lerPagamento(ts: string[], ctx: { cartoes: Cartao[]; beneficios: Beneficio[]; categorias: Categoria[] }) {
  // empate (dois "Nubank ..." e só "nubank" dito) fica o padrão
  const itens = [...ctx.cartoes.filter((c) => c.ativo).sort((a, b) => +!!b.padrao - +!!a.padrao).map((c) => ({ id: c.id, nome: c.nome })), ...ctx.beneficios.filter((b) => b.ativo).map((b) => ({ id: `b:${b.id}`, nome: b.nome }))]
    .map((x) => ({ ...x, kn: chave(x.nome), palavras: normalizar(x.nome).split(/\s+/).map(chave).filter(Boolean) }));
  const cats = new Set(ctx.categorias.map((c) => chave(c.nome)));
  let melhor: { pg: string; i: number; j: number; nota: number } | null = null;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] === 'final' && /^\d{4}$/.test(ts[i + 1] ?? '')) {
      const c = ctx.cartoes.find((x) => x.ativo && x.final === ts[i + 1]);
      if (c && (!melhor || melhor.nota < 7)) melhor = { pg: c.id, i, j: i + 2, nota: 7 };
      continue;
    }
    if (DEBITO.includes(ts[i])) {
      if (!melhor || melhor.nota < 6) melhor = { pg: 'debito', i, j: i + 1, nota: 6 };
      continue;
    }
    if (LIGA.includes(ts[i]) || /^[\d#]/.test(ts[i])) continue;
    for (let k = Math.min(3, ts.length - i); k >= 1; k--) {
      const w = ts.slice(i, i + k);
      if (w.some((t) => /^\d/.test(t) && t.length > 1) || (k > 1 && LIGA.includes(w[k - 1]))) continue;
      const kw = chave(w.join(''));
      if (!kw) continue;
      for (const x of itens) {
        const nota = kw === x.kn ? 6
          : kw.length >= 5 && distancia(kw, x.kn) <= 1 ? 5
          : cats.has(kw) ? 0
          : kw.length >= 2 && x.palavras.includes(kw) ? 4
          : k === 1 && kw.length >= 3 && x.kn.startsWith(kw) ? 2
          : kw.length >= 3 && x.palavras.some((p) => p.length >= Math.max(4, kw.length) && distancia(kw, p) <= 1) ? 1 : 0;
        if (nota && (!melhor || nota > melhor.nota)) melhor = { pg: x.id, i, j: i + k, nota };
      }
    }
  }
  return melhor;
}

/** tira ligações e verbos das pontas da descrição */
function aparar(p: string[]) {
  const sai = (t: string) => LIGA.includes(normalizar(t)) || VERBOS.includes(normalizar(t));
  while (p.length && sai(p[0])) p.shift();
  while (p.length && sai(p[p.length - 1])) p.pop();
  return p;
}

/** "mercado 120,50 nubank ontem #casa", "tv 1200 10x inter" ou falado em qualquer ordem ("gastei cento e vinte no cartão do nubank com mercado ontem") */
export function lerTexto(texto: string, ctx: { cartoes: Cartao[]; beneficios: Beneficio[]; categorias: Categoria[]; hoje: string }): TextoLido {
  const r: TextoLido = { valor: null, descricao: '', data: null, pagamento: null, categoria_id: null, parcelas: null, tags: [] };
  const orig = prepararFala(texto, ctx.hoje).split(/\s+/).filter(Boolean);
  const ts = orig.map(normalizar);
  const ehValor = (t: string) => /^(r\$)?(\d{1,3}(\.\d{3})+|\d+)([.,]\d{1,2})?$/.test(t);
  // valor dito com "reais"/R$ vence número solto ("2 pizzas r$50")
  const forte = ts.findIndex((t, k) => ehValor(t) && (t.startsWith('r$') || ts[k - 1] === 'r$'));
  const resto: string[] = [];
  /** palavras que ligavam ao que foi lido saem ("uber no" nubank) */
  const ligou = () => { while (resto.length && LIGA.includes(normalizar(resto[resto.length - 1]))) resto.pop(); };
  const pg = lerPagamento(ts, ctx);
  if (pg) r.pagamento = pg.pg;
  let credito = false;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i], tk = orig[i];
    if (t === 'r$') continue;
    // "final 1234" sem cartão com esse final: não vira valor nem descrição
    if (t === 'final' && /^\d{4}$/.test(ts[i + 1] ?? '') && !(pg && i === pg.i)) {
      i++;
      continue;
    }
    if (tk.startsWith('#') && tk.length > 1) {
      r.tags.push(t.slice(1));
      continue;
    }
    if (r.valor == null && ehValor(t) && (forte < 0 || forte === i)) {
      r.valor = parseValor(t);
      ligou();
      continue;
    }
    const px = t.match(/^(\d{1,3})x$/);
    if (px && +px[1] >= 2 && !r.parcelas) {
      r.parcelas = +px[1];
      ligou();
      continue;
    }
    const d = r.data ? null : lerData(t, ctx.hoje);
    if (d) {
      r.data = d;
      ligou();
      continue;
    }
    if (pg && i === pg.i) {
      ligou();
      i = pg.j - 1;
      continue;
    }
    if (t === 'credito' || t === 'cartao') credito = true;
    resto.push(tk);
  }
  // "no crédito"/"no cartão" sem nome: cartão padrão ou o único ativo
  if (!r.pagamento && credito) {
    const ativos = ctx.cartoes.filter((c) => c.ativo);
    r.pagamento = (ativos.find((c) => c.padrao) ?? (ativos.length === 1 ? ativos[0] : null))?.id ?? null;
  }
  const desc = aparar(resto).join(' ');
  r.descricao = desc.charAt(0).toUpperCase() + desc.slice(1);
  const nd = normalizar(desc);
  const palavras = nd.split(/\s+/);
  r.categoria_id = ctx.categorias.find((c) => c.tipo === 'gasto' && (normalizar(c.nome) === nd || palavras.includes(normalizar(c.nome))))?.id ?? null;
  return r;
}

/** "viagem, #praia reforma" → ['viagem', 'praia', 'reforma'] */
export const lerTags = (s: string) => [...new Set(s.split(/[\s,;]+/).map((t) => normalizar(t.replace(/^#+/, ''))).filter(Boolean))];

/** "IFOOD *IFOOD" → "Ifood", "MP*MERCADOLIVRE" → "Mercadolivre"; tudo maiúsculo vira Título */
function limparLoja(s: string) {
  let t = s.trim().replace(/\s+/g, ' ');
  const ast = t.indexOf('*');
  if (ast >= 0) t = ast <= 3 ? t.slice(ast + 1) : t.slice(0, ast);
  t = t.replace(/\.com(\.br)?\b/i, '').replace(/[\s.,;:*-]+$/, '').trim();
  if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  return t;
}

const BANCOS = ['nubank', 'itau', 'inter', 'c6', 'santander', 'bradesco', 'caixa', 'picpay', 'neon', 'next', 'sicredi', 'sicoob', 'xp', 'btg'];

/**
 * Notificação/SMS do banco ("Compra de R$ 50,00 APROVADA em MERCADO X para o cartão com final 1234")
 * vira texto rápido: "r$50,00 14/11 Mercado X final 1234 pix". Sem valor em R$ ou sem loja/destino: null.
 * O final só vai quando algum cartão tem esse final cadastrado; senão vai o nome do banco ("nubank") se algum cartão o tiver no nome.
 */
export function lerNotificacao(texto: string, cartoes: Pick<Cartao, 'nome' | 'final' | 'ativo'>[] = []) {
  const t = texto.replace(/\s+/g, ' ').trim();
  const n = normalizar(t);
  if (!/(compra|pix|transfer|pagamento|aprovad|debito|credito)/.test(n)) return null;
  const v = t.match(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)/i);
  if (!v) return null;
  const pix = /\bpix\b|transfer[eê]ncia (?:enviada|realizada)|voc[eê] (?:enviou|transferiu)/i.test(t);
  const debito = /d[eé]bito/i.test(t) && !/cr[eé]dito/i.test(t);
  const fim = String.raw`(?=\s+(?:para o|para seu|no seu|no cart|com o cart|com cart|cart[aã]o|final|em \d|\d{1,2}\/\d{1,2}|\d{1,2}[:h]\d{2}|no dia|dia \d|[aà]s \d|via|cpf|cnpj|chave|valor|foi|aprovad)|[.,;!]\s|[.;!]?$)`;
  let loja = '';
  if (pix) loja = t.match(new RegExp(String.raw`\b(?:para|p/|destinat[aá]rio:?|favorecido:?)\s+(?!o cart|seu cart|voc)(.+?)` + fim, 'i'))?.[1] ?? '';
  if (!loja) {
    for (const m of t.matchAll(new RegExp(String.raw`\b(?:em|no estabelecimento|estabelecimento:?|local:?|loja:?)\s+(.+?)` + fim, 'gi'))) {
      if (!/^\d/.test(m[1]) && !/^(?:seu |sua |nosso |\d)/i.test(m[1])) {
        loja = m[1];
        break;
      }
    }
  }
  // Itaú: "... em 14/11 às 10:20, MERCADO X."
  if (!loja) loja = t.match(/\d{1,2}[:h]\d{2},?\s+(\p{L}[^.;!]*?)\s*(?:[.;!]|$)/u)?.[1] ?? '';
  loja = limparLoja(loja.replace(/^(?:o|a)\s+/i, ''));
  if (!loja) return null;
  const data = t.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/)?.[1];
  const fn = t.match(/final\s*(\d{4})/i)?.[1];
  const final = fn && cartoes.some((c) => c.ativo && c.final === fn) ? fn : undefined;
  const banco = final ? undefined : BANCOS.find((b) => new RegExp(String.raw`\b${b}\b`).test(n) && cartoes.some((c) => c.ativo && normalizar(c.nome).includes(b)));
  return ['r$' + v[1], data, loja, final && `final ${final}`, banco, pix ? 'pix' : debito ? 'debito' : ''].filter(Boolean).join(' ');
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ROTULOS = /^(?:para|destino|destinat[aá]rio|favorecido|recebedor|estabelecimento|nome|quem recebeu)\b\s*:?\s*(.*)$/i;

/**
 * Comprovante compartilhado (Pix, transferência, compra): vira texto do lançamento rápido, valor e data primeiro.
 * Sem "R$ valor" no texto devolve null (usa o texto como veio).
 */
export function lerComprovante(texto: string) {
  const valor = texto.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i)?.[1];
  if (!valor) return null;
  let data = texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1] ?? '';
  const m = !data && normalizar(texto).match(/\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+)?(\d{4})\b/);
  if (m) data = `${m[1].padStart(2, '0')}/${String(MESES_ABREV.indexOf(m[2]) + 1).padStart(2, '0')}/${m[3]}`;
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let desc = '';
  for (let i = 0; i < linhas.length && !desc; i++) {
    const r = linhas[i].match(ROTULOS);
    if (r) desc = r[1] || (linhas[i + 1] && !ROTULOS.test(linhas[i + 1]) ? linhas[i + 1] : '');
  }
  desc = desc.replace(/R\$.*$/, '').replace(/[*#]/g, ' ').replace(/\s+/g, ' ').trim();
  return [valor, data, /\bpix\b/i.test(texto) ? 'pix' : '', desc].filter(Boolean).join(' ');
}

/**
 * Texto de foto de comprovante ou cupom fiscal → "valor data loja" para o lançamento rápido.
 * Pix/transferência vai pelo lerComprovante; cupom pela linha do total e pela primeira linha com nome.
 */
export function lerCupom(texto: string) {
  if (/\bpix\b|transfer|comprovante/i.test(texto)) {
    const pix = lerComprovante(texto);
    if (pix) return pix;
  }
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const num = /(\d{1,3}(?:\.\d{3})*,\d{2})/;
  let valor = '';
  linhas.forEach((l, i) => {
    const n = normalizar(l);
    if (!/total|a pagar|valor pago/.test(n) || /sub ?total|troco|desconto|tribut|imposto|itens/.test(n)) return;
    // OCR às vezes joga o número na linha de baixo
    const m = l.match(num) ?? linhas[i + 1]?.match(num);
    if (m) valor = m[1];
  });
  if (!valor) return lerComprovante(texto);
  const d = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/);
  const data = d ? `${d[1]}/${d[2]}/${d[3].length === 2 ? '20' + d[3] : d[3]}` : '';
  const loja = (linhas.find((l) => /[a-z]{3}/i.test(l) && !/cnpj|cpf|cupom|nota|danfe|documento|extrato|endere|^rua|^av/.test(normalizar(l))) ?? '')
    .replace(/[^\p{L}\p{N}\s&.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return [valor, data, loja].filter(Boolean).join(' ');
}

/** Regra cujo termo aparece no texto; o termo mais longo vence */
export function regraPara<T extends { termo: string }>(texto: string, regras: T[]) {
  const t = normalizar(texto);
  let melhor: T | undefined;
  let tam = 0;
  for (const r of regras) {
    const k = normalizar(r.termo);
    if (k.length > tam && t.includes(k)) {
      melhor = r;
      tam = k.length;
    }
  }
  return melhor;
}
