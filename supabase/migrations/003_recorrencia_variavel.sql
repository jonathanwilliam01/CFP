-- Conta fixa de valor variável (ex.: luz): previsão pela média das últimas contas
alter table recorrencias add column variavel boolean not null default false;
