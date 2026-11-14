begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('a', teste_usuario('a@t')), ('b', teste_usuario('b@t')), ('x', teste_usuario('x@t')), ('c', gen_random_uuid()), ('k', gen_random_uuid());
insert into carteiras (id, nome, criado_por) select (select id from ids where chave = 'c'), 'casa', (select id from ids where chave = 'a');
insert into carteira_membros (carteira_id, user_id, nome, papel)
  select (select id from ids where chave = 'c'), (select id from ids where chave = k), k, 'dono' from (values ('a'), ('b')) v(k);
insert into cartoes (id, carteira_id, nome, fechamento_dia, vencimento_dia, final)
  select (select id from ids where chave = 'k'), (select id from ids where chave = 'c'), 'Nubank Elly', 1, 8, '2222';

do $$
declare
  c uuid := (select id from ids where chave = 'c');
  a uuid := (select id from ids where chave = 'a');
  k uuid := (select id from ids where chave = 'k');
  cod text;
  novo uuid;
  g gastos;
  r record;
  d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- quem não é membro não gera código
  perform teste_como((select id from ids where chave = 'x'));
  begin
    perform whatsapp_codigo(c);
    assert false, 'não membro gerou código';
  exception when others then null;
  end;

  perform teste_como(a);
  cod := whatsapp_codigo(c);
  assert cod ~ '^\d{6}$', 'código fora do formato';
  perform teste_sistema();
  perform set_config('request.jwt.claim.sub', '', false);

  assert not exists (select 1 from whatsapp_vincular('5511999990000', '000000x')), 'código errado vinculou';
  select * into r from whatsapp_vincular('5511999990000', cod);
  assert r.user_id = a and r.nome = 'a', 'vínculo não voltou o membro';
  assert not exists (select 1 from whatsapp_vincular('5511999990000', cod)), 'código usado duas vezes';

  novo := whatsapp_lancar('5511999990000', jsonb_build_object('descricao', 'Mercado', 'valor', 50, 'data', d, 'forma', 'cartao', 'cartao_id', k, 'tags', '["casa"]'::jsonb));
  select * into g from gastos where id = novo;
  assert g.criado_por = a and g.carteira_id = c and g.fatura_mes is not null and g.tags = '{casa}', 'gasto do bot errado';
  assert exists (select 1 from atividades where ref_id = novo and user_id = a), 'histórico sem o membro';

  assert whatsapp_desfazer('5511999990000') = 'Mercado', 'desfazer não apagou';
  assert not exists (select 1 from gastos where id = novo), 'gasto ficou';
  assert whatsapp_desfazer('5511999990000') is null, 'desfez duas vezes';

  novo := whatsapp_lancar('5511999990000', jsonb_build_object('descricao', 'TV', 'valor', 1000, 'data', d, 'forma', 'cartao', 'cartao_id', k, 'parcelas', 4));
  assert (select count(*) from gastos where parcelamento_id = novo and criado_por = a and valor = 250) = 4, 'parcelado do bot errado';
  assert whatsapp_desfazer('5511999990000') = 'TV', 'desfazer parcelado';
  assert not exists (select 1 from gastos where parcelamento_id = novo), 'parcelas ficaram';

  begin
    perform whatsapp_lancar('5500000000000', '{"descricao":"x","valor":1,"forma":"debito"}');
    assert false, 'telefone sem vínculo lançou';
  exception when others then null;
  end;

  -- semana: só a 1ª parcela conta, membro que mais gastou
  insert into gastos (carteira_id, descricao, valor, data, forma, criado_por) values
    (c, 'Uber', 30, d - 1, 'debito', a), (c, 'Pão', 10, d - 2, 'debito', (select id from ids where chave = 'b')), (c, 'Antiga', 99, d - 10, 'debito', a);
  select * into r from resumos_semanais() s where s.carteira_id = c;
  assert r.total = 40 and r.anterior = 99 and r.quem = 'a' and r.valor_quem = 30 and r.membros_gastaram = 2, 'resumo semanal errado: ' || row_to_json(r)::text;
end $$;

rollback;

-- editar parcelamento
begin;
create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('a', teste_usuario('pa@t')), ('x', teste_usuario('px@t')), ('c', gen_random_uuid()), ('k', gen_random_uuid());
insert into carteiras (id, nome, criado_por) select (select id from ids where chave = 'c'), 'casa', (select id from ids where chave = 'a');
insert into carteira_membros (carteira_id, user_id, nome, papel) select (select id from ids where chave = 'c'), (select id from ids where chave = 'a'), 'a', 'dono';
insert into cartoes (id, carteira_id, nome, fechamento_dia, vencimento_dia) select (select id from ids where chave = 'k'), (select id from ids where chave = 'c'), 'Nu', 1, 8;

do $$
declare
  c uuid := (select id from ids where chave = 'c');
  k uuid := (select id from ids where chave = 'k');
  p uuid;
begin
  perform teste_como((select id from ids where chave = 'a'));
  p := criar_parcelamento(c, 'TV', null, null, 100, 4, '2026-01-10');

  perform editar_parcelamento(p, 'TV sala', null, k, 150, 6, '2026-02-10');
  assert (select count(*) from gastos where parcelamento_id = p) = 6, 'não criou as parcelas novas';
  assert (select descricao from gastos where parcelamento_id = p and parcela = 2) = 'TV sala (2/6)', 'descrição não refeita';
  assert (select data from gastos where parcelamento_id = p and parcela = 6) = '2026-07-10', 'data da última errada';
  assert not exists (select 1 from gastos where parcelamento_id = p and (valor <> 150 or forma <> 'cartao' or fatura_mes is null)), 'valor/cartão não aplicados';

  perform antecipar_parcelas(p, array(select id from gastos where parcelamento_id = p and parcela = 6), 120, '2026-03-01');
  perform editar_parcelamento(p, 'TV quarto', null, null, 150, 3, '2026-02-10');
  assert (select count(*) from gastos where parcelamento_id = p and parcela is not null) = 3, 'não apagou as que passaram';
  assert (select descricao from gastos where parcelamento_id = p and parcela is null) = 'TV quarto (antecipação de 1 parcela)', 'antecipação sem a nova descrição';
  assert not exists (select 1 from gastos where parcelamento_id = p and forma <> 'debito'), 'não voltou para débito';

  perform teste_como((select id from ids where chave = 'x'));
  begin
    perform editar_parcelamento(p, 'hack', null, null, 1, 1, '2026-01-01');
  exception when others then
    if sqlerrm <> 'Parcelamento não encontrado' then raise; end if;
  end;
  perform teste_como((select id from ids where chave = 'a'));
  assert (select descricao from parcelamentos where id = p) = 'TV quarto', 'outro usuário editou';
end $$;
rollback;
