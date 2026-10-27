-- Foto de perfil visível aos outros membros (user_metadata só o próprio usuário lê)
alter table carteira_membros add column foto jsonb;

update carteira_membros m set foto = u.raw_user_meta_data -> 'foto'
from auth.users u where u.id = m.user_id;

create or replace function membro_foto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select raw_user_meta_data -> 'foto' into new.foto from auth.users where id = new.user_id;
  return new;
end $$;

create trigger carteira_membros_foto before insert on carteira_membros
for each row execute function membro_foto();

create or replace function usuario_foto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update carteira_membros set foto = new.raw_user_meta_data -> 'foto' where user_id = new.id;
  return null;
end $$;

create trigger usuario_foto after update of raw_user_meta_data on auth.users
for each row when (old.raw_user_meta_data -> 'foto' is distinct from new.raw_user_meta_data -> 'foto')
execute function usuario_foto();
