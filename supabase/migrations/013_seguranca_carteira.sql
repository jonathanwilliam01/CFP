-- Membro só altera o próprio nome e a carteira só o nome; o resto passa pelas funções abaixo
revoke update on carteira_membros from anon, authenticated;
grant update (nome) on carteira_membros to authenticated;
revoke update on carteiras from anon, authenticated;
grant update (nome) on carteiras to authenticated;

drop policy membros_del on carteira_membros;

-- Código de 8 caracteres sem ambíguos (0/O, 1/I); os antigos continuam valendo
create or replace function gerar_codigo() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(uuid_send(gen_random_uuid()), 0) % 32, 1), '')
  from generate_series(1, 8);
$$;
alter table carteiras alter column codigo set default gerar_codigo();

create or replace function e_dono(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from carteira_membros where carteira_id = c and user_id = auth.uid() and papel = 'dono');
$$;

-- Sem policy: só as funções security definer leem e gravam
create table convite_tentativas (
  user_id uuid not null default auth.uid(),
  em timestamptz not null default now()
);
create index on convite_tentativas (user_id, em);
alter table convite_tentativas enable row level security;

-- Código errado devolve null (um raise desfaria o registro da tentativa); 10 erros em 15 min bloqueiam
create or replace function entrar_carteira(p_codigo text, p_membro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if (select count(*) from convite_tentativas where user_id = auth.uid() and em > now() - interval '15 minutes') >= 10 then
    raise exception 'Muitas tentativas. Aguarde alguns minutos.';
  end if;
  select id into cid from carteiras where codigo = upper(replace(trim(p_codigo), ' ', ''));
  if cid is null then
    insert into convite_tentativas default values;
    return null;
  end if;
  insert into carteira_membros (carteira_id, user_id, nome) values (cid, auth.uid(), p_membro)
  on conflict do nothing;
  return cid;
end $$;

create or replace function novo_codigo(p_carteira uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  cod text;
begin
  if not e_dono(p_carteira) then
    raise exception 'Só o dono pode trocar o código';
  end if;
  update carteiras set codigo = gerar_codigo() where id = p_carteira returning codigo into cod;
  return cod;
end $$;

-- Último a sair apaga a carteira; dono saindo passa o posto ao membro mais antigo
create or replace function sair_carteira(p_carteira uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  era_dono boolean;
begin
  delete from carteira_membros where carteira_id = p_carteira and user_id = auth.uid()
  returning papel = 'dono' into era_dono;
  if era_dono is null then
    raise exception 'Você não participa desta carteira';
  end if;
  if not exists (select 1 from carteira_membros where carteira_id = p_carteira) then
    delete from carteiras where id = p_carteira;
  elsif era_dono and not exists (select 1 from carteira_membros where carteira_id = p_carteira and papel = 'dono') then
    update carteira_membros set papel = 'dono'
    where carteira_id = p_carteira
      and user_id = (select user_id from carteira_membros where carteira_id = p_carteira order by criado_em limit 1);
  end if;
end $$;

create or replace function remover_membro(p_carteira uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not e_dono(p_carteira) then
    raise exception 'Só o dono pode remover membros';
  end if;
  if p_user = auth.uid() then
    raise exception 'Para sair da carteira use Sair da carteira';
  end if;
  delete from carteira_membros where carteira_id = p_carteira and user_id = p_user;
end $$;

create or replace function excluir_carteira(p_carteira uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not e_dono(p_carteira) then
    raise exception 'Só o dono pode excluir a carteira';
  end if;
  delete from carteiras where id = p_carteira;
end $$;

grant execute on function entrar_carteira, novo_codigo, sair_carteira, remover_membro, excluir_carteira to authenticated;
