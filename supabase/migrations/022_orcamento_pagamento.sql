-- Orçamento por forma de pagamento (ex.: mercado no cartão X).
-- reserva: o que falta gastar do limite entra nas saídas previstas do mês.
alter table orcamentos
  add column forma text check (forma in ('debito', 'cartao')),
  add column cartao_id uuid references cartoes on delete cascade,
  add column reserva boolean not null default false,
  add check ((forma = 'cartao') = (cartao_id is not null));

-- a mesma categoria pode ter um orçamento por forma de pagamento
alter table orcamentos drop constraint if exists orcamentos_carteira_id_categoria_id_key;
alter table orcamentos add constraint orcamentos_unico unique nulls not distinct (carteira_id, categoria_id, forma, cartao_id);
