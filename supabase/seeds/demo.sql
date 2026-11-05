-- Carteira de demonstração: Ana (ana@demo.cfp) e Bruno (bruno@demo.cfp), senha Demo@1234.
-- Rodar no SQL Editor do Supabase. Pode rodar de novo: apaga os dois usuários e recria tudo
-- com datas relativas a hoje (3 meses de histórico + mês atual).

begin;

-- sem push para os aparelhos durante a carga
select set_config('cfp.sem_push', '1', true);

delete from auth.users where email in ('ana@demo.cfp', 'bruno@demo.cfp');

do $$
declare
  ana uuid := gen_random_uuid();
  bruno uuid := gen_random_uuid();
  cid uuid;
  mes date := date_trunc('month', current_date)::date;
  ini date := (date_trunc('month', current_date) - interval '3 months')::date;
  nu uuid; itau uuid; vr uuid;
  r record;
  d date;
  m date;
  pid uuid;
  reserva uuid; viagem uuid;
  cat jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
    extensions.crypt('Demo@1234', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', u.nome), now(), now(), '', '', '', ''
  from (values (ana, 'ana@demo.cfp', 'Ana'), (bruno, 'bruno@demo.cfp', 'Bruno')) u(id, email, nome);

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    'email', now(), now(), now()
  from auth.users u where u.id in (ana, bruno);

  insert into carteiras (nome, criado_por, inicio, divisao, meta_sobra, criado_em)
  values ('Casa (demo)', ana, ini, true, 15, ini) returning id into cid;
  insert into carteira_membros (carteira_id, user_id, nome, papel) values (cid, ana, 'Ana', 'dono'), (cid, bruno, 'Bruno', 'membro');

  insert into categorias (carteira_id, nome, icone, cor, tipo, ordem) values
    (cid, 'Mercado', 'shopping_cart', '#16a34a', 'gasto', 1),
    (cid, 'Alimentação', 'lunch_dining', '#f97316', 'gasto', 2),
    (cid, 'Transporte', 'directions_bus', '#0ea5e9', 'gasto', 3),
    (cid, 'Casa', 'home', '#8b5cf6', 'gasto', 4),
    (cid, 'Contas', 'bolt', '#eab308', 'gasto', 5),
    (cid, 'Saúde', 'medication', '#ef4444', 'gasto', 6),
    (cid, 'Lazer', 'celebration', '#ec4899', 'gasto', 7),
    (cid, 'Compras', 'shopping_bag', '#14b8a6', 'gasto', 8),
    (cid, 'Educação', 'school', '#6366f1', 'gasto', 9),
    (cid, 'Pets', 'pets', '#a16207', 'gasto', 10),
    (cid, 'Assinaturas', 'subscriptions', '#475569', 'gasto', 11),
    (cid, 'Carro', 'directions_car', '#be123c', 'gasto', 12),
    (cid, 'Gasolina', 'local_gas_station', '#ea580c', 'gasto', 13),
    (cid, 'Outros', 'inventory_2', '#64748b', 'gasto', 99),
    (cid, 'Salário', 'work', '#16a34a', 'entrada', 1),
    (cid, 'Extra', 'attach_money', '#0ea5e9', 'entrada', 2),
    (cid, 'Outros', 'inventory_2', '#64748b', 'entrada', 99);
  select jsonb_object_agg(nome || ':' || tipo, id) into cat from categorias where carteira_id = cid;

  insert into cartoes (carteira_id, nome, fechamento_dia, vencimento_dia, fecha_dias, limite, cor, padrao)
  values (cid, 'Nubank', 3, 10, 7, 6000, '#8b5cf6', true) returning id into nu;
  insert into cartoes (carteira_id, nome, fechamento_dia, vencimento_dia, limite, cor)
  values (cid, 'Itaú', 25, 5, 4000, '#f97316') returning id into itau;
  insert into beneficios (carteira_id, nome, valor_mensal, dia_credito, acumula, inicio)
  values (cid, 'VR', 800, 1, true, ini) returning id into vr;

  insert into recorrencias (carteira_id, tipo, descricao, categoria_id, valor, dia, inicio, dia_util, variavel, cartao_id) values
    (cid, 'entrada', 'Salário Ana', (cat->>'Salário:entrada')::uuid, 4200, 5, ini, true, false, null),
    (cid, 'entrada', 'Salário Bruno', (cat->>'Salário:entrada')::uuid, 3800, 20, ini, false, false, null),
    (cid, 'conta', 'Aluguel', (cat->>'Casa:gasto')::uuid, 1600, 10, ini, false, false, null),
    (cid, 'conta', 'Condomínio', (cat->>'Casa:gasto')::uuid, 450, 8, ini, false, false, null),
    (cid, 'conta', 'Luz', (cat->>'Contas:gasto')::uuid, 190, 15, ini, false, true, null),
    (cid, 'conta', 'Internet', (cat->>'Contas:gasto')::uuid, 109.90, 20, ini, false, false, null),
    (cid, 'conta', 'Plano de saúde', (cat->>'Saúde:gasto')::uuid, 389, 12, ini, false, false, null),
    (cid, 'conta', 'Streaming', (cat->>'Assinaturas:gasto')::uuid, 55.90, 12, ini, false, false, nu),
    (cid, 'conta', 'Academia', (cat->>'Saúde:gasto')::uuid, 99.90, 5, ini, false, false, itau);

  -- pagamentos: meses passados todos pagos; no mês atual, o que já venceu (luz variável com valor do mês)
  for r in select id, tipo, valor, dia, variavel from recorrencias where carteira_id = cid and cartao_id is null loop
    for m in select generate_series(ini, mes, interval '1 month')::date loop
      d := m + least(r.dia, 28) - 1;
      continue when d > current_date;
      insert into pagamentos (carteira_id, tipo, ref_id, mes, valor, pago_em, criado_por)
      values (cid, 'recorrencia', r.id, m, case when r.variavel then round((r.valor * (0.85 + random() * 0.3))::numeric, 2) else r.valor end,
        d, case when r.tipo = 'entrada' then bruno else ana end);
    end loop;
  end loop;

  perform setseed(0.42);

  -- dia a dia: cada modelo tem chance de aparecer em cada dia
  for d in select generate_series(ini, current_date, interval '1 day')::date loop
    for r in select * from (values
      ('Mercado', 'Mercado', 60, 260, 'cartao', 0.18),
      ('Padaria', 'Alimentação', 8, 35, 'debito', 0.35),
      ('Almoço', 'Alimentação', 25, 60, 'beneficio', 0.45),
      ('iFood', 'Alimentação', 35, 90, 'cartao', 0.12),
      ('Uber', 'Transporte', 12, 45, 'cartao', 0.15),
      ('Posto Shell', 'Gasolina', 120, 220, 'cartao', 0.06),
      ('Farmácia', 'Saúde', 20, 120, 'debito', 0.07),
      ('Cinema', 'Lazer', 40, 90, 'cartao', 0.04),
      ('Pet shop', 'Pets', 50, 180, 'cartao', 0.04),
      ('Amazon', 'Compras', 40, 250, 'cartao', 0.05)
    ) x(descricao, categoria, minimo, maximo, forma, chance) loop
      continue when random() > r.chance;
      insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, beneficio_id, criado_por, pago_por)
      select cid, r.descricao, (cat->>(r.categoria || ':gasto'))::uuid, round((r.minimo + random() * (r.maximo - r.minimo))::numeric, 2), d,
        r.forma, case when r.forma = 'cartao' then (case when random() < 0.7 then nu else itau end) end,
        case when r.forma = 'beneficio' then vr end, x, x
      from (select case when random() < 0.55 then ana else bruno end x) quem;
    end loop;
  end loop;

  -- compra parcelada em 10x no Itaú, começou há 2 meses
  insert into parcelamentos (carteira_id, descricao, categoria_id, cartao_id, valor_parcela, num_parcelas, primeira_data, criado_por)
  values (cid, 'Geladeira', (cat->>'Casa:gasto')::uuid, itau, 349.90, 10, (mes - interval '2 months')::date + 14, ana) returning id into pid;
  insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, parcelamento_id, parcela, criado_por)
  select cid, 'Geladeira (' || i || '/10)', (cat->>'Casa:gasto')::uuid, 349.90, ((mes - interval '2 months')::date + 14 + (i - 1) * interval '1 month')::date,
    'cartao', itau, pid, i, ana
  from generate_series(1, 10) i;

  insert into entradas (carteira_id, descricao, categoria_id, valor, data, criado_por)
  values (cid, 'Venda da bicicleta', (cat->>'Extra:entrada')::uuid, 650, (mes - interval '1 month')::date + 17, bruno),
    (cid, 'Freela de design', (cat->>'Extra:entrada')::uuid, 900, least(current_date, mes + 3), ana);

  -- faturas já vencidas: pagas com o total das compras + fixas no cartão
  insert into pagamentos (carteira_id, tipo, ref_id, mes, valor, pago_em, criado_por)
  select cid, 'fatura', g.cartao_id, g.fatura_mes,
    sum(g.valor) + coalesce((select sum(valor) from recorrencias where cartao_id = g.cartao_id), 0),
    g.fatura_mes + c.vencimento_dia - 1, ana
  from gastos g join cartoes c on c.id = g.cartao_id
  where g.carteira_id = cid and g.fatura_mes + c.vencimento_dia - 1 < current_date
  group by g.cartao_id, g.fatura_mes, c.vencimento_dia;

  insert into orcamentos (carteira_id, categoria_id, valor, alerta_pct, reserva) values
    (cid, (cat->>'Mercado:gasto')::uuid, 1200, 80, true),
    (cid, (cat->>'Alimentação:gasto')::uuid, 700, 80, false),
    (cid, (cat->>'Lazer:gasto')::uuid, 300, 80, false);

  insert into cofrinhos (carteira_id, nome, meta, icone, cor, emergencia, criado_em)
  values (cid, 'Reserva de emergência', 18000, 'health_and_safety', '#10b981', true, ini) returning id into reserva;
  insert into cofrinhos (carteira_id, nome, meta, prazo, icone, cor, deposito, frequencia, criado_em)
  values (cid, 'Viagem de férias', 6000, (mes + interval '8 months')::date, 'flight', '#0ea5e9', 400, 'mes', ini) returning id into viagem;
  insert into cofrinho_movs (carteira_id, cofrinho_id, valor, data, descricao, criado_por)
  select cid, reserva, 500, s::date + 6, 'Depósito do mês', ana from generate_series(ini, mes, interval '1 month') s
  union all
  select cid, viagem, 400, s::date + 21, 'Depósito do mês', bruno from generate_series(ini, (mes - interval '1 month')::date, interval '1 month') s;

  insert into contas_bancarias (carteira_id, nome, saldo, atualizado_em, cor) values
    (cid, 'Conta Nubank', 2350.40, current_date - 2, '#8b5cf6'),
    (cid, 'Conta Itaú', 980.15, current_date - 9, '#f97316');

  insert into planos (carteira_id, tipo, descricao, valor, mes, anual) values
    (cid, 'saida', 'IPVA', 1850, make_date(extract(year from mes)::int + 1, 1, 1), true),
    (cid, 'entrada', '13º Ana', 3900, make_date(extract(year from mes)::int, 12, 1), true),
    (cid, 'saida', 'Presentes de Natal', 800, make_date(extract(year from mes)::int, 12, 1), false);
end $$;

commit;
