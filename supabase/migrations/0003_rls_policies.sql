-- A TIEMPO LOGÍSTICA — Row Level Security

alter table public.at_clients enable row level security;
alter table public.at_zones enable row level security;
alter table public.at_profiles enable row level security;
alter table public.at_pickups enable row level security;
alter table public.at_guides enable row level security;
alter table public.at_guide_events enable row level security;
alter table public.at_settlements enable row level security;
alter table public.at_invoices enable row level security;
alter table public.at_invoice_items enable row level security;

-- ── Perfiles ─────────────────────────────────────────────────────────────
create policy "perfil propio o staff lee" on public.at_profiles
  for select to authenticated
  using (id = auth.uid() or public.at_is_staff());

create policy "usuario edita su perfil (trigger evita escalar rol)" on public.at_profiles
  for update to authenticated
  using (id = auth.uid() or public.at_my_role() = 'admin')
  with check (id = auth.uid() or public.at_my_role() = 'admin');

-- ── Clientes ─────────────────────────────────────────────────────────────
create policy "staff lee clientes" on public.at_clients
  for select to authenticated
  using (public.at_is_staff() or id = public.at_my_client());

create policy "ops administra clientes" on public.at_clients
  for all to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

-- ── Zonas ────────────────────────────────────────────────────────────────
create policy "autenticados leen zonas" on public.at_zones
  for select to authenticated using (true);

create policy "ops administra zonas" on public.at_zones
  for all to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

-- ── Recogidas ────────────────────────────────────────────────────────────
create policy "staff o dueño lee recogidas" on public.at_pickups
  for select to authenticated
  using (public.at_is_staff() or client_id = public.at_my_client());

create policy "cliente solicita recogida propia" on public.at_pickups
  for insert to authenticated
  with check (
    (public.at_my_role() = 'cliente' and client_id = public.at_my_client() and status = 'pendiente')
    or public.at_is_staff()
  );

create policy "staff gestiona recogidas" on public.at_pickups
  for update to authenticated
  using (public.at_is_staff()) with check (public.at_is_staff());

-- ── Guías ────────────────────────────────────────────────────────────────
create policy "staff o dueño lee guías" on public.at_guides
  for select to authenticated
  using (public.at_is_staff() or client_id = public.at_my_client());

create policy "staff o cliente crea guías propias" on public.at_guides
  for insert to authenticated
  with check (
    public.at_is_staff()
    or (public.at_my_role() = 'cliente' and client_id = public.at_my_client() and status = 'creada')
  );

-- Datos de la guía editables solo por ops (los estados van por RPC security definer)
create policy "ops edita guías" on public.at_guides
  for update to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

-- ── Eventos de guía (solo lectura; inserción vía RPC) ────────────────────
create policy "staff o dueño lee eventos" on public.at_guide_events
  for select to authenticated
  using (
    public.at_is_staff()
    or exists (select 1 from public.at_guides g where g.id = guide_id and g.client_id = public.at_my_client())
  );

-- ── Cierres de caja ──────────────────────────────────────────────────────
create policy "ops o mensajero dueño lee cierres" on public.at_settlements
  for select to authenticated
  using (public.at_is_ops() or courier_id = auth.uid());

-- ── Facturas ─────────────────────────────────────────────────────────────
create policy "ops o cliente dueño lee facturas" on public.at_invoices
  for select to authenticated
  using (public.at_is_ops() or client_id = public.at_my_client());

create policy "ops actualiza facturas" on public.at_invoices
  for update to authenticated
  using (public.at_is_ops()) with check (public.at_is_ops());

create policy "ops o cliente dueño lee items" on public.at_invoice_items
  for select to authenticated
  using (
    public.at_is_ops()
    or exists (select 1 from public.at_invoices i where i.id = invoice_id and i.client_id = public.at_my_client())
  );
