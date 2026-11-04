-- Parcela de parcelamento fora do cartão (boleto/débito) aparece em Contas e pode ser marcada como paga (ref_id = gasto da parcela)
alter table pagamentos drop constraint if exists pagamentos_tipo_check;
alter table pagamentos add constraint pagamentos_tipo_check check (tipo in ('recorrencia', 'fatura', 'parcela'));
