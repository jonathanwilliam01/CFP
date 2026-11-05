-- Painel admin: funções em manutenção (kill switch) e comunicados com push agendado

create table funcoes_status (
  chave text primary key,
  ativa boolean not null default true,
  mensagem text,
  desde timestamptz,
  por uuid
);

create table comunicado_tags (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  cor text not null,
  arquivada boolean default false
);
insert into comunicado_tags (nome, cor) values
  ('Nova versão', '#1d5bd8'),
  ('Manutenção', '#c98a06'),
  ('Datas comemorativas', '#d6453d'),
  ('Dica', '#138a4f'),
  ('Importante', '#7c3aed');

create table comunicados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  tag_id uuid references comunicado_tags,
  inicio timestamptz not null,
  fim timestamptz not null check (fim > inicio),
  link text,
  push boolean default false,
  destaque boolean default false,
  publicado boolean default false,
  push_enviado_em timestamptz,
  criado_por uuid default auth.uid(),
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table comunicado_leituras (
  comunicado_id uuid references comunicados on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete cascade,
  lido_em timestamptz default now(),
  primary key (comunicado_id, user_id)
);

alter table funcoes_status enable row level security;
alter table comunicado_tags enable row level security;
alter table comunicados enable row level security;
alter table comunicado_leituras enable row level security;
revoke all on funcoes_status, comunicado_tags, comunicados, comunicado_leituras from anon;
revoke update, delete, truncate on comunicado_leituras from authenticated;
revoke truncate on funcoes_status, comunicado_tags, comunicados from authenticated;

create policy funcoes_status_sel on funcoes_status for select to authenticated using (true);
create policy funcoes_status_ins on funcoes_status for insert to authenticated with check (is_admin());
create policy funcoes_status_upd on funcoes_status for update to authenticated using (is_admin()) with check (is_admin());
create policy funcoes_status_del on funcoes_status for delete to authenticated using (is_admin());

create policy comunicado_tags_sel on comunicado_tags for select to authenticated using (true);
create policy comunicado_tags_ins on comunicado_tags for insert to authenticated with check (is_admin());
create policy comunicado_tags_upd on comunicado_tags for update to authenticated using (is_admin()) with check (is_admin());
create policy comunicado_tags_del on comunicado_tags for delete to authenticated using (is_admin());

create policy comunicados_sel on comunicados for select to authenticated
  using (is_admin() or (publicado and inicio <= now() and fim > now()));
create policy comunicados_ins on comunicados for insert to authenticated with check (is_admin());
create policy comunicados_upd on comunicados for update to authenticated using (is_admin()) with check (is_admin());
create policy comunicados_del on comunicados for delete to authenticated using (is_admin());

create policy comunicado_leituras_sel on comunicado_leituras for select to authenticated using (user_id = auth.uid());
create policy comunicado_leituras_ins on comunicado_leituras for insert to authenticated with check (user_id = auth.uid());

create or replace function comunicados_atualizado() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
create trigger comunicados_atualizado before update on comunicados
for each row execute function comunicados_atualizado();

-- Auditoria só de quem age com JWT (admin pelo app); cron e migrations não geram linha
create or replace function admin_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old)) - 'texto';
begin
  if auth.uid() is not null then
    insert into admin_log (admin_id, acao, alvo, detalhe)
    values (auth.uid(), tg_table_name || '.' || lower(tg_op), coalesce(r->>'chave', r->>'id'), r);
  end if;
  return null;
end $$;
revoke execute on function admin_auditar from public, anon, authenticated;

create trigger funcoes_status_auditar after insert or update or delete on funcoes_status
for each row execute function admin_auditar();
create trigger comunicado_tags_auditar after insert or update or delete on comunicado_tags
for each row execute function admin_auditar();
create trigger comunicados_auditar after insert or update or delete on comunicados
for each row execute function admin_auditar();

create or replace function enviar_comunicados() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    update comunicados set push_enviado_em = now()
    where publicado and push and push_enviado_em is null and inicio <= now() and fim > now()
    returning id
  loop
    perform push_enviar(jsonb_build_object('tipo', 'comunicado', 'id', r.id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function enviar_comunicados from public, anon, authenticated;

alter publication supabase_realtime add table funcoes_status, comunicados;

select cron.schedule('cfp-comunicados', '*/15 * * * *', $$select public.enviar_comunicados()$$);
