-- A TIEMPO LOGÍSTICA — esquema núcleo (prefijo at_ para convivir con otras tablas del proyecto)

create extension if not exists pgcrypto with schema extensions;

-- ── Enums ────────────────────────────────────────────────────────────────
create type public.at_role as enum ('admin','coordinador','operario','mensajero','cliente','pendiente');

create type public.at_guide_status as enum (
  'creada',        -- Guía registrada, pendiente de recogida (Fase 1)
  'recogida',      -- Digitalizada en el punto de recogida (Fase 1.1)
  'en_cedi',       -- Validada en bodega (Fase 2.1)
  'zonificada',    -- Picking hecho, asignada a mensajero/zona (Fase 3)
  'en_ruta',       -- Mensajero en recorrido (Fase 4)
  'entregada',     -- Entrega efectiva + recaudo (Fase 6)
  'novedad',       -- Intento fallido (Fase 5 = NO)
  'reprogramada',  -- 1er fallo: reintento programado (Fase 9)
  'en_devolucion', -- 2do fallo: logística inversa (Fase 10)
  'devuelta',      -- Retornada al e-commerce, fin de orden
  'cancelada'
);

create type public.at_pickup_status as enum ('pendiente','asignada','completada','cancelada');
create type public.at_settlement_status as enum ('pendiente','consignado','conciliado','con_diferencia');
create type public.at_invoice_status as enum ('borrador','emitida','pagada','anulada');
create type public.at_billing_cycle as enum ('quincenal','mensual');

-- ── Tablas maestras ──────────────────────────────────────────────────────
create table public.at_clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  nit text,
  contact_name text,
  email text,
  phone text,
  address text,
  billing_cycle public.at_billing_cycle not null default 'quincenal',
  delivery_rate numeric(12,2) not null default 6000, -- tarifa por entrega exitosa (COP)
  return_rate numeric(12,2) not null default 3000,   -- tarifa por devolución (logística inversa)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.at_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,           -- Norte, Sur, Poblado, Laureles, Centro, Occidente…
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.at_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.at_role not null default 'pendiente',
  client_id uuid references public.at_clients(id) on delete set null,
  zone_id uuid references public.at_zones(id) on delete set null, -- zona habitual del mensajero
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Recogidas (Fase 1) ───────────────────────────────────────────────────
create table public.at_pickups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.at_clients(id) on delete cascade,
  scheduled_date date not null default current_date,
  address text not null,
  contact_name text,
  contact_phone text,
  notes text,
  status public.at_pickup_status not null default 'pendiente',
  operator_id uuid references public.at_profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.at_profiles(id) on delete set null
);

-- ── Guías (núcleo de la trazabilidad) ────────────────────────────────────
create sequence public.at_guide_number_seq start 100001;

create table public.at_guides (
  id uuid primary key default gen_random_uuid(),
  guide_number text not null unique default ('ATL-' || nextval('public.at_guide_number_seq')::text),
  client_id uuid not null references public.at_clients(id) on delete restrict,
  pickup_id uuid references public.at_pickups(id) on delete set null,
  recipient_name text not null,
  recipient_phone text,
  recipient_address text not null,
  recipient_city text not null default 'Medellín',
  zone_id uuid references public.at_zones(id) on delete set null,
  declared_value numeric(12,2) not null default 0,
  is_cod boolean not null default false,          -- pago contraentrega
  cod_amount numeric(12,2) not null default 0,    -- valor a recaudar
  status public.at_guide_status not null default 'creada',
  delivery_attempts int not null default 0,       -- máx. 2 intentos (Fase 9)
  courier_id uuid references public.at_profiles(id) on delete set null,
  settlement_id uuid,                             -- FK diferida a at_settlements
  invoice_id uuid,                                -- FK diferida a at_invoices
  picked_up_at timestamptz,
  received_cedi_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  notes text,
  created_by uuid references public.at_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Trazabilidad de eventos ──────────────────────────────────────────────
create table public.at_guide_events (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.at_guides(id) on delete cascade,
  status public.at_guide_status not null,
  note text,
  actor_id uuid references public.at_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Cierre de caja / consignación (Fase 7) ───────────────────────────────
create table public.at_settlements (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.at_profiles(id) on delete restrict,
  settlement_date date not null default current_date,
  expected_amount numeric(12,2) not null default 0,
  deposited_amount numeric(12,2),
  bank_name text default 'Bancolombia',
  bank_reference text,
  status public.at_settlement_status not null default 'pendiente',
  notes text,
  reconciled_by uuid references public.at_profiles(id) on delete set null,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (courier_id, settlement_date)
);

-- ── Facturación (Cierre Operativo) ───────────────────────────────────────
create table public.at_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('FAC-' || nextval('public.at_guide_number_seq')::text),
  client_id uuid not null references public.at_clients(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status public.at_invoice_status not null default 'borrador',
  issued_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_by uuid references public.at_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.at_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.at_invoices(id) on delete cascade,
  guide_id uuid unique references public.at_guides(id) on delete set null, -- unique: una guía se factura una sola vez
  description text not null,
  amount numeric(12,2) not null default 0
);

-- FKs diferidas de at_guides
alter table public.at_guides
  add constraint at_guides_settlement_fk foreign key (settlement_id) references public.at_settlements(id) on delete set null,
  add constraint at_guides_invoice_fk foreign key (invoice_id) references public.at_invoices(id) on delete set null;

-- ── Índices ──────────────────────────────────────────────────────────────
create index at_guides_client_idx on public.at_guides (client_id);
create index at_guides_status_idx on public.at_guides (status);
create index at_guides_courier_idx on public.at_guides (courier_id);
create index at_guides_zone_idx on public.at_guides (zone_id);
create index at_guides_settlement_idx on public.at_guides (settlement_id);
create index at_guides_invoice_idx on public.at_guides (invoice_id);
create index at_guide_events_guide_idx on public.at_guide_events (guide_id);
create index at_pickups_client_idx on public.at_pickups (client_id);
create index at_pickups_status_idx on public.at_pickups (status);
create index at_settlements_courier_idx on public.at_settlements (courier_id);
create index at_invoices_client_idx on public.at_invoices (client_id);
create index at_invoice_items_invoice_idx on public.at_invoice_items (invoice_id);
create index at_profiles_role_idx on public.at_profiles (role);
create index at_profiles_client_idx on public.at_profiles (client_id);
