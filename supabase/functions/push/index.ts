// Envia Web Push: mensagem nova do chat (trigger em mensagens), gasto lançado (triggers em gastos/parcelamentos e importação),
// contas vencendo, lembrete da noite, resumo do mês no dia 1, resumo da semana no domingo, fatura que fechou, saldos desatualizados e avisos do app (pg_cron). Suspensos nunca recebem.
// Chamada só pelo banco via push_enviar, com o segredo de push_config.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
// web-push exige mailto: ou https: no subject; e-mail puro derrubava a função
const assunto = Deno.env.get('VAPID_SUBJECT')!;
webpush.setVapidDetails(/^(mailto|https?):/.test(assunto) ? assunto : `mailto:${assunto}`,Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

interface Envio {
  usuarios: string[];
  titulo: string;
  texto: string;
  tag: string;
  url: string;
}

Deno.serve(async (req) => {
  const segredo = Deno.env.get('PUSH_SEGREDO');
  if (!segredo || req.headers.get('Authorization') !== `Bearer ${segredo}`) return new Response('não autorizado', { status: 401 });
  const ev = await req.json();
  const envios = ev.tipo === 'chat' ? await chat(ev) : ev.tipo === 'gasto' || ev.tipo === 'importacao' ? await gasto(ev)
    : ev.tipo === 'vencimentos' ? await vencimentos() : ev.tipo === 'lembrete' ? await lembrete() : ev.tipo === 'resumo' ? await resumo()
    : ev.tipo === 'fatura' ? await faturas() : ev.tipo === 'saldos' ? await saldos() : ev.tipo === 'semanal' ? await semanal()
    : ev.tipo === 'comunicado' ? await comunicado(ev) : [];
  const n = (await Promise.all(envios.map(enviar))).reduce((a: number, b) => a + b, 0);
  return Response.json({ enviados: n });
});

async function membros(carteira: string) {
  const { data, error } = await db.from('carteira_membros').select('user_id, nome, push_gastos, resumo_mensal, push_fatura, resumo_semanal, chat_aberto_em').eq('carteira_id', carteira);
  if (error) throw error;
  return data;
}

async function chat(ev: { carteira_id: string; user_id: string; texto: string }): Promise<Envio[]> {
  const l = await membros(ev.carteira_id);
  const nome = l.find((m) => m.user_id === ev.user_id)?.nome ?? 'Chat';
  // com o chat aberto (sinal a cada 30 s) a mensagem já aparece lida: não avisa
  const aberto = (m: { chat_aberto_em: string | null }) => !!m.chat_aberto_em && Date.now() - Date.parse(m.chat_aberto_em) < 75_000;
  return [{
    usuarios: l.filter((m) => m.user_id !== ev.user_id && !aberto(m)).map((m) => m.user_id),
    titulo: nome,
    texto: ev.texto.length > 120 ? ev.texto.slice(0, 120) + '…' : ev.texto,
    tag: `chat-${ev.carteira_id}`,
    url: '/chat',
  }];
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

interface EventoGasto {
  tipo: 'gasto' | 'importacao';
  carteira_id: string;
  user_id: string;
  qtd: number;
  valor: number;
  parcelas?: number;
  texto?: string;
}

/** Avisa os outros membros (com aviso de gasto ligado) */
async function gasto(ev: EventoGasto): Promise<Envio[]> {
  const l = await membros(ev.carteira_id);
  const nome = l.find((m) => m.user_id === ev.user_id)?.nome ?? 'Alguém';
  const valor = brl.format(Number(ev.valor));
  const texto = ev.tipo === 'importacao' ? `${ev.qtd} gasto(s) importados · ${valor}`
    : ev.parcelas ? `${ev.texto} · ${ev.parcelas}x de ${valor}`
    : ev.qtd > 1 ? `${ev.qtd} gastos · ${valor}`
    : `${ev.texto} · ${valor}`;
  return [{
    usuarios: l.filter((m) => m.user_id !== ev.user_id && m.push_gastos !== false).map((m) => m.user_id),
    titulo: ev.tipo === 'importacao' ? `${nome} importou gastos` : `${nome} lançou ${Number(ev.valor) < 0 ? 'um estorno' : 'um gasto'}`,
    texto,
    tag: `gasto-${ev.carteira_id}-${Date.now()}`,
    url: '/gastos',
  }];
}

async function vencimentos(): Promise<Envio[]> {
  const { data, error } = await db.rpc('avisos_vencimento');
  if (error) throw error;
  const envios: Envio[] = [];
  for (const a of data as { carteira_id: string; ref_id: string; titulo: string; texto: string }[]) {
    const l = await membros(a.carteira_id);
    envios.push({ usuarios: l.map((m) => m.user_id), titulo: a.titulo, texto: a.texto, tag: `push-venc-${a.ref_id}`, url: '/contas' });
  }
  return envios;
}

async function lembrete(): Promise<Envio[]> {
  const { data, error } = await db.rpc('lembretes_lancamento');
  if (error) throw error;
  const usuarios = (data as { user_id: string }[]).map((x) => x.user_id);
  return [{ usuarios, titulo: 'Lançou os gastos de hoje?', texto: 'Nenhum gasto lançado hoje. Toque para lançar.', tag: 'lembrete', url: '/?lancar=gasto' }];
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Dia 1: quanto saiu no mês que fechou e a categoria que mais pesou */
async function resumo(): Promise<Envio[]> {
  const { data, error } = await db.rpc('resumos_mensais');
  if (error) throw error;
  const envios: Envio[] = [];
  for (const r of data as { carteira_id: string; mes: string; total: number; categoria: string; valor_categoria: number }[]) {
    const l = await membros(r.carteira_id);
    const mes = MESES[Number(r.mes.slice(5, 7)) - 1];
    envios.push({
      usuarios: l.filter((m) => m.resumo_mensal !== false).map((m) => m.user_id),
      titulo: `${mes[0].toUpperCase()}${mes.slice(1)} fechou`,
      texto: `${brl.format(Number(r.total))} em gastos. Mais em ${r.categoria}: ${brl.format(Number(r.valor_categoria))}. Toque para ver o balanço.`,
      tag: `resumo-${r.carteira_id}-${r.mes}`,
      url: '/fechamento',
    });
  }
  return envios;
}

interface Semana {
  carteira_id: string;
  total: number;
  anterior: number;
  categoria: string | null;
  valor_categoria: number | null;
  quem: string | null;
  valor_quem: number | null;
  membros_gastaram: number;
  contas_qtd: number;
  contas_total: number;
}

/** Domingo: gastos da semana contra a anterior, onde e quem mais gastou, contas dos próximos 7 dias */
async function semanal(): Promise<Envio[]> {
  const { data, error } = await db.rpc('resumos_semanais');
  if (error) throw error;
  const envios: Envio[] = [];
  for (const r of data as Semana[]) {
    const l = await membros(r.carteira_id);
    const total = Number(r.total), ant = Number(r.anterior);
    const partes: string[] = [];
    if (total > 0) {
      const dif = ant > 0 ? Math.round((total / ant - 1) * 100) : null;
      partes.push(`${brl.format(total)} em gastos${dif === null || dif === 0 ? '' : ` (${Math.abs(dif)}% ${dif > 0 ? 'a mais' : 'a menos'} que a anterior)`}.`);
      if (r.categoria) partes.push(`Mais em ${r.categoria}: ${brl.format(Number(r.valor_categoria))}.`);
      if (r.membros_gastaram > 1 && r.quem) partes.push(`${r.quem} gastou mais: ${brl.format(Number(r.valor_quem))}.`);
    }
    if (r.contas_qtd > 0) partes.push(`${r.contas_qtd} conta(s) vencem nos próximos 7 dias: ${brl.format(Number(r.contas_total))}.`);
    envios.push({
      usuarios: l.filter((m) => m.resumo_semanal !== false).map((m) => m.user_id),
      titulo: 'Resumo da semana',
      texto: partes.join(' '),
      tag: `semanal-${r.carteira_id}`,
      url: '/relatorios',
    });
  }
  return envios;
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Fatura que fechou hoje: total e vencimento */
async function faturas(): Promise<Envio[]> {
  const { data, error } = await db.rpc('faturas_fechadas');
  if (error) throw error;
  const envios: Envio[] = [];
  for (const f of data as { carteira_id: string; cartao_id: string; nome: string; mes: string; total: number; vencimento: string }[]) {
    if (Number(f.total) <= 0) continue;
    const l = await membros(f.carteira_id);
    // Gastos abre por fatura: 0 = vence no mês atual, 1 = no seguinte
    const agora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    const idx = (Number(f.mes.slice(0, 4)) - Number(agora.slice(0, 4))) * 12 + Number(f.mes.slice(5, 7)) - Number(agora.slice(5, 7));
    envios.push({
      usuarios: l.filter((m) => m.push_fatura !== false).map((m) => m.user_id),
      titulo: `Fatura ${f.nome} fechou`,
      texto: `${brl.format(Number(f.total))}, vence ${dm(f.vencimento)}. Toque para conferir.`,
      tag: `fatura-${f.cartao_id}-${f.mes}`,
      url: `/gastos?cartao=${f.cartao_id}&fatura=${Math.min(1, Math.max(0, idx))}`,
    });
  }
  return envios;
}

/** Domingo: contas bancárias sem atualizar há mais de 7 dias */
async function saldos(): Promise<Envio[]> {
  const { data, error } = await db.rpc('saldos_desatualizados');
  if (error) throw error;
  return (data as { user_id: string; qtd: number }[]).map((x) => ({
    usuarios: [x.user_id],
    titulo: 'Atualize os saldos dos bancos',
    texto: `${x.qtd} conta(s) sem atualizar há mais de uma semana. O patrimônio e o previsto do mês dependem disso.`,
    tag: 'saldos',
    url: '/saldos',
  }));
}

/** Aviso do app para quem tem inscrição push, menos quem desligou */
async function comunicado(ev: { id: string }): Promise<Envio[]> {
  const { data: c, error } = await db.from('comunicados').select('titulo, texto, link').eq('id', ev.id).single();
  if (error) throw error;
  const [insc, prefs] = await Promise.all([
    db.from('push_inscricoes').select('user_id'),
    db.from('usuario_prefs').select('user_id').eq('push_comunicados', false),
  ]);
  if (insc.error) throw insc.error;
  if (prefs.error) throw prefs.error;
  const fora = new Set(prefs.data.map((p) => p.user_id));
  return [{
    usuarios: [...new Set(insc.data.map((i) => i.user_id as string))].filter((u) => !fora.has(u)),
    titulo: c.titulo,
    texto: c.texto.length > 120 ? c.texto.slice(0, 120) + '…' : c.texto,
    tag: `comunicado-${ev.id}`,
    url: c.link ?? '/notificacoes?aba=app',
  }];
}

async function enviar(e: Envio) {
  if (!e.usuarios.length) return 0;
  const { data: sus, error: errSus } = await db.from('suspensos').select('user_id').in('user_id', e.usuarios);
  if (errSus) throw errSus;
  const bloqueados = new Set(sus.map((x) => x.user_id));
  e.usuarios = e.usuarios.filter((u) => !bloqueados.has(u));
  if (!e.usuarios.length) return 0;
  const { data, error } = await db.from('push_inscricoes').select('endpoint, p256dh, auth').in('user_id', e.usuarios);
  if (error) throw error;
  // formato do service worker do Angular; onActionClick abre a tela ao tocar
  const payload = JSON.stringify({
    notification: {
      title: e.titulo,
      body: e.texto,
      icon: 'icons/icon-192x192.png',
      tag: e.tag,
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: e.url } } },
    },
  });
  // urgency high: sem ele o Android segura o aviso até sair da economia de bateria (chegava atrasado)
  const r = await Promise.all(data.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' });
      return 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from('push_inscricoes').delete().eq('endpoint', s.endpoint);
      else console.error(s.endpoint, status, err);
      return 0;
    }
  }));
  const n = r.reduce((a: number, b) => a + b, 0);
  return n;
}
