// Bot do WhatsApp (Cloud API da Meta): "mercado 50 nubank", fala ditada ou notificação do banco encaminhada vira gasto.
// O telefone é ligado ao membro pelo código do app (Configurações → WhatsApp). Lança como o membro (whatsapp_lancar).
// Segredos: WA_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN, WA_APP_SECRET (opcional WA_GRAPH_VERSION).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { lerComprovante, lerNotificacao, lerTexto, normalizar, regraPara } from './texto.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const GRAPH = `https://graph.facebook.com/${Deno.env.get('WA_GRAPH_VERSION') ?? 'v23.0'}`;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const AJUDA = [
  'Mande o gasto do seu jeito, em qualquer ordem:',
  '• mercado 50 nubank',
  '• gastei 32,90 no almoço no VR ontem',
  '• tv 2 mil em 10 vezes no inter',
  '• ou encaminhe a notificação/SMS do banco',
  '',
  '*desfazer*: apaga o último lançamento',
  '*resumo*: gastos do mês',
].join('\n');

interface Msg {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // verificação do webhook no painel da Meta
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('WA_VERIFY_TOKEN');
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '') : new Response('não autorizado', { status: 403 });
  }
  const corpo = await req.text();
  if (!(await assinaturaOk(corpo, req.headers.get('x-hub-signature-256')))) return new Response('assinatura inválida', { status: 401 });
  const ev = JSON.parse(corpo);
  const msgs: Msg[] = (ev.entry ?? []).flatMap((e: { changes?: { value?: { messages?: Msg[] } }[] }) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  for (const m of msgs) {
    try {
      await tratar(m);
    } catch (e) {
      console.error('whatsapp', e);
      await responder(m.from, 'Não consegui lançar agora. Tente de novo em instantes ou lance pelo app.').catch(() => undefined);
    }
  }
  // sempre 200: senão a Meta reenvia
  return new Response('ok');
});

/** X-Hub-Signature-256 = HMAC-SHA256 do corpo com o App Secret */
async function assinaturaOk(corpo: string, assinatura: string | null) {
  const segredo = Deno.env.get('WA_APP_SECRET');
  if (!segredo || !assinatura?.startsWith('sha256=')) return false;
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hex = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', chave, enc.encode(corpo))), (b) => b.toString(16).padStart(2, '0')).join('');
  const a = assinatura.slice(7);
  if (a.length !== hex.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ hex.charCodeAt(i);
  return d === 0;
}

async function responder(para: string, texto: string) {
  const r = await fetch(`${GRAPH}/${Deno.env.get('WA_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('WA_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto } }),
  });
  if (!r.ok) console.error('whatsapp envio', r.status, await r.text());
}

const hojeBR = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function tratar(m: Msg) {
  // a Meta pode mandar a mesma mensagem mais de uma vez
  const { error: dup } = await db.from('whatsapp_msgs').insert({ id: m.id });
  if (dup) return;
  const tel = m.from;
  if (m.type !== 'text' || !m.text?.body) {
    return responder(tel, m.type === 'audio'
      ? 'Ainda não entendo áudio. Toque no microfone do teclado (ditado) e mande como texto.'
      : 'Mande o gasto em texto, ex.: mercado 50 nubank');
  }
  const texto = m.text.body.trim();

  const cod = texto.match(/^cfp\s*(\d{6})$/i);
  if (cod) {
    const { data, error } = await db.rpc('whatsapp_vincular', { p_telefone: tel, p_codigo: cod[1] });
    if (error) throw error;
    const v = (data as { nome: string | null }[])[0];
    return responder(tel, v ? `Pronto${v.nome ? ', ' + v.nome : ''}! WhatsApp conectado ao CFP.\n\n${AJUDA}` : 'Código inválido ou vencido. Gere outro no app: Configurações → WhatsApp.');
  }

  const { data: v } = await db.from('whatsapp_vinculos').select('user_id, carteira_id').eq('telefone', tel).maybeSingle();
  if (!v) return responder(tel, 'Este número não está conectado ao CFP. No app: Configurações → WhatsApp → Conectar.');
  const { data: sus } = await db.from('suspensos').select('user_id').eq('user_id', v.user_id).maybeSingle();
  if (sus) return;

  const n = normalizar(texto);
  if (['desfazer', 'desfaz', 'apagar', 'apaga', 'cancelar'].includes(n)) {
    const { data, error } = await db.rpc('whatsapp_desfazer', { p_telefone: tel });
    if (error) throw error;
    return responder(tel, data ? `Apagado: ${data}` : 'Nada para desfazer (só o último lançamento, até 1 hora depois).');
  }
  if (['ajuda', 'help', 'oi', 'ola', 'menu', '?'].includes(n)) return responder(tel, AJUDA);
  if (['resumo', 'mes', 'gastos', 'saldo'].includes(n)) return responder(tel, await resumo(v.carteira_id));
  return lancar(tel, v.carteira_id, texto);
}

async function lancar(tel: string, carteira: string, texto: string) {
  const [cartoes, beneficios, categorias, regras, recentes] = await Promise.all([
    db.from('cartoes').select('id, nome, ativo, padrao, final').eq('carteira_id', carteira),
    db.from('beneficios').select('id, nome, ativo').eq('carteira_id', carteira),
    db.from('categorias').select('id, nome, tipo').eq('carteira_id', carteira),
    db.from('regras').select('termo, categoria_id').eq('carteira_id', carteira),
    db.from('gastos').select('descricao, categoria_id, forma, cartao_id, beneficio_id').eq('carteira_id', carteira).is('parcelamento_id', null)
      .order('criado_em', { ascending: false }).limit(300),
  ]);
  for (const r of [cartoes, beneficios, categorias, recentes]) if (r.error) throw r.error;
  const cs = cartoes.data!, bs = beneficios.data!, cats = categorias.data!;
  const hoje = hojeBR();
  const t = lerTexto(lerNotificacao(texto, cs) ?? lerComprovante(texto) ?? texto, { cartoes: cs, beneficios: bs, categorias: cats, hoje });
  if (t.valor == null || t.valor <= 0) return responder(tel, `Não achei o valor. Exemplo: mercado 50 nubank\n\nMande *ajuda* para ver mais jeitos.`);

  // mesma descrição de antes: repete categoria e pagamento (como no app)
  const desc = t.descricao || cats.find((c) => c.id === t.categoria_id)?.nome || 'Gasto';
  const rec = recentes.data!.find((r) => normalizar(r.descricao) === normalizar(desc));
  const pagRec = rec?.forma === 'cartao' ? (cs.some((c) => c.ativo && c.id === rec.cartao_id) ? rec.cartao_id : null)
    : rec?.forma === 'beneficio' ? (bs.some((b) => b.ativo && b.id === rec.beneficio_id) ? `b:${rec.beneficio_id}` : null)
    : rec ? 'debito' : null;
  const pagamento: string = t.pagamento ?? pagRec ?? cs.find((c) => c.ativo && c.padrao)?.id ?? 'debito';
  const categoria = t.categoria_id ?? rec?.categoria_id ?? regraPara(desc, regras.data ?? [])?.categoria_id ?? null;
  const forma = pagamento === 'debito' ? 'debito' : pagamento.startsWith('b:') ? 'beneficio' : 'cartao';
  const parcelas = t.parcelas && forma !== 'beneficio' ? t.parcelas : null;
  const data = t.data ?? hoje;

  const { error } = await db.rpc('whatsapp_lancar', {
    p_telefone: tel,
    p: {
      descricao: desc, valor: t.valor, data, forma, parcelas, tags: t.tags, categoria_id: categoria,
      cartao_id: forma === 'cartao' ? pagamento : null, beneficio_id: forma === 'beneficio' ? pagamento.slice(2) : null,
    },
  });
  if (error) throw error;

  const onde = forma === 'debito' ? 'Pix/débito' : forma === 'beneficio' ? bs.find((b) => `b:${b.id}` === pagamento)?.nome : cs.find((c) => c.id === pagamento)?.nome;
  const valor = parcelas ? `${parcelas}x de ${brl.format(Math.round((t.valor / parcelas) * 100) / 100)} (total ${brl.format(t.valor)})` : brl.format(t.valor);
  const cat = cats.find((c) => c.id === categoria)?.nome;
  return responder(tel, [`✅ ${desc} · ${valor}`, `${onde} · ${data === hoje ? 'hoje' : dm(data)}${cat ? ' · ' + cat : ''}`, '', 'Errado? Responda *desfazer*.'].join('\n'));
}

/** Gastos do mês até hoje e as 3 categorias que mais pesaram */
async function resumo(carteira: string) {
  const hoje = hojeBR();
  const ini = hoje.slice(0, 8) + '01';
  const [g, c] = await Promise.all([
    db.from('gastos').select('valor, categoria_id').eq('carteira_id', carteira).gte('data', ini).lte('data', hoje),
    db.from('categorias').select('id, nome').eq('carteira_id', carteira),
  ]);
  if (g.error) throw g.error;
  const nomes = new Map((c.data ?? []).map((x) => [x.id, x.nome]));
  const por = new Map<string, number>();
  let total = 0;
  for (const x of g.data!) {
    total += Number(x.valor);
    const k = nomes.get(x.categoria_id) ?? 'Sem categoria';
    por.set(k, (por.get(k) ?? 0) + Number(x.valor));
  }
  if (!total) return 'Nenhum gasto lançado neste mês ainda.';
  const top = [...por].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `• ${k}: ${brl.format(v)}`);
  return [`Gastos do mês até hoje: *${brl.format(total)}*`, ...top].join('\n');
}
