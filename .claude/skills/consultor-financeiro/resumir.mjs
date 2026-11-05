// Uso: node resumir.mjs <backup.json> [--meses 6] [--ate AAAA-MM]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const arquivo = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!arquivo) {
  console.error('Uso: node resumir.mjs <backup.json> [--meses 6] [--ate AAAA-MM]');
  process.exit(1);
}

const b = JSON.parse(readFileSync(arquivo, 'utf8'));
if (b?.app !== 'cfp' || !b.tabelas) throw new Error('Arquivo não é um backup do CFP');
const T = (n) => b.tabelas[n] ?? [];

const mesDe = (d) => d.slice(0, 7) + '-01';
const addMeses = (m, n) => {
  const [a, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(a, mm - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};
const ref = opt('--ate', b.exportado_em.slice(0, 7)) + '-01';
const N = Number(opt('--meses', 6));
const meses = Array.from({ length: N }, (_, i) => addMeses(ref, i - N + 1));
const hoje = b.exportado_em.slice(0, 10);
const parcial = (m) => m === mesDe(hoje);

const brl = (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (a, t) => (t ? ((a / t) * 100).toFixed(0) + '%' : '-');
const soma = (l, f = (x) => x.valor) => l.reduce((a, x) => a + Number(f(x) ?? 0), 0);
const media = (l) => (l.length ? soma(l, (x) => x) / l.length : 0);

const cat = new Map(T('categorias').map((c) => [c.id, c.nome]));
const nomeCat = (id) => cat.get(id) ?? 'Sem categoria';
const cartoes = T('cartoes');
const idsCartao = new Set(cartoes.map((c) => c.id));
const recs = T('recorrencias');
const pags = T('pagamentos');
const gastos = T('gastos');
const entradas = T('entradas');

// mesma regra de financas.ts:ativaNoMes
const ativa = (r, m) => r.ativo && mesDe(r.inicio) <= m && (!r.fim || mesDe(r.fim) >= m);
const pagoRec = (r, m) => pags.find((p) => p.tipo === 'recorrencia' && p.ref_id === r.id && p.mes === m);
// competência: cartão pela fatura, resto pela data
// cartão com paga_mes_anterior: a fatura de M+1 sai do dinheiro de M (financas.ts:faturaDoMes)
const pma = new Map(cartoes.map((c) => [c.id, c.paga_mes_anterior]));
const compet = (g) => (g.forma === 'cartao' && g.fatura_mes ? addMeses(g.fatura_mes, pma.get(g.cartao_id) ? -1 : 0) : mesDe(g.data));
// mês da conta fixa que sai do dinheiro de M
const mesConta = (r, m) => addMeses(m, (idsCartao.has(r.cartao_id) ? pma.get(r.cartao_id) : r.paga_mes_anterior) ? 1 : 0);

function mesResumo(m) {
  const gm = gastos.filter((g) => compet(g) === m);
  const debito = soma(gm.filter((g) => g.forma === 'debito'));
  const cartao = soma(gm.filter((g) => g.forma === 'cartao'));
  const benef = soma(gm.filter((g) => g.forma === 'beneficio'));
  const fixas = recs.filter((r) => r.tipo === 'conta' && ativa(r, mesConta(r, m)));
  const valorFixa = (r) => pagoRec(r, mesConta(r, m))?.valor ?? r.valor;
  const fixasCartao = soma(fixas.filter((r) => idsCartao.has(r.cartao_id)), valorFixa);
  const fixasBenef = soma(fixas.filter((r) => !idsCartao.has(r.cartao_id) && r.beneficio_id), valorFixa);
  const fixasDinheiro = soma(fixas.filter((r) => !idsCartao.has(r.cartao_id) && !r.beneficio_id), valorFixa);
  const entFixas = soma(recs.filter((r) => r.tipo === 'entrada' && ativa(r, m)), (r) => pagoRec(r, m)?.valor ?? r.valor);
  const entAvulsas = soma(entradas.filter((e) => mesDe(e.data) === m));
  const parcelas = soma(gm.filter((g) => g.parcelamento_id && g.parcela != null));
  const ent = entFixas + entAvulsas;
  const sai = debito + cartao + fixasCartao + fixasDinheiro;
  return { m, ent, entFixas, entAvulsas, sai, debito, cartao, fixasCartao, fixasDinheiro, fixasBenef, benef, parcelas, saldo: ent - sai, gm, fixas, valorFixa };
}

const R = meses.map(mesResumo);
const completos = R.filter((r) => !parcial(r.m));
const base = completos.length ? completos : R;
const out = [];
const p = (s = '') => out.push(s);
const mesTxt = (m) => m.slice(0, 7) + (parcial(m) ? '*' : '');

p(`# Resumo financeiro: ${b.carteira}`);
p(`Backup de ${hoje}. Meses: ${mesTxt(meses[0])} a ${mesTxt(meses.at(-1))}. * = mês em andamento (fora das médias).`);
p('Valores aproximados: competência = fatura (cartão) ou data (débito); fixas sem pagamento usam o valor cadastrado.');

p('\n## Fluxo mensal (dinheiro, sem benefícios)');
p('| Mês | Entradas | Saídas | Saldo | Poupança | À vista | Cartão (+fixas) | Fixas | Parcelas | Benefício usado |');
p('|---|---|---|---|---|---|---|---|---|---|');
for (const r of R)
  p(`| ${mesTxt(r.m)} | ${brl(r.ent)} | ${brl(r.sai)} | ${brl(r.saldo)} | ${pct(r.saldo, r.ent)} | ${brl(r.debito)} | ${brl(r.cartao + r.fixasCartao)} | ${brl(r.fixasDinheiro)} | ${brl(r.parcelas)} | ${brl(r.benef + r.fixasBenef)} |`);
const mEnt = media(base.map((r) => r.ent));
const mSai = media(base.map((r) => r.sai));
p(`\nMédia (${base.length} meses): entradas ${brl(mEnt)}, saídas ${brl(mSai)}, sobra ${brl(mEnt - mSai)} (${pct(mEnt - mSai, mEnt)}).`);

p('\n## Gastos por categoria (média mensal, inclui fixas; sem benefício)');
const porCat = new Map();
for (const r of base) {
  const add = (k, v) => porCat.set(k, (porCat.get(k) ?? Array(base.length).fill(0)).map((x, i) => (base[i] === r ? x + v : x)));
  for (const g of r.gm.filter((g) => g.forma !== 'beneficio')) {
    add(nomeCat(g.categoria_id), Number(g.valor));
    if (g.parcelamento_id && g.parcela != null) add('§' + nomeCat(g.categoria_id), Number(g.valor));
  }
  for (const f of r.fixas.filter((f) => !f.beneficio_id)) add(nomeCat(f.categoria_id), r.valorFixa(f));
}
const zero = Array(base.length).fill(0);
const linhasCat = [...porCat.entries()]
  .filter(([n]) => !n.startsWith('§'))
  .map(([n, v]) => ({ n, med: media(v), ult: v.at(-1), min: Math.min(...v), max: Math.max(...v), parc: porCat.get('§' + n) ?? zero }))
  .sort((a, b) => b.med - a.med);
p('Parcelas = parte da categoria que é parcela (alta de categoria por parcela não é tendência de consumo).');
p('| Categoria | Média | % saídas | Último mês | Mín | Máx | Parcelas (média / último) |');
p('|---|---|---|---|---|---|---|');
for (const c of linhasCat)
  p(`| ${c.n} | ${brl(c.med)} | ${pct(c.med, mSai)} | ${brl(c.ult)} | ${brl(c.min)} | ${brl(c.max)} | ${media(c.parc) ? `${brl(media(c.parc))} / ${brl(c.parc.at(-1))}` : '-'} |`);

p('\n## Maiores estabelecimentos/descrições (período, sem parcelas)');
const porDesc = new Map();
for (const r of base)
  for (const g of r.gm.filter((g) => !g.parcelamento_id && g.forma !== 'beneficio')) {
    const k = g.descricao.trim().toLowerCase();
    const a = porDesc.get(k) ?? { d: g.descricao, v: 0, n: 0 };
    porDesc.set(k, { ...a, v: a.v + Number(g.valor), n: a.n + 1 });
  }
for (const d of [...porDesc.values()].sort((a, b) => b.v - a.v).slice(0, 15)) p(`- ${d.d}: ${brl(d.v)} em ${d.n}x`);

p('\n## Contas fixas ativas hoje');
const fixasHoje = recs.filter((r) => ativa(r, mesDe(hoje)));
for (const tipo of ['entrada', 'conta']) {
  const l = fixasHoje.filter((r) => r.tipo === tipo).sort((a, b) => b.valor - a.valor);
  p(`${tipo === 'entrada' ? 'Entradas' : 'Contas'} (${brl(soma(l))}):`);
  for (const r of l)
    p(`- ${r.descricao} (${nomeCat(r.categoria_id)}): ${brl(r.valor)}${r.variavel ? ' variável' : ''}${r.cartao_id ? ' no cartão' : ''}${r.beneficio_id ? ' no benefício' : ''}${r.fim ? ` até ${r.fim.slice(0, 7)}` : ''}`);
}

p('\n## Parcelas futuras (comprometido)');
const atual = mesDe(hoje);
const futuras = gastos.filter((g) => g.parcelamento_id && g.parcela != null && compet(g) > atual);
const porMesF = new Map();
for (const g of futuras) porMesF.set(compet(g), (porMesF.get(compet(g)) ?? 0) + Number(g.valor));
const parc = new Map(T('parcelamentos').map((x) => [x.id, x]));
p(`Total a pagar: ${brl(soma(futuras))} em ${new Set(futuras.map((g) => g.parcelamento_id)).size} parcelamentos.`);
for (const [m, v] of [...porMesF.entries()].sort().slice(0, 12)) p(`- ${m.slice(0, 7)}: ${brl(v)}`);
for (const [id, l] of Map.groupBy(futuras, (g) => g.parcelamento_id)) {
  const x = parc.get(id);
  p(`  - ${x?.descricao ?? l[0].descricao}: ${l.length} restantes de ${x?.num_parcelas ?? '?'} × ${brl(x?.valor_parcela ?? l[0].valor)}`);
}

p('\n## Patrimônio e reservas');
const bancos = T('contas_bancarias').filter((c) => c.ativo);
p(`Contas bancárias: ${brl(soma(bancos, (c) => c.saldo))}`);
for (const c of bancos) p(`- ${c.nome}: ${brl(c.saldo)} (atualizado ${String(c.atualizado_em).slice(0, 10)})`);
const movs = T('cofrinho_movs');
const cofs = T('cofrinhos').map((c) => ({ ...c, guardado: soma(movs.filter((m) => m.cofrinho_id === c.id)) }));
p(`Cofrinhos: ${brl(soma(cofs, (c) => c.guardado))}`);
for (const c of cofs)
  p(`- ${c.nome}${c.emergencia ? ' [reserva de emergência]' : ''}: ${brl(c.guardado)} de ${brl(c.meta)}${c.prazo ? ` até ${c.prazo}` : ''}`);
const noPeriodo = movs.filter((m) => base.some((r) => mesDe(m.data) === r.m));
p(`Guardado em cofrinhos no período: ${brl(soma(noPeriodo))} (média ${brl(soma(noPeriodo) / base.length)}/mês) vs sobra média ${brl(mEnt - mSai)}/mês.`);
const emerg = soma(cofs.filter((c) => c.emergencia), (c) => c.guardado);
p(`Reserva de emergência cobre ${mSai ? (emerg / mSai).toFixed(1) : '-'} meses de saídas (cofrinhos marcados).`);
const pend = T('receber').filter((r) => !r.recebido_em);
if (pend.length) p(`A receber: ${brl(soma(pend))} (${pend.map((r) => `${r.descricao}${r.pessoa ? ' de ' + r.pessoa : ''}`).join('; ')})`);
// ligada a conta fixa: pagas = iniciais + pagamentos da conta (sem seguir a cadeia de reajustes)
const pagasDiv = (d) => Math.min(d.num_parcelas, d.pagas + pags.filter((x) => x.tipo === 'recorrencia' && x.ref_id === d.recorrencia_id && x.pago_em).length);
const dividas = T('dividas').map((d) => ({ ...d, pagas: pagasDiv(d), resta: (d.num_parcelas - pagasDiv(d)) * d.valor_parcela }));
if (dividas.length) {
  p(`Dívidas: ${brl(soma(dividas, (d) => d.resta))} restantes`);
  for (const d of dividas)
    p(`- ${d.descricao}${d.credor ? ` (${d.credor})` : ''}: ${d.num_parcelas - d.pagas} × ${brl(d.valor_parcela)}${d.recorrencia_id ? ' (já nas contas fixas)' : ' (SEM conta fixa: parcela fora das saídas, sobra superestimada)'}`);
}
const restos = pags.filter((x) => x.tipo === 'fatura' && Number(x.resto) > 0);
if (restos.length) p(`Faturas pagas em parte (rotativo): ${restos.map((x) => `${x.mes.slice(0, 7)} resto ${brl(x.resto)}`).join('; ')}`);

p('\n## Cartões');
for (const c of cartoes.filter((c) => c.ativo)) {
  const ult = base.map((r) => soma(r.gm.filter((g) => g.cartao_id === c.id)));
  p(`- ${c.nome}: fecha ${c.fecha_dias ? c.fecha_dias + ' dias antes do venc.' : 'dia ' + c.fechamento_dia}, vence dia ${c.vencimento_dia}, limite ${brl(c.limite)}, fatura média ${brl(media(ult))}`);
}

const bens = T('beneficios').filter((x) => x.ativo);
if (bens.length) {
  p('\n## Benefícios');
  for (const x of bens) {
    const usoMes = (r) => soma(r.gm.filter((g) => g.beneficio_id === x.id)) + soma(r.fixas.filter((f) => f.beneficio_id === x.id), r.valorFixa);
    const desde = R.filter((r) => r.m >= mesDe(x.inicio));
    const base2 = desde.filter((r) => !parcial(r.m));
    const usado = soma(desde, usoMes);
    const credito = desde.length * x.valor_mensal;
    p(`- ${x.nome}: ${brl(x.valor_mensal)}/mês${x.acumula ? ' (acumula)' : ''}, desde ${x.inicio.slice(0, 7)}; uso médio ${brl(media(base2.map(usoMes)))}/mês; no período creditado ${brl(credito)}, usado ${brl(usado)}, sobra ${brl(credito - usado)}`);
  }
}

const orcs = T('orcamentos');
if (orcs.length) {
  p('\n## Orçamentos (limite atual x média gasta)');
  for (const o of orcs) {
    const nome = o.categoria_id ? nomeCat(o.categoria_id) : 'Geral';
    const med = o.categoria_id ? linhasCat.find((c) => c.n === nome)?.med ?? 0 : mSai;
    p(`- ${nome}${o.forma ? ` (${o.forma})` : ''}: limite ${brl(o.valor)}, média ${brl(med)} (${pct(med, o.valor)})`);
  }
}

const planos = T('planos').filter((x) => x.mes >= atual);
if (planos.length) {
  p('\n## Planos futuros');
  for (const x of planos.sort((a, b) => a.mes.localeCompare(b.mes))) p(`- ${x.mes.slice(0, 7)} ${x.tipo}: ${x.descricao} ${brl(x.valor)}${x.anual ? ' (anual)' : ''}`);
}

console.log(out.join('\n'));
