-- Marcadores livres nos gastos (ex.: viagem, reforma), além da categoria.
alter table gastos add column if not exists tags text[] not null default '{}';
create index if not exists gastos_tags on gastos using gin (tags);

-- Mensagem do chat comentando um gasto.
alter table mensagens add column if not exists gasto_id uuid references gastos(id) on delete set null;
