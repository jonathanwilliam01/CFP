begin;
do $$ begin
  assert (select count(*) from pg_tables where schemaname = 'public') > 30, 'menos de 30 tabelas em public';
end $$;
rollback;
