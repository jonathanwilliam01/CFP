-- Gasto no Pix/débito/dinheiro pago com um cofrinho: o banco mantém a retirada no cofrinho igual ao gasto
alter table gastos add column if not exists cofrinho_id uuid references cofrinhos on delete set null;
alter table cofrinho_movs add column if not exists gasto_id uuid unique references gastos on delete cascade;

create or replace function sync_cofrinho_gasto() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.cofrinho_id is null or new.forma <> 'debito' then
    delete from cofrinho_movs where gasto_id = new.id;
  else
    -- estorno (valor negativo) devolve ao cofrinho
    insert into cofrinho_movs (carteira_id, cofrinho_id, valor, data, descricao, gasto_id)
    values (new.carteira_id, new.cofrinho_id, -new.valor, new.data, new.descricao, new.id)
    on conflict (gasto_id) do update
      set cofrinho_id = excluded.cofrinho_id, valor = excluded.valor, data = excluded.data, descricao = excluded.descricao;
  end if;
  return null;
end $$;

drop trigger if exists gastos_cofrinho on gastos;
create trigger gastos_cofrinho after insert or update of cofrinho_id, valor, data, descricao, forma on gastos
  for each row execute function sync_cofrinho_gasto();
