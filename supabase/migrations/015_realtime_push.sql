-- Edições do parceiro nos cadastros chegam em tempo real
alter publication supabase_realtime add table
  categorias, cartoes, beneficios, orcamentos, cofrinhos, registros, planos, parcelamentos, carteira_membros, carteiras;

-- Web Push: inscrição por aparelho
create table push_inscricoes (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
alter table push_inscricoes enable row level security;
create policy push_inscricoes_rw on push_inscricoes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- URL da Edge Function push e segredo compartilhado; preencher à mão (README). Sem policy: só funções definer.
create table push_config (
  id int primary key default 1 check (id = 1),
  url text not null,
  segredo text not null
);
alter table push_config enable row level security;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function push_enviar(p_evento jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg push_config;
begin
  select * into cfg from push_config;
  if cfg.url is null then
    return;
  end if;
  perform net.http_post(
    url := cfg.url,
    body := p_evento,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cfg.segredo)
  );
end $$;
revoke execute on function push_enviar from public, anon, authenticated;

create or replace function mensagens_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_enviar(jsonb_build_object('tipo', 'chat', 'carteira_id', new.carteira_id, 'user_id', new.user_id, 'texto', new.texto));
  return null;
end $$;

create trigger mensagens_push after insert on mensagens
for each row execute function mensagens_push();

-- Contas fixas e faturas não pagas que vencem hoje ou amanhã (horário de Brasília).
-- Conta variável usa o valor cadastrado, não a média do app.
create or replace function avisos_vencimento() returns table (carteira_id uuid, ref_id uuid, titulo text, texto text)
language sql stable security definer set search_path = public as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date d),
  meses as (
    select distinct date_trunc('month', x)::date m, h.d from h, lateral (values (h.d), (h.d + 1)) v(x)
  ),
  contas as (
    select r.carteira_id, r.id ref_id, r.descricao, r.valor, ms.d,
      ms.m + least(r.dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1 venc
    from recorrencias r, meses ms
    where r.tipo = 'conta' and r.ativo and r.cartao_id is null and r.beneficio_id is null
      and date_trunc('month', r.inicio) <= ms.m and (r.fim is null or date_trunc('month', r.fim) >= ms.m)
      and not exists (select 1 from pagamentos p where p.tipo = 'recorrencia' and p.ref_id = r.id and p.mes = ms.m)
  ),
  faturas as (
    select c.carteira_id, c.id ref_id, 'Fatura ' || c.nome descricao,
      coalesce((select sum(g.valor) from gastos g where g.cartao_id = c.id and g.fatura_mes = ms.m), 0)
      + coalesce((select sum(r.valor) from recorrencias r
          where r.cartao_id = c.id and r.tipo = 'conta' and r.ativo
            and date_trunc('month', r.inicio) <= ms.m and (r.fim is null or date_trunc('month', r.fim) >= ms.m)), 0) valor,
      ms.d,
      ms.m + least(c.vencimento_dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1 venc
    from cartoes c, meses ms
    where c.ativo
      and not exists (select 1 from pagamentos p where p.tipo = 'fatura' and p.ref_id = c.id and p.mes = ms.m)
  )
  select carteira_id, ref_id,
    descricao || case when venc = d then ' vence hoje' else ' vence amanhã' end,
    'Valor: R$ ' || replace(to_char(valor, 'FM999999990.00'), '.', ',')
  from (select * from contas union all select * from faturas) t
  where venc in (d, d + 1) and valor > 0;
$$;
revoke execute on function avisos_vencimento from public, anon, authenticated;

-- 8h de Brasília
select cron.schedule('cfp-vencimentos', '0 11 * * *', $$select push_enviar('{"tipo":"vencimentos"}'::jsonb)$$);
