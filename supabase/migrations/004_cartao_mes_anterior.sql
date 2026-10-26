-- Fatura paga com o salário do mês anterior ao vencimento: conta nas contas do mês anterior
alter table cartoes add column paga_mes_anterior boolean not null default false;
