-- Push para os outros membros quando alguém lança gasto (desligável por membro)
alter table carteira_membros add column if not exists push_gastos boolean not null default true;
grant update (lembrete, push_gastos) on carteira_membros to authenticated;

-- Um aviso por comando (backup/restauração em lote vira "N gastos"); parcelas avisam pelo parcelamento.
-- cfp.sem_push = '1' (importação) cala os avisos da transação.
create or replace function gastos_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if current_setting('cfp.sem_push', true) = '1' then
    return null;
  end if;
  for r in
    select carteira_id, criado_por, count(*) as qtd, sum(valor) as valor, min(descricao) as texto
    from novos where parcelamento_id is null group by carteira_id, criado_por
  loop
    perform push_enviar(jsonb_build_object('tipo', 'gasto', 'carteira_id', r.carteira_id, 'user_id', r.criado_por,
      'qtd', r.qtd, 'valor', r.valor, 'texto', r.texto));
  end loop;
  return null;
end $$;

drop trigger if exists gastos_push on gastos;
create trigger gastos_push after insert on gastos referencing new table as novos
for each statement execute function gastos_push();

create or replace function parcelamentos_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('cfp.sem_push', true) = '1' then
    return null;
  end if;
  perform push_enviar(jsonb_build_object('tipo', 'gasto', 'carteira_id', new.carteira_id, 'user_id', new.criado_por,
    'qtd', 1, 'valor', new.valor_parcela, 'parcelas', new.num_parcelas, 'texto', new.descricao));
  return null;
end $$;

drop trigger if exists parcelamentos_push on parcelamentos;
create trigger parcelamentos_push after insert on parcelamentos
for each row execute function parcelamentos_push();

-- Resumo da importação; texto montado na função, só para a própria carteira
create or replace function avisar_importacao(p_carteira uuid, p_qtd int, p_valor numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_membro(p_carteira) then
    raise exception 'sem acesso';
  end if;
  perform push_enviar(jsonb_build_object('tipo', 'importacao', 'carteira_id', p_carteira, 'user_id', auth.uid(), 'qtd', p_qtd, 'valor', p_valor));
end $$;
revoke execute on function avisar_importacao from public, anon;
grant execute on function avisar_importacao to authenticated;

create or replace function importar_gastos(p_carteira uuid, p_itens jsonb) returns int
language plpgsql set search_path = public as $$
declare
  it jsonb;
  n int := 0;
  total numeric := 0;
  t text[];
begin
  perform set_config('cfp.sem_push', '1', true);
  for it in select * from jsonb_array_elements(p_itens) loop
    t := coalesce(array(select jsonb_array_elements_text(it->'tags')), '{}');
    if coalesce((it->>'parcelar')::boolean, false) then
      perform criar_parcelamento(p_carteira, it->>'descricao', (it->>'categoria_id')::uuid, (it->>'cartao_id')::uuid,
        (it->>'valor')::numeric, (it->>'parcelas')::int, (it->>'data')::date, (it->>'parcela')::int, null, t);
    else
      insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, tags)
      values (p_carteira, it->>'descricao', (it->>'categoria_id')::uuid, (it->>'valor')::numeric, (it->>'data')::date,
        coalesce(it->>'forma', 'cartao'), (it->>'cartao_id')::uuid, t);
    end if;
    n := n + 1;
    total := total + coalesce((it->>'valor')::numeric, 0);
  end loop;
  if n > 0 then
    perform avisar_importacao(p_carteira, n, total);
  end if;
  return n;
end $$;
