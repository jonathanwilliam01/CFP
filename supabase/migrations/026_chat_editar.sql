-- Chat: autor edita (só o texto) ou apaga a própria mensagem.
alter table mensagens add column if not exists editado_em timestamptz;

revoke update on mensagens from anon, authenticated;
grant update (texto, editado_em) on mensagens to authenticated;

create policy mensagens_upd on mensagens for update
  using (user_id = auth.uid() and is_membro(carteira_id)) with check (user_id = auth.uid() and is_membro(carteira_id));
create policy mensagens_del on mensagens for delete using (user_id = auth.uid());
