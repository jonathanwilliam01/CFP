-- Foto ou PDF do comprovante no gasto: caminho no bucket comprovantes (<carteira>/<gasto>.jpg|pdf)
alter table gastos add column if not exists comprovante text;

insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false) on conflict (id) do nothing;

-- pasta = carteira; só os membros dela leem e gravam
create or replace function membro_da_pasta(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from carteira_membros m
    where m.carteira_id::text = (storage.foldername(p_nome))[1] and m.user_id = auth.uid()
  );
$$;
revoke execute on function membro_da_pasta from public, anon;
grant execute on function membro_da_pasta to authenticated;

drop policy if exists comprovantes_ler on storage.objects;
drop policy if exists comprovantes_inserir on storage.objects;
drop policy if exists comprovantes_atualizar on storage.objects;
drop policy if exists comprovantes_excluir on storage.objects;
create policy comprovantes_ler on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and membro_da_pasta(name));
create policy comprovantes_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and membro_da_pasta(name));
create policy comprovantes_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'comprovantes' and membro_da_pasta(name));
create policy comprovantes_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and membro_da_pasta(name));

-- Meta de sobra do mês, em % das entradas (null = sem meta)
alter table carteiras add column if not exists meta_sobra numeric(5,2) check (meta_sobra > 0 and meta_sobra < 100);
grant update (nome, inicio, divisao, meta_sobra) on carteiras to authenticated;

-- Categoria dedutível no Imposto de Renda; Saúde e Educação já vêm marcadas
alter table categorias add column if not exists dedutivel boolean not null default false;
update categorias set dedutivel = true where tipo = 'gasto' and nome in ('Saúde', 'Educação');

create or replace function categorias_dedutivel() returns trigger language plpgsql as $$
begin
  new.dedutivel := new.dedutivel or (new.tipo = 'gasto' and new.nome in ('Saúde', 'Educação'));
  return new;
end $$;
drop trigger if exists categorias_dedutivel on categorias;
create trigger categorias_dedutivel before insert on categorias for each row execute function categorias_dedutivel();
