-- Mês em que a carteira começou a ser usada: meses anteriores ficam fora da navegação e das comparações.
alter table carteiras add column if not exists inicio date;
grant update (nome, inicio) on carteiras to authenticated;
