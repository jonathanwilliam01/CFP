-- Modelo de organização da carteira: pelo mês (padrão) ou por recebimento (cada salário paga as contas dele)
alter table carteiras add column if not exists modelo text not null default 'mes' check (modelo in ('mes', 'recebimento'));
grant update (modelo) on carteiras to authenticated;

-- "Paga com": entrada fixa que paga a conta ou a fatura (null = automático pelo dia do vencimento)
alter table recorrencias add column if not exists recebimento_id uuid references recorrencias on delete set null;
alter table cartoes add column if not exists recebimento_id uuid references recorrencias on delete set null;

-- Reajuste cria outra versão da recorrência: a conta leva o vínculo e quem apontava para a entrada antiga passa para a nova
create or replace function recebimento_reajuste() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.recebimento_id is null then
    select recebimento_id into new.recebimento_id from recorrencias where id = new.reajuste_de;
  end if;
  return new;
end $$;

create or replace function recebimento_reajuste_depois() returns trigger
language plpgsql set search_path = public as $$
begin
  update recorrencias set recebimento_id = new.id where recebimento_id = new.reajuste_de and carteira_id = new.carteira_id;
  update cartoes set recebimento_id = new.id where recebimento_id = new.reajuste_de and carteira_id = new.carteira_id;
  return null;
end $$;

drop trigger if exists recorrencias_recebimento on recorrencias;
create trigger recorrencias_recebimento before insert on recorrencias
  for each row when (new.reajuste_de is not null) execute function recebimento_reajuste();

drop trigger if exists recorrencias_recebimento_depois on recorrencias;
create trigger recorrencias_recebimento_depois after insert on recorrencias
  for each row when (new.reajuste_de is not null and new.tipo = 'entrada') execute function recebimento_reajuste_depois();
