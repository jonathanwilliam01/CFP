// Suspender, reativar e excluir conta. Só admin (is_admin) chama; as ações usam a service_role.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { podeAgir } from './regras.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resp = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const eu = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: admin } = await eu.rpc('is_admin');
  if (admin !== true) return resp({ erro: 'acesso negado' }, 403);
  const chamador = (await eu.auth.getUser()).data.user?.id;
  if (!chamador) return resp({ erro: 'acesso negado' }, 403);

  const { acao, user_id, motivo } = await req.json().catch(() => ({}));
  const erro = typeof user_id === 'string' ? podeAgir(chamador, user_id, String(acao)) : 'Usuário inválido';
  if (erro) return resp({ erro }, 400);

  try {
    if (acao === 'suspender') {
      const a = await db.auth.admin.updateUserById(user_id, { ban_duration: '876000h' });
      if (a.error) throw a.error;
      const r = await db.rpc('admin_suspender', { p_user: user_id, p_motivo: motivo ?? null, p_admin: chamador });
      if (r.error) throw r.error;
    } else if (acao === 'reativar') {
      const a = await db.auth.admin.updateUserById(user_id, { ban_duration: 'none' });
      if (a.error) throw a.error;
      const r = await db.rpc('admin_reativar', { p_user: user_id, p_admin: chamador });
      if (r.error) throw r.error;
    } else {
      const { data: arqs } = await db.storage.from('avatares').list(user_id);
      if (arqs?.length) await db.storage.from('avatares').remove(arqs.map((x) => `${user_id}/${x.name}`));
      const a = await db.auth.admin.deleteUser(user_id);
      if (a.error) throw a.error;
      const l = await db.from('admin_log').insert({ admin_id: chamador, acao: 'excluir', alvo: user_id, detalhe: { motivo: motivo ?? null } });
      if (l.error) throw l.error;
    }
  } catch (e) {
    console.error(acao, user_id, e);
    return resp({ erro: (e as Error).message ?? 'falha' }, 500);
  }
  return resp({ ok: true });
});
