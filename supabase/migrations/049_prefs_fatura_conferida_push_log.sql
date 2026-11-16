-- Preferências de tela por usuário (revisados, avisos lidos, vistas, filtros): valem em todos os aparelhos
alter table usuario_prefs add column if not exists telas jsonb not null default '{}';

-- Fatura conferida com o banco
create table if not exists faturas_conferidas (
  carteira_id uuid not null references carteiras on delete cascade,
  cartao_id uuid not null references cartoes on delete cascade,
  mes date not null,
  conferida_em timestamptz not null default now(),
  conferida_por uuid default auth.uid() references auth.users on delete set null,
  diferenca numeric(12, 2) not null default 0,
  primary key (cartao_id, mes)
);
alter table faturas_conferidas enable row level security;
drop policy if exists faturas_conferidas_rw on faturas_conferidas;
create policy faturas_conferidas_rw on faturas_conferidas for all
  using (is_membro(carteira_id)) with check (is_membro(carteira_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'faturas_conferidas') then
    alter publication supabase_realtime add table faturas_conferidas;
  end if;
end $$;

-- Envios do push (gravado pela Edge Function com service role); só admin lê
create table if not exists push_log (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  tipo text not null,
  enviados int not null default 0,
  falhas int not null default 0,
  versao text,
  erro text
);
create index if not exists push_log_criado_em on push_log (criado_em desc);
alter table push_log enable row level security;
drop policy if exists push_log_admin on push_log;
create policy push_log_admin on push_log for select to authenticated using (is_admin());

select cron.schedule('cfp-push-log-limpeza', '40 4 * * *', $$delete from push_log where criado_em < now() - interval '90 days'$$);
