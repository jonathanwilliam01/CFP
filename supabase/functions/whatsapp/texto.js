// Gerado por scripts/gerar-texto-fn.mjs a partir de src/app/core/texto.ts. Não editar.

// src/app/core/datas.ts
var pad = (n) => String(n).padStart(2, "0");
var iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
var parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
function addDias(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// src/app/core/valor.ts
function parseValor(s) {
  if (typeof s === "number") return s;
  if (!s) return 0;
  let t = s.replace(/[^\d,.-]/g, "");
  if (t.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// src/app/core/texto.ts
var normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
var DEBITO = ["pix", "debito", "dinheiro", "especie", "boleto"];
var LIGA = [
  "no",
  "na",
  "nos",
  "nas",
  "num",
  "numa",
  "com",
  "pelo",
  "pela",
  "via",
  "em",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "o",
  "a",
  "os",
  "as",
  "ao",
  "um",
  "uma",
  "pro",
  "pra",
  "para",
  "por",
  "e",
  "cartao",
  "credito",
  "valor",
  "total"
];
var VERBOS = [
  "gastei",
  "gastamos",
  "paguei",
  "pagamos",
  "comprei",
  "compramos",
  "recebi",
  "recebemos",
  "ganhei",
  "lanca",
  "lancar",
  "lance",
  "anota",
  "anotar",
  "adiciona",
  "adicionar",
  "coloca",
  "colocar",
  "registra",
  "registrar",
  "foi",
  "foram",
  "deu",
  "custou",
  "saiu",
  "gasto",
  "novo",
  "nova"
];
var MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
var SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
var UNI = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19
};
var DEZ = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
var CEM = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900
};
var MOEDA = ["reais", "real", "conto", "contos", "pila", "pilas"];
var VEZES = ["vezes", "vez", "parcelas", "parcela", "x"];
var peso = (t) => t == null ? 0 : t in CEM ? 3 : t in DEZ ? 2 : t in UNI ? 1 : 0;
var valorDe = (t) => CEM[t] ?? DEZ[t] ?? UNI[t];
function grupo(ts, i) {
  let v = 0, j = i, ordem = 4;
  while (peso(ts[j]) && peso(ts[j]) < ordem) {
    ordem = peso(ts[j]);
    v += valorDe(ts[j++]);
    if (ts[j] === "e" && peso(ts[j + 1]) && peso(ts[j + 1]) < ordem) j++;
    else break;
  }
  return j > i ? { v, j } : null;
}
function numero(ts, i) {
  const t = ts[i];
  if (t == null) return null;
  if (/^(\d{1,3}(\.\d{3})+|\d+)([.,]\d{1,2})?$/.test(t)) {
    const v2 = parseValor(t);
    if (ts[i + 1] === "mil" && Number.isInteger(v2)) return { v: v2 * 1e3, j: i + 2, dec: false };
    return { v: v2, j: i + 1, dec: /[.,]\d{1,2}$/.test(t) };
  }
  let g = grupo(ts, i);
  let v = g?.v ?? 0, j = g?.j ?? i;
  if (ts[j] === "mil") {
    v = (g ? v : 1) * 1e3;
    j++;
    const r = ts[j] === "e" ? grupo(ts, j + 1) : grupo(ts, j);
    if (r) [v, j] = [v + r.v, r.j];
  }
  if (j === i) return null;
  if (j === i + 1 && (t === "um" || t === "uma") && !MOEDA.includes(ts[j]) && !VEZES.includes(ts[j])) return null;
  return { v, j, dec: false };
}
function lerData(t, hoje) {
  if (t === "hoje") return hoje;
  if (t === "ontem") return addDias(hoje, -1);
  if (t === "anteontem") return addDias(hoje, -2);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const ano = m[3] ? m[3].length === 2 ? 2e3 + +m[3] : +m[3] : parse(hoje).getFullYear();
  const d = new Date(ano, +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? iso(d) : null;
}
var dd = (n) => String(n).padStart(2, "0");
function prepararFala(texto, hoje) {
  const orig = texto.trim().split(/\s+/).map((t) => t.replace(/[!?;:.,]+$/, "")).filter(Boolean);
  const ts = orig.map((t) => normalizar(t).replace(/-feira$/, ""));
  const out = [];
  const cents = (k) => {
    const c = numero(ts, k);
    return c && !c.dec && c.v >= 1 && c.v <= 99 ? c : null;
  };
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t === "a" && ts[i + 1] === "vista") {
      i++;
      continue;
    }
    if (t === "avista" || t === "feira" || t === "dia" && /^\d{1,2}\/\d{1,2}/.test(ts[i + 1] ?? "")) continue;
    if ((t === "parcelado" || t === "parcelada" || t === "dividido" || t === "dividida") && ts[i + 1] === "em") {
      const n2 = numero(ts, i + 2);
      if (n2 && Number.isInteger(n2.v)) {
        out.push(`${n2.v}x`);
        i = n2.j - 1 + (VEZES.includes(ts[n2.j]) ? 1 : 0);
        continue;
      }
    }
    const sem = SEMANA.indexOf(t);
    if (sem >= 0 && (["na", "no", "dia", "nessa", "nesse", "ultima", "ultimo"].includes(ts[i - 1]) || ["passada", "passado"].includes(ts[i + 1]) || orig[i].includes("-"))) {
      const h = parse(hoje);
      out.push(iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - (h.getDay() - sem + 7) % 7 - (["passada", "passado"].includes(ts[i + 1]) && h.getDay() === sem ? 7 : 0))).split("-").reverse().join("/"));
      if (["passada", "passado"].includes(ts[i + 1])) i++;
      continue;
    }
    const ini = t === "dia" ? i + 1 : i;
    const d = numero(ts, ini);
    if (d && Number.isInteger(d.v) && d.v >= 1 && d.v <= 31) {
      const mes = ts[d.j] === "de" ? MESES.indexOf(ts[d.j + 1]) : -1;
      if (mes >= 0 || t === "dia") {
        let fim = mes >= 0 ? d.j + 2 : d.j;
        let ano = "";
        const a = mes >= 0 && ts[fim] === "de" ? numero(ts, fim + 1) : null;
        if (a && a.v >= 2e3 && a.v < 2100) [ano, fim] = [`/${a.v}`, a.j];
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
    let j = n.j, v = n.v, moeda = t.startsWith("r$") || ts[i - 1] === "r$";
    if (VEZES.includes(ts[j]) && Number.isInteger(v) && !moeda) {
      out.push(`${v}x`);
      i = j;
      continue;
    }
    if (ts[j] === "centavos" && !n.dec) {
      out.push(`r$0,${dd(v)}`);
      i = j;
      continue;
    }
    if (MOEDA.includes(ts[j])) [moeda, j] = [true, j + 1];
    const c = !n.dec && (ts[j] === "e" || ts[j] === "com") ? cents(j + 1) : null;
    if (c && (moeda || ts[c.j] === "centavos" || (ts[j] === "e" ? c.v >= 10 : true)) && !VEZES.includes(ts[c.j])) {
      v += c.v / 100;
      j = c.j + (ts[c.j] === "centavos" ? 1 : 0);
      moeda = true;
    }
    out.push((moeda ? "r$" : "") + (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")));
    i = j - 1;
  }
  return out.join(" ");
}
var chave = (s) => normalizar(s).replace(/[^a-z0-9]/g, "").replace(/w/g, "u").replace(/y/g, "i").replace(/k/g, "c").replace(/ph/g, "f").replace(/([a-z])\1+/g, "$1");
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let ant = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let k = 1; k <= b.length; k++) cur[k] = Math.min(ant[k] + 1, cur[k - 1] + 1, ant[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[b.length];
}
function lerPagamento(ts, ctx) {
  const itens = [...ctx.cartoes.filter((c) => c.ativo).sort((a, b) => +!!b.padrao - +!!a.padrao).map((c) => ({ id: c.id, nome: c.nome })), ...ctx.beneficios.filter((b) => b.ativo).map((b) => ({ id: `b:${b.id}`, nome: b.nome }))].map((x) => ({ ...x, kn: chave(x.nome), palavras: normalizar(x.nome).split(/\s+/).map(chave).filter(Boolean) }));
  const cats = new Set(ctx.categorias.map((c) => chave(c.nome)));
  let melhor = null;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] === "final" && /^\d{4}$/.test(ts[i + 1] ?? "")) {
      const c = ctx.cartoes.find((x) => x.ativo && x.final === ts[i + 1]);
      if (c && (!melhor || melhor.nota < 7)) melhor = { pg: c.id, i, j: i + 2, nota: 7 };
      continue;
    }
    if (DEBITO.includes(ts[i])) {
      if (!melhor || melhor.nota < 6) melhor = { pg: "debito", i, j: i + 1, nota: 6 };
      continue;
    }
    if (LIGA.includes(ts[i]) || /^[\d#]/.test(ts[i])) continue;
    for (let k = Math.min(3, ts.length - i); k >= 1; k--) {
      const w = ts.slice(i, i + k);
      if (w.some((t) => /^\d/.test(t) && t.length > 1) || k > 1 && LIGA.includes(w[k - 1])) continue;
      const kw = chave(w.join(""));
      if (!kw) continue;
      for (const x of itens) {
        const nota = kw === x.kn ? 6 : kw.length >= 5 && distancia(kw, x.kn) <= 1 ? 5 : cats.has(kw) ? 0 : kw.length >= 2 && x.palavras.includes(kw) ? 4 : k === 1 && kw.length >= 3 && x.kn.startsWith(kw) ? 2 : kw.length >= 3 && x.palavras.some((p) => p.length >= Math.max(4, kw.length) && distancia(kw, p) <= 1) ? 1 : 0;
        if (nota && (!melhor || nota > melhor.nota)) melhor = { pg: x.id, i, j: i + k, nota };
      }
    }
  }
  return melhor;
}
function aparar(p) {
  const sai = (t) => LIGA.includes(normalizar(t)) || VERBOS.includes(normalizar(t));
  while (p.length && sai(p[0])) p.shift();
  while (p.length && sai(p[p.length - 1])) p.pop();
  return p;
}
function lerTexto(texto, ctx) {
  const r = { valor: null, descricao: "", data: null, pagamento: null, categoria_id: null, parcelas: null, tags: [] };
  const orig = prepararFala(texto, ctx.hoje).split(/\s+/).filter(Boolean);
  const ts = orig.map(normalizar);
  const ehValor = (t) => /^(r\$)?(\d{1,3}(\.\d{3})+|\d+)([.,]\d{1,2})?$/.test(t);
  const forte = ts.findIndex((t, k) => ehValor(t) && (t.startsWith("r$") || ts[k - 1] === "r$"));
  const resto = [];
  const ligou = () => {
    while (resto.length && LIGA.includes(normalizar(resto[resto.length - 1]))) resto.pop();
  };
  const pg = lerPagamento(ts, ctx);
  if (pg) r.pagamento = pg.pg;
  let credito = false;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i], tk = orig[i];
    if (t === "r$") continue;
    if (t === "final" && /^\d{4}$/.test(ts[i + 1] ?? "") && !(pg && i === pg.i)) {
      i++;
      continue;
    }
    if (tk.startsWith("#") && tk.length > 1) {
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
    if (t === "credito" || t === "cartao") credito = true;
    resto.push(tk);
  }
  if (!r.pagamento && credito) {
    const ativos = ctx.cartoes.filter((c) => c.ativo);
    r.pagamento = (ativos.find((c) => c.padrao) ?? (ativos.length === 1 ? ativos[0] : null))?.id ?? null;
  }
  const desc = aparar(resto).join(" ");
  r.descricao = desc.charAt(0).toUpperCase() + desc.slice(1);
  const nd = normalizar(desc);
  const palavras = nd.split(/\s+/);
  r.categoria_id = ctx.categorias.find((c) => c.tipo === "gasto" && (normalizar(c.nome) === nd || palavras.includes(normalizar(c.nome))))?.id ?? null;
  return r;
}
var lerTags = (s) => [...new Set(s.split(/[\s,;]+/).map((t) => normalizar(t.replace(/^#+/, ""))).filter(Boolean))];
function limparLoja(s) {
  let t = s.trim().replace(/\s+/g, " ");
  const ast = t.indexOf("*");
  if (ast >= 0) t = ast <= 3 ? t.slice(ast + 1) : t.slice(0, ast);
  t = t.replace(/\.com(\.br)?\b/i, "").replace(/[\s.,;:*-]+$/, "").trim();
  if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  return t;
}
var BANCOS = ["nubank", "itau", "inter", "c6", "santander", "bradesco", "caixa", "picpay", "neon", "next", "sicredi", "sicoob", "xp", "btg"];
function lerNotificacao(texto, cartoes = []) {
  const t = texto.replace(/\s+/g, " ").trim();
  const n = normalizar(t);
  if (!/(compra|pix|transfer|pagamento|aprovad|debito|credito)/.test(n)) return null;
  const v = t.match(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)/i);
  if (!v) return null;
  const pix = /\bpix\b|transfer[eê]ncia (?:enviada|realizada)|voc[eê] (?:enviou|transferiu)/i.test(t);
  const debito = /d[eé]bito/i.test(t) && !/cr[eé]dito/i.test(t);
  const fim = String.raw`(?=\s+(?:para o|para seu|no seu|no cart|com o cart|com cart|cart[aã]o|final|em \d|\d{1,2}\/\d{1,2}|\d{1,2}[:h]\d{2}|no dia|dia \d|[aà]s \d|via|cpf|cnpj|chave|valor|foi|aprovad)|[.,;!]\s|[.;!]?$)`;
  let loja = "";
  if (pix) loja = t.match(new RegExp(String.raw`\b(?:para|p/|destinat[aá]rio:?|favorecido:?)\s+(?!o cart|seu cart|voc)(.+?)` + fim, "i"))?.[1] ?? "";
  if (!loja) {
    for (const m of t.matchAll(new RegExp(String.raw`\b(?:em|no estabelecimento|estabelecimento:?|local:?|loja:?)\s+(.+?)` + fim, "gi"))) {
      if (!/^\d/.test(m[1]) && !/^(?:seu |sua |nosso |\d)/i.test(m[1])) {
        loja = m[1];
        break;
      }
    }
  }
  if (!loja) loja = t.match(/\d{1,2}[:h]\d{2},?\s+(\p{L}[^.;!]*?)\s*(?:[.;!]|$)/u)?.[1] ?? "";
  loja = limparLoja(loja.replace(/^(?:o|a)\s+/i, ""));
  if (!loja) return null;
  const data = t.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/)?.[1];
  const fn = t.match(/final\s*(\d{4})/i)?.[1];
  const final = fn && cartoes.some((c) => c.ativo && c.final === fn) ? fn : void 0;
  const banco = final ? void 0 : BANCOS.find((b) => new RegExp(String.raw`\b${b}\b`).test(n) && cartoes.some((c) => c.ativo && normalizar(c.nome).includes(b)));
  return ["r$" + v[1], data, loja, final && `final ${final}`, banco, pix ? "pix" : debito ? "debito" : ""].filter(Boolean).join(" ");
}
var MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
var ROTULOS = /^(?:para|destino|destinat[aá]rio|favorecido|recebedor|estabelecimento|nome|quem recebeu)\b\s*:?\s*(.*)$/i;
function lerComprovante(texto) {
  const valor = texto.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i)?.[1];
  if (!valor) return null;
  let data = texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1] ?? "";
  const m = !data && normalizar(texto).match(/\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+)?(\d{4})\b/);
  if (m) data = `${m[1].padStart(2, "0")}/${String(MESES_ABREV.indexOf(m[2]) + 1).padStart(2, "0")}/${m[3]}`;
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let desc = "";
  for (let i = 0; i < linhas.length && !desc; i++) {
    const r = linhas[i].match(ROTULOS);
    if (r) desc = r[1] || (linhas[i + 1] && !ROTULOS.test(linhas[i + 1]) ? linhas[i + 1] : "");
  }
  desc = desc.replace(/R\$.*$/, "").replace(/[*#]/g, " ").replace(/\s+/g, " ").trim();
  return [valor, data, /\bpix\b/i.test(texto) ? "pix" : "", desc].filter(Boolean).join(" ");
}
function lerCupom(texto) {
  if (/\bpix\b|transfer|comprovante/i.test(texto)) {
    const pix = lerComprovante(texto);
    if (pix) return pix;
  }
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const num = /(\d{1,3}(?:\.\d{3})*,\d{2})/;
  let valor = "";
  linhas.forEach((l, i) => {
    const n = normalizar(l);
    if (!/total|a pagar|valor pago/.test(n) || /sub ?total|troco|desconto|tribut|imposto|itens/.test(n)) return;
    const m = l.match(num) ?? linhas[i + 1]?.match(num);
    if (m) valor = m[1];
  });
  if (!valor) return lerComprovante(texto);
  const d = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/);
  const data = d ? `${d[1]}/${d[2]}/${d[3].length === 2 ? "20" + d[3] : d[3]}` : "";
  const loja = (linhas.find((l) => /[a-z]{3}/i.test(l) && !/cnpj|cpf|cupom|nota|danfe|documento|extrato|endere|^rua|^av/.test(normalizar(l))) ?? "").replace(/[^\p{L}\p{N}\s&.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return [valor, data, loja].filter(Boolean).join(" ");
}
function regraPara(texto, regras) {
  const t = normalizar(texto);
  let melhor;
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
export {
  lerComprovante,
  lerCupom,
  lerNotificacao,
  lerTags,
  lerTexto,
  normalizar,
  prepararFala,
  regraPara
};
