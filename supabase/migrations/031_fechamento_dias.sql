-- Fechamento contado em dias antes do vencimento (Nubank, C6, Inter: 7; Itaú: 8): o dia muda conforme o mês.
-- Compra no dia do fechamento segue indo para a fatura seguinte.
alter table cartoes add column if not exists fecha_dias int check (fecha_dias between 1 and 28);

-- Dia em que fecha a fatura que vence no mês m (mesma regra de fechamentoFatura no app)
create or replace function fechamento_fatura(m date, fech int, venc int, dias int) returns date
language plpgsql immutable as $$
declare
  ult int;
begin
  m := date_trunc('month', m)::date;
  if dias is not null then
    ult := extract(day from m + interval '1 month - 1 day');
    return m + least(venc, ult) - 1 - dias;
  end if;
  if venc <= fech then
    m := (m - interval '1 month')::date;
  end if;
  ult := extract(day from m + interval '1 month - 1 day');
  if fech > ult then
    return (m + interval '1 month')::date;
  end if;
  return m + fech - 1;
end $$;

create or replace function calc_fatura(d date, fech int, venc int, dias int) returns date
language plpgsql immutable as $$
declare
  m date := date_trunc('month', d)::date;
begin
  while d >= fechamento_fatura(m, fech, venc, dias) loop
    m := (m + interval '1 month')::date;
  end loop;
  return m;
end $$;

drop function if exists calc_fatura(date, int, int);

create or replace function gastos_before() returns trigger
language plpgsql as $$
declare
  c cartoes;
begin
  if new.forma = 'cartao' and new.cartao_id is not null then
    select * into c from cartoes where id = new.cartao_id;
    new.fatura_mes := calc_fatura(new.data, c.fechamento_dia, c.vencimento_dia, c.fecha_dias);
  else
    -- cartão excluído: a compra passa a contar como à vista
    if new.forma = 'cartao' then
      new.forma := 'debito';
    end if;
    new.fatura_mes := null;
    new.cartao_id := null;
  end if;
  if new.forma <> 'beneficio' then
    new.beneficio_id := null;
  end if;
  return new;
end $$;

-- Mudou o ciclo: refaz a fatura dos gastos da fatura aberta em diante; faturas fechadas ficam como estão
create or replace function cartoes_ciclo() returns trigger
language plpgsql as $$
begin
  update gastos set fatura_mes = null
  where cartao_id = new.id and forma = 'cartao'
    and fatura_mes >= calc_fatura(current_date, old.fechamento_dia, old.vencimento_dia, old.fecha_dias);
  return null;
end $$;

drop trigger if exists cartoes_ciclo on cartoes;
create trigger cartoes_ciclo after update of fechamento_dia, vencimento_dia, fecha_dias on cartoes
for each row
when ((old.fechamento_dia, old.vencimento_dia, old.fecha_dias) is distinct from (new.fechamento_dia, new.vencimento_dia, new.fecha_dias))
execute function cartoes_ciclo();

revoke execute on function fechamento_fatura(date, int, int, int), calc_fatura(date, int, int, int), cartoes_ciclo() from public, anon;
