create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  raw_user_meta_data jsonb default '{}'
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema extensions;
create extension pgcrypto schema extensions;

create schema cron;
create function cron.schedule(p_nome text, p_agenda text, p_cmd text) returns bigint
  language sql as $$ select 1::bigint $$;
create function cron.unschedule(p_nome text) returns boolean
  language sql as $$ select true $$;

create schema net;
create table net._chamadas (id bigserial primary key, url text, body jsonb);
create function net.http_post(url text, body jsonb default '{}', headers jsonb default '{}') returns bigint
  language sql as $$ insert into net._chamadas (url, body) values (url, body) returning id $$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  allowed_mime_types text[],
  file_size_limit bigint
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  owner_id text
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

create publication supabase_realtime;

grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
