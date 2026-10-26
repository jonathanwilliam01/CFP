-- Conta fixa cobrada no cartão: entra na fatura e é paga junto com ela
alter table recorrencias add column cartao_id uuid references cartoes on delete set null;
