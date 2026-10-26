-- Fotos de perfil: cada usuário grava só na pasta com o próprio id
insert into storage.buckets (id, name, public) values ('avatares', 'avatares', true) on conflict (id) do nothing;

create policy avatares_ler on storage.objects for select using (bucket_id = 'avatares');
create policy avatares_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatares_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatares_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
