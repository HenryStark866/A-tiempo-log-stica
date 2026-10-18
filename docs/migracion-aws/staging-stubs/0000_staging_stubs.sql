-- STUBS SOLO PARA STAGING LOCAL (no es producción, no va al repo).
-- Funciones que existen en producción pero que ninguna migración local crea.
-- Cuerpo vacío: solo permiten que los GRANT/REVOKE de 0100 encuentren la firma.
create or replace function public.at_evento_al_crear_pedido() returns trigger language plpgsql as $$ begin return new; end $$;
create or replace function public.at_franja_de_recogida() returns void language sql as $$ select $$;
create or replace function public.at_valida_hora_recogida(p time) returns void language sql as $$ select $$;

-- Tablas de encuestas: existen en producción, ninguna migración local las crea.
create table if not exists public.at_survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  client_id uuid,
  created_at timestamptz not null default now()
);
alter table public.at_survey_responses enable row level security;
create policy "cada quien ve lo suyo, ops ve todo" on public.at_survey_responses for select using (true);
create table if not exists public.at_survey_snooze (
  user_id uuid primary key,
  snoozed_until timestamptz
);
alter table public.at_survey_snooze enable row level security;
