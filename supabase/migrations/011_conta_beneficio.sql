-- Conta fixa paga com benefício: desconta do saldo dele e não entra nas saídas do mês
alter table recorrencias add column beneficio_id uuid references beneficios on delete set null;
