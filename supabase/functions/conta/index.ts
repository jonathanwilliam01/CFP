// Exclusão da própria conta (LGPD). O JWT identifica quem pede; a limpeza usa a service_role.
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resp = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: cors });

async function limparPasta(bucket: string, pasta: string) {
  for (;;) {
    const { data, error } = await db.storage.from(bucket).list(pasta, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) return;
    const r = await db.storage.from(bucket).remove(data.map((x) => `${pasta}/${x.name}`));
    if (r.error) throw r.error;
    if (data.length < 1000) return;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const eu = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const user = (await eu.auth.getUser()).data.user;
  if (!user) return resp({ erro: 'acesso negado' }, 403);
  // com 2 etapas ativas, só sessão confirmada pelo código
  const { data: mfa } = await eu.rpc('mfa_ok');
  if (mfa !== true) return resp({ erro: 'Confirme o código de verificação antes' }, 403);
  const { acao } = await req.json().catch(() => ({}));
  if (acao !== 'excluir') return resp({ erro: 'Ação inválida' }, 400);

  try {
    const { data: apagadas, error } = await db.rpc('excluir_minha_conta', { p_user: user.id });
    if (error) throw error;
    for (const c of (apagadas ?? []) as string[]) await limparPasta('comprovantes', c);
    await limparPasta('avatares', user.id);
    const st = await db.rpc('admin_liberar_storage', { p_user: user.id });
    if (st.error) throw st.error;
    const a = await db.auth.admin.deleteUser(user.id);
    if (a.error) throw a.error;
  } catch (e) {
    console.error('excluir conta', user.id, e);
    return resp({ erro: (e as Error).message ?? 'falha' }, 500);
  }
  return resp({ ok: true });
});
