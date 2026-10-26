-- Categoria padrão Gasolina
insert into categorias (carteira_id, nome, icone, cor, tipo, ordem)
select c.id, 'Gasolina', 'local_gas_station', '#ea580c', 'gasto', 13
from carteiras c
where not exists (select 1 from categorias x where x.carteira_id = c.id and x.tipo = 'gasto' and lower(x.nome) = 'gasolina');

create or replace function criar_carteira(p_nome text, p_membro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  insert into carteiras (nome, criado_por) values (p_nome, auth.uid()) returning id into cid;
  insert into carteira_membros (carteira_id, user_id, nome, papel) values (cid, auth.uid(), p_membro, 'dono');
  insert into categorias (carteira_id, nome, icone, cor, tipo, ordem) values
    (cid, 'Mercado', 'shopping_cart', '#16a34a', 'gasto', 1),
    (cid, 'Alimentação', 'lunch_dining', '#f97316', 'gasto', 2),
    (cid, 'Transporte', 'directions_bus', '#0ea5e9', 'gasto', 3),
    (cid, 'Carro', 'directions_car', '#be123c', 'gasto', 12),
    (cid, 'Gasolina', 'local_gas_station', '#ea580c', 'gasto', 13),
    (cid, 'Casa', 'home', '#8b5cf6', 'gasto', 4),
    (cid, 'Contas', 'bolt', '#eab308', 'gasto', 5),
    (cid, 'Saúde', 'medication', '#ef4444', 'gasto', 6),
    (cid, 'Lazer', 'celebration', '#ec4899', 'gasto', 7),
    (cid, 'Compras', 'shopping_bag', '#14b8a6', 'gasto', 8),
    (cid, 'Educação', 'school', '#6366f1', 'gasto', 9),
    (cid, 'Pets', 'pets', '#a16207', 'gasto', 10),
    (cid, 'Assinaturas', 'subscriptions', '#475569', 'gasto', 11),
    (cid, 'Outros', 'inventory_2', '#64748b', 'gasto', 99),
    (cid, 'Salário', 'work', '#16a34a', 'entrada', 1),
    (cid, 'Extra', 'attach_money', '#0ea5e9', 'entrada', 2),
    (cid, 'Outros', 'inventory_2', '#64748b', 'entrada', 99);
  return cid;
end $$;
