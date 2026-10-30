-- Gasto confirmado como não duplicado: o par em que os dois estão marcados não é mais apontado.
alter table gastos add column if not exists nao_duplicado boolean not null default false;
