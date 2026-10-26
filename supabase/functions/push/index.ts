// Envia Web Push: mensagem nova do chat (trigger em mensagens) e contas vencendo (pg_cron).
// Chamada só pelo banco via push_enviar, com o segredo de push_config.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

interface Envio {
  usuarios: string[];
  titulo: string;
  texto: string;
  tag: string;
  url: string;
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('PUSH_SEGREDO')}`) return new Response('não autorizado', { status: 401 });
  const ev = await req.json();
  const envios = ev.tipo === 'chat' ? await chat(ev) : ev.tipo === 'vencimentos' ? await vencimentos() : [];
  let n = 0;
  for (const e of envios) n += await enviar(e);
  return Response.json({ enviados: n });
});

async function membros(carteira: string) {
  const { data, error } = await db.from('carteira_membros').select('user_id, nome').eq('carteira_id', carteira);
  if (error) throw error;
  return data;
}

async function chat(ev: { carteira_id: string; user_id: string; texto: string }): Promise<Envio[]> {
  const l = await membros(ev.carteira_id);
  const nome = l.find((m) => m.user_id === ev.user_id)?.nome ?? 'Chat';
  return [{
    usuarios: l.filter((m) => m.user_id !== ev.user_id).map((m) => m.user_id),
    titulo: nome,
    texto: ev.texto.length > 120 ? ev.texto.slice(0, 120) + '…' : ev.texto,
    tag: `chat-${ev.carteira_id}`,
    url: '/chat',
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

async function enviar(e: Envio) {
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
  let n = 0;
  for (const s of data) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      n++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from('push_inscricoes').delete().eq('endpoint', s.endpoint);
      else console.error(s.endpoint, err);
    }
  }
  return n;
}
