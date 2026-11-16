-- Transferência entre contas bancárias: move saldo sem virar gasto nem entrada
create table if not exists transferencias (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  de_id uuid references contas_bancarias on delete set null,
  para_id uuid references contas_bancarias on delete set null,
  valor numeric(12, 2) not null check (valor > 0),
  data date not null default current_date,
  descricao text,
  criado_por uuid default auth.uid() references auth.users on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists transferencias_carteira on transferencias (carteira_id, data desc);
alter table transferencias enable row level security;
drop policy if exists transferencias_ler on transferencias;
drop policy if exists transferencias_criar on transferencias;
drop policy if exists transferencias_apagar on transferencias;
create policy transferencias_ler on transferencias for select using (is_membro(carteira_id));
create policy transferencias_criar on transferencias for insert with check (is_membro(carteira_id));
create policy transferencias_apagar on transferencias for delete using (is_membro(carteira_id));
revoke update on transferencias from authenticated, anon;

-- Invoker: o RLS de contas_bancarias continua valendo
create or replace function transferencia_saldo() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.de_id is null or new.para_id is null or new.de_id = new.para_id
       or (select count(*) from contas_bancarias where id in (new.de_id, new.para_id) and carteira_id = new.carteira_id) <> 2 then
      raise exception 'Escolha duas contas diferentes da carteira';
    end if;
    update contas_bancarias set saldo = saldo - new.valor where id = new.de_id;
    update contas_bancarias set saldo = saldo + new.valor where id = new.para_id;
    return new;
  end if;
  update contas_bancarias set saldo = saldo + old.valor where id = old.de_id;
  update contas_bancarias set saldo = saldo - old.valor where id = old.para_id;
  return old;
end $$;

drop trigger if exists transferencias_saldo on transferencias;
create trigger transferencias_saldo before insert or delete on transferencias
  for each row execute function transferencia_saldo();

-- Depósito/retirada do cofrinho saindo de (ou voltando para) uma conta bancária
alter table cofrinho_movs add column if not exists conta_id uuid references contas_bancarias on delete set null;

create or replace function cofrinho_conta_saldo() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.conta_id is not null then
    update contas_bancarias set saldo = saldo + old.valor where id = old.conta_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.conta_id is not null then
    if not exists (select 1 from contas_bancarias where id = new.conta_id and carteira_id = new.carteira_id) then
      raise exception 'Conta bancária de outra carteira';
    end if;
    update contas_bancarias set saldo = saldo - new.valor where id = new.conta_id;
  end if;
  return null;
end $$;

drop trigger if exists cofrinho_movs_conta on cofrinho_movs;
create trigger cofrinho_movs_conta after insert or update of valor, conta_id or delete on cofrinho_movs
  for each row execute function cofrinho_conta_saldo();

-- Rendimento: cofrinho rende % do CDI ou taxa fixa ao ano; o app lança um movimento por mês fechado
alter table cofrinhos add column if not exists rende text check (rende in ('cdi', 'fixo'));
alter table cofrinhos add column if not exists rende_pct numeric(7, 2) check (rende_pct > 0);
-- mês a partir do qual rende (ligar o rendimento não gera meses passados)
alter table cofrinhos add column if not exists rende_desde date;
alter table cofrinho_movs add column if not exists rendimento_mes date;
do $$ begin
  alter table cofrinho_movs add constraint cofrinho_movs_rendimento unique (cofrinho_id, rendimento_mes);
exception when duplicate_object or duplicate_table then null;
end $$;

-- Verificação em duas etapas: quem tem fator TOTP verificado só acessa a carteira com sessão aal2.
-- Sem claim aal (chamadas do servidor, como o WhatsApp) não bloqueia.
create or replace function mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal2') = 'aal2'
    or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified')
$$;
grant execute on function mfa_ok() to authenticated;

create or replace function is_membro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from carteira_membros where carteira_id = c and user_id = auth.uid())
    and not exists (select 1 from suspensos where user_id = auth.uid())
    and mfa_ok();
$$;

create or replace function e_dono(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from carteira_membros where carteira_id = c and user_id = auth.uid() and papel = 'dono')
    and not exists (select 1 from suspensos where user_id = auth.uid())
    and mfa_ok();
$$;

-- Exclusão da própria conta (LGPD), chamada pela Edge Function conta: sai de todas as carteiras;
-- carteira sem mais ninguém é apagada, e se o dono saiu o membro mais antigo vira dono. Devolve as apagadas (comprovantes a limpar).
create or replace function excluir_minha_conta(p_user uuid) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  r record;
  apagadas uuid[] := '{}';
begin
  for r in delete from carteira_membros where user_id = p_user returning carteira_id, papel loop
    if not exists (select 1 from carteira_membros where carteira_id = r.carteira_id) then
      delete from carteiras where id = r.carteira_id;
      apagadas := apagadas || r.carteira_id;
    elsif r.papel = 'dono' and not exists (select 1 from carteira_membros where carteira_id = r.carteira_id and papel = 'dono') then
      update carteira_membros set papel = 'dono'
      where carteira_id = r.carteira_id
        and user_id = (select user_id from carteira_membros where carteira_id = r.carteira_id order by criado_em limit 1);
    end if;
  end loop;
  return apagadas;
end $$;
revoke execute on function excluir_minha_conta(uuid) from public, anon, authenticated;
grant execute on function excluir_minha_conta(uuid) to service_role;

-- Histórico: transferências com "origem → destino"
create or replace function atividade_desc(t text, j jsonb) returns text
language sql stable security definer set search_path = public as $$
  select case
    when t = 'gastos' and (j ->> 'livre')::boolean then null
    when t = 'pagamentos' then coalesce(
      (select descricao from recorrencias where id = (j ->> 'ref_id')::uuid),
      (select 'Fatura ' || nome from cartoes where id = (j ->> 'ref_id')::uuid),
      (select descricao from gastos where id = (j ->> 'ref_id')::uuid))
    when t = 'cofrinho_movs' then coalesce(j ->> 'descricao', (select nome from cofrinhos where id = (j ->> 'cofrinho_id')::uuid))
    when t = 'transferencias' then coalesce(j ->> 'descricao',
      coalesce((select nome from contas_bancarias where id = (j ->> 'de_id')::uuid), '?') || ' → ' ||
      coalesce((select nome from contas_bancarias where id = (j ->> 'para_id')::uuid), '?'))
    else coalesce(j ->> 'descricao', j ->> 'nome', j ->> 'titulo', j ->> 'nota', j ->> 'decisao')
  end
$$;

drop trigger if exists transferencias_ativ_i on transferencias;
drop trigger if exists transferencias_ativ_d on transferencias;
create trigger transferencias_ativ_i after insert on transferencias referencing new table as novos for each statement execute function registrar_atividade();
create trigger transferencias_ativ_d after delete on transferencias referencing old table as antigos for each statement execute function registrar_atividade();

do $$ begin
  alter publication supabase_realtime add table transferencias;
exception when duplicate_object then null;
end $$;
