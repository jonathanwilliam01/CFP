create function teste_usuario(p_email text) returns uuid language sql as
  $$ insert into auth.users (email) values (p_email) returning id $$;

create function teste_como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
  set role authenticated;
end $$;

create function teste_sistema() returns void language plpgsql as $$
begin
  reset role;
end $$;
