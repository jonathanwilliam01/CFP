-- Acerto entre os membros (opcional por carteira): quem pagou cada gasto e se ele é dividido
alter table carteiras add column if not exists divisao boolean not null default false;
grant update (nome, inicio, divisao) on carteiras to authenticated;
alter table gastos add column if not exists pago_por uuid references auth.users on delete set null;
alter table gastos add column if not exists dividido boolean not null default true;

-- Acerto feito no mês: "de" pagou "valor" para "para"
create table acertos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  mes date not null,
  de uuid not null references auth.users on delete cascade,
  para uuid not null references auth.users on delete cascade,
  valor numeric(12,2) not null,
  criado_em timestamptz not null default now()
);

-- Valores que alguém vai devolver
create table receber (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  descricao text not null,
  pessoa text,
  valor numeric(12,2) not null,
  data date not null default current_date,
  recebido_em date,
  criado_em timestamptz not null default now()
);

-- Dívidas e financiamentos; ligada a uma conta fixa, as parcelas pagas vêm dos pagamentos dela
create table dividas (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  descricao text not null,
  credor text,
  valor_parcela numeric(12,2) not null,
  num_parcelas int not null check (num_parcelas > 0),
  pagas int not null default 0,
  inicio date not null,
  recorrencia_id uuid references recorrencias on delete set null,
  criado_em timestamptz not null default now()
);

-- Desafio: gastar no máximo "limite" (0 = nada) na categoria ou no termo da descrição entre inicio e fim
create table desafios (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  descricao text not null,
  categoria_id uuid references categorias on delete set null,
  termo text,
  limite numeric(12,2) not null default 0,
  inicio date not null,
  fim date not null,
  criado_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['acertos', 'receber', 'dividas', 'desafios'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (is_membro(carteira_id)) with check (is_membro(carteira_id))', t || '_rw', t);
  end loop;
end $$;

alter publication supabase_realtime add table acertos, receber, dividas, desafios;

-- Cofrinho da reserva de emergência e plano que se repete todo ano (13º, férias, IR)
alter table cofrinhos add column if not exists emergencia boolean not null default false;
alter table planos add column if not exists anual boolean not null default false;

-- Lembrete à noite quando a carteira não teve gasto lançado no dia
alter table carteira_membros add column if not exists lembrete boolean not null default true;
grant update (lembrete) on carteira_membros to authenticated;

create or replace function lembretes_lancamento() returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct m.user_id from carteira_membros m
  where m.lembrete
    and not exists (
      select 1 from gastos g
      where g.carteira_id = m.carteira_id
        and (g.criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    );
$$;
revoke execute on function lembretes_lancamento from public, anon, authenticated;

-- 21h de Brasília
select cron.schedule('cfp-lembrete', '0 0 * * *', $$select push_enviar('{"tipo":"lembrete"}'::jsonb)$$);

-- Antecipar/quitar parcelas: as escolhidas viram um gasto só (sem número de parcela) com o valor pago, na data informada.
-- Insere antes de apagar: o trigger gastos_parcela_excluida apagaria o parcelamento sem parcelas.
create or replace function antecipar_parcelas(p_parcelamento uuid, p_ids uuid[], p_valor numeric, p_data date) returns void
language plpgsql set search_path = public as $$
declare
  g gastos;
  pc parcelamentos;
  n int;
begin
  select * into pc from parcelamentos where id = p_parcelamento;
  select * into g from gastos where parcelamento_id = p_parcelamento and id = any(p_ids) order by parcela desc limit 1;
  get diagnostics n = row_count;
  if pc.id is null or n = 0 then raise exception 'Parcelas não encontradas'; end if;
  select count(*) into n from gastos where parcelamento_id = p_parcelamento and id = any(p_ids);
  insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, parcelamento_id, parcela, tags)
  values (g.carteira_id, pc.descricao || ' (antecipação de ' || n || ' parcela' || case when n > 1 then 's' else '' end || ')',
    g.categoria_id, p_valor, p_data, g.forma, g.cartao_id, p_parcelamento, null, g.tags);
  delete from gastos where parcelamento_id = p_parcelamento and id = any(p_ids);
end $$;
grant execute on function antecipar_parcelas to authenticated;
