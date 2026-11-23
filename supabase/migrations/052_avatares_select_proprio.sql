-- Upload com upsert precisa de SELECT na própria pasta; URL pública não depende de policy
drop policy if exists avatares_ler_proprio on storage.objects;
create policy avatares_ler_proprio on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
