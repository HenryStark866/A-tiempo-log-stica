-- A TIEMPO LOGÍSTICA — la cuota mensual de administración de la plataforma.
--
-- Cada comercio paga 10 USD al mes por usar YAM, aparte de sus domicilios. Se
-- cobra en su misma factura: un comercio no debería recibir dos cuentas
-- nuestras por dos conceptos distintos.
--
-- ── Por qué esto NO empieza a cobrar solo ────────────────────────────────
--
-- La cuota está en dólares y las facturas van en pesos. Convertir exige una
-- tasa, y la tasa se mueve todos los días. Poner aquí un número inventado
-- —4.000, 4.200— significaría cobrarle a nueve negocios reales una cifra que
-- salió de una suposición mía.
--
-- Así que la tasa nace vacía y la función NO cobra hasta que un administrador
-- la fije. Mientras tanto avisa, una vez por periodo, para que no se olvide.
-- Es preferible una cuota sin cobrar y avisada, a nueve cobros mal hechos.

create table if not exists public.at_saas_config (
  id              boolean primary key default true check (id),
  usd_mensual     numeric(10,2) not null default 10,
  -- Cuántos pesos vale un dólar para efectos de esta cuota. Null = sin fijar.
  trm_cop         numeric(12,2),
  activa          boolean not null default true,
  actualizado_en  timestamptz,
  actualizado_por uuid references public.at_profiles(id) on delete set null
);

insert into public.at_saas_config (id) values (true) on conflict (id) do nothing;

alter table public.at_saas_config enable row level security;

drop policy if exists "todos leen la cuota" on public.at_saas_config;
create policy "todos leen la cuota" on public.at_saas_config
  for select to authenticated using (true);

drop policy if exists "solo admin cambia la cuota" on public.at_saas_config;
create policy "solo admin cambia la cuota" on public.at_saas_config
  for all to authenticated
  using (public.at_my_role() = 'admin') with check (public.at_my_role() = 'admin');

comment on table public.at_saas_config is
  'La cuota mensual de administración de YAM. Una sola fila. Sin trm_cop no se cobra nada.';

-- ── Lo que ya se le cobró a cada quien ───────────────────────────────────
-- La clave única es lo que hace que esto se pueda ejecutar mil veces sin
-- cobrar dos veces. Un cobro repetido en una factura es de las cosas que más
-- rápido rompen la confianza de un cliente.
create table if not exists public.at_saas_charges (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.at_clients(id) on delete cascade,
  periodo     text not null,
  usd         numeric(10,2) not null,
  trm         numeric(12,2) not null,
  total_cop   numeric(14,2) not null,
  invoice_id  uuid references public.at_invoices(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (client_id, periodo)
);

alter table public.at_saas_charges enable row level security;

drop policy if exists "ops o dueño lee sus cuotas" on public.at_saas_charges;
create policy "ops o dueño lee sus cuotas" on public.at_saas_charges
  for select to authenticated
  using (public.at_is_ops() or (client_id = public.at_my_client() and public.at_soy_dueno()));

comment on table public.at_saas_charges is
  'Una fila por comercio y mes. La clave única (comercio, periodo) es lo que impide cobrar dos veces.';

-- ── El cobro ─────────────────────────────────────────────────────────────
create or replace function public.at_cobrar_cuota_saas(p_periodo text default null)
returns json
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_cfg     public.at_saas_config;
  v_periodo text := coalesce(p_periodo, to_char(current_date, 'YYYY-MM'));
  v_cli     record;
  v_inv     public.at_invoices;
  v_total   numeric(14,2);
  v_hechos  int := 0;
  v_admin   record;
begin
  select * into v_cfg from public.at_saas_config where id;

  if not found or not v_cfg.activa then
    return json_build_object('cobrados', 0, 'motivo', 'la cuota está desactivada');
  end if;

  -- Sin tasa no se inventa una. Se avisa y se sale.
  if v_cfg.trm_cop is null or v_cfg.trm_cop <= 0 then
    for v_admin in select id from public.at_profiles where role='admin' and active loop
      insert into public.at_notifications (user_id, title, body, link)
      select v_admin.id, 'Falta la tasa para cobrar la cuota de YAM',
             'La cuota de ' || v_cfg.usd_mensual || ' USD del periodo ' || v_periodo ||
             ' no se cobró porque no hay tasa de cambio configurada. Fíjala y se cobra sola.',
             '/facturacion'
      where not exists (
        select 1 from public.at_notifications n
        where n.user_id = v_admin.id
          and n.title = 'Falta la tasa para cobrar la cuota de YAM'
          and n.created_at > now() - interval '20 days');
    end loop;
    return json_build_object('cobrados', 0, 'motivo', 'sin tasa de cambio configurada');
  end if;

  v_total := round(v_cfg.usd_mensual * v_cfg.trm_cop, 2);

  for v_cli in select id, business_name from public.at_clients where active loop
    -- Ya cobrado este periodo: no se toca. Es la garantía de idempotencia.
    if exists (select 1 from public.at_saas_charges
               where client_id = v_cli.id and periodo = v_periodo) then
      continue;
    end if;

    -- Se engancha a su factura en borrador, que es la que va acumulando. Si no
    -- tiene ninguna abierta, se le crea: la cuota se debe igual aunque este mes
    -- no haya despachado un solo pedido.
    select * into v_inv from public.at_invoices
    where client_id = v_cli.id and status = 'borrador'
    order by created_at limit 1;

    if not found then
      insert into public.at_invoices (client_id, period_start, period_end)
      values (v_cli.id, current_date, current_date)
      returning * into v_inv;
    end if;

    insert into public.at_invoice_items (invoice_id, description, amount)
    values (v_inv.id,
            'Cuota de administración YAM — ' || v_periodo ||
            ' (' || v_cfg.usd_mensual || ' USD a ' || v_cfg.trm_cop || ')',
            v_total);

    insert into public.at_saas_charges (client_id, periodo, usd, trm, total_cop, invoice_id)
    values (v_cli.id, v_periodo, v_cfg.usd_mensual, v_cfg.trm_cop, v_total, v_inv.id);

    update public.at_invoices i set
      subtotal = (select coalesce(sum(amount),0) from public.at_invoice_items where invoice_id = i.id),
      total    = (select coalesce(sum(amount),0) from public.at_invoice_items where invoice_id = i.id)
    where i.id = v_inv.id;

    v_hechos := v_hechos + 1;
  end loop;

  return json_build_object('cobrados', v_hechos, 'periodo', v_periodo, 'valor_cop', v_total);
end $function$;

comment on function public.at_cobrar_cuota_saas(text) is
  'Agrega la cuota mensual de YAM a la factura de cada comercio activo. Se puede correr varias veces: no cobra dos veces el mismo periodo.';

revoke execute on function public.at_cobrar_cuota_saas(text) from public, anon, authenticated;

-- ── Que la fije el admin sin entrar a la base ────────────────────────────
create or replace function public.at_fijar_cuota_saas(
  p_usd numeric default null,
  p_trm numeric default null,
  p_activa boolean default null
)
returns public.at_saas_config
language plpgsql security definer set search_path = public
as $function$
declare v_out public.at_saas_config;
begin
  if public.at_my_role() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar la cuota';
  end if;
  if p_usd is not null and p_usd < 0 then
    raise exception 'La cuota no puede ser negativa';
  end if;
  if p_trm is not null and p_trm <= 0 then
    raise exception 'La tasa de cambio tiene que ser mayor que cero';
  end if;

  update public.at_saas_config set
    usd_mensual     = coalesce(p_usd, usd_mensual),
    trm_cop         = coalesce(p_trm, trm_cop),
    activa          = coalesce(p_activa, activa),
    actualizado_en  = now(),
    actualizado_por = auth.uid()
  where id
  returning * into v_out;

  return v_out;
end $function$;

revoke execute on function public.at_fijar_cuota_saas(numeric, numeric, boolean) from public, anon;
grant execute on function public.at_fijar_cuota_saas(numeric, numeric, boolean) to authenticated;

-- ── Todos los días 1, a las 6 de la mañana de Bogotá ─────────────────────
-- Diario y no mensual sería más seguro contra un día que el cron falle, pero
-- la clave única ya cubre eso: si el día 1 no corrió, el 2 cobra igual y no
-- duplica. Se deja mensual y se confía en la idempotencia.
select cron.unschedule('at-cuota-saas')
where exists (select 1 from cron.job where jobname = 'at-cuota-saas');

select cron.schedule('at-cuota-saas', '0 11 1 * *',
  $$ select public.at_cobrar_cuota_saas() $$);
