-- Chat entre os membros da carteira
create table mensagens (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now()
);
create index on mensagens (carteira_id, criado_em);

alter table mensagens enable row level security;
create policy mensagens_sel on mensagens for select using (is_membro(carteira_id));
create policy mensagens_ins on mensagens for insert with check (is_membro(carteira_id) and user_id = auth.uid());

alter publication supabase_realtime add table mensagens;
