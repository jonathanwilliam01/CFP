-- Conta fixa paga com o salário do mês anterior ao vencimento: conta nas contas do mês anterior
alter table recorrencias add column paga_mes_anterior boolean not null default false;
