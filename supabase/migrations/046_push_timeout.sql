-- pg_net corta em 5 s; Edge Function fria + envio a vários aparelhos passava disso (vencimentos das 11h deu timeout)
create or replace function push_enviar(p_evento jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg push_config;
begin
  select * into cfg from push_config;
  if cfg.url is null then
    return;
  end if;
  perform net.http_post(
    url := cfg.url,
    body := p_evento,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cfg.segredo),
    timeout_milliseconds := 30000
  );
end $$;
revoke execute on function push_enviar from public, anon, authenticated;
