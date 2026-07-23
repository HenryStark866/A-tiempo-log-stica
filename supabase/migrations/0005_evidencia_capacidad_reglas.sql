-- A TIEMPO LOGÍSTICA — evidencia de entrega, capacidad de mensajero, mínimo de recogida
-- Migración estrictamente aditiva: no modifica at_change_guide_status ni at_assign_courier
-- (ya en uso en producción). Todo campo nuevo es nullable o con default, cero riesgo de romper filas existentes.

-- ── Columnas nuevas ──────────────────────────────────────────────────────
alter table public.at_guides add column if not exists delivery_evidence_url text;
alter table public.at_guides add column if not exists delivery_signature_name text;

alter table public.at_profiles add column if not exists max_capacity int not null default 30;

alter table public.at_pickups add column if not exists package_count int;

comment on column public.at_guides.delivery_evidence_url is 'Foto de evidencia de entrega (bucket at-delivery-evidence)';
comment on column public.at_guides.delivery_signature_name is 'Nombre de quien recibió, capturado al confirmar entrega';
comment on column public.at_profiles.max_capacity is 'Capacidad máxima de paquetes en ruta simultáneos (mensajero)';
comment on column public.at_pickups.package_count is 'Paquetes contados por el operario al completar la recogida (regla: mínimo 5)';

-- ── Nuevo RPC: confirmar entrega con evidencia (no reemplaza at_change_guide_status) ──
-- Exige foto cuando la guía es contraentrega (COD); en el resto queda disponible pero opcional.
create or replace function public.at_confirm_delivery(
  p_guide_id uuid,
  p_evidence_url text default null,
  p_signature_name text default null,
  p_note text default null
)
returns public.at_guides
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
  v_role public.at_role := public.at_my_role();
begin
  if v_role is null or v_role in ('pendiente','cliente') then
    raise exception 'No autorizado';
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;

  if v_guide.status <> 'en_ruta' then
    raise exception 'Solo guías en ruta pueden marcarse como entregadas (estado actual: %)', v_guide.status;
  end if;

  if v_role = 'mensajero' and v_guide.courier_id is distinct from auth.uid() then
    raise exception 'Esta guía no está asignada a tu perfil';
  end if;

  if v_role not in ('mensajero','admin','coordinador') then
    raise exception 'Rol % no puede confirmar entregas', v_role;
  end if;

  if v_guide.is_cod and coalesce(length(trim(p_evidence_url)), 0) = 0 then
    raise exception 'Esta guía es contraentrega: la evidencia de entrega (foto) es obligatoria';
  end if;

  update public.at_guides g set
    status = 'entregada',
    delivered_at = now(),
    delivery_evidence_url = coalesce(p_evidence_url, g.delivery_evidence_url),
    delivery_signature_name = coalesce(p_signature_name, g.delivery_signature_name)
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, 'entregada', p_note, auth.uid());

  return v_guide;
end $$;

revoke all on function public.at_confirm_delivery(uuid, text, text, text) from public;
grant execute on function public.at_confirm_delivery(uuid, text, text, text) to authenticated;
revoke execute on function public.at_confirm_delivery(uuid, text, text, text) from anon;

-- ── Storage: bucket privado para evidencia de entrega ───────────────────
insert into storage.buckets (id, name, public)
values ('at-delivery-evidence', 'at-delivery-evidence', false)
on conflict (id) do nothing;

drop policy if exists "at staff sube evidencia de entrega" on storage.objects;
create policy "at staff sube evidencia de entrega"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'at-delivery-evidence'
  and public.at_is_staff()
);

drop policy if exists "at staff o cliente dueno ve evidencia" on storage.objects;
create policy "at staff o cliente dueno ve evidencia"
on storage.objects for select to authenticated
using (
  bucket_id = 'at-delivery-evidence'
  and (
    public.at_is_staff()
    or exists (
      select 1 from public.at_guides g
      where g.id::text = (storage.foldername(name))[1]
        and g.client_id = public.at_my_client()
    )
  )
);
