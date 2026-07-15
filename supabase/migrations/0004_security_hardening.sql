-- A TIEMPO LOGÍSTICA — endurecimiento de permisos sobre funciones

-- search_path fijo en funciones que no lo tenían
alter function public.at_touch_updated_at() set search_path = public;
alter function public.at_valid_transition(public.at_guide_status, public.at_guide_status) set search_path = public;

-- Las funciones de trigger no deben ser invocables vía API REST
revoke execute on function public.at_touch_updated_at() from anon, authenticated;
revoke execute on function public.at_handle_new_user() from anon, authenticated;
revoke execute on function public.at_guard_profile_role() from anon, authenticated;

-- RPCs de negocio: solo usuarios autenticados (validan rol internamente).
-- El único RPC público es at_track_guide (rastreo por número de guía).
revoke execute on function public.at_change_guide_status(uuid, public.at_guide_status, text) from anon;
revoke execute on function public.at_process_return(uuid, text) from anon;
revoke execute on function public.at_assign_courier(uuid, uuid, uuid) from anon;
revoke execute on function public.at_create_settlement(uuid, date) from anon;
revoke execute on function public.at_report_deposit(uuid, numeric, text) from anon;
revoke execute on function public.at_reconcile_settlement(uuid, text) from anon;
revoke execute on function public.at_generate_invoice(uuid, date, date) from anon;
revoke execute on function public.at_dashboard_kpis() from anon;

-- Helpers de sesión: sin acceso anónimo
revoke execute on function public.at_my_role() from anon;
revoke execute on function public.at_my_client() from anon;
revoke execute on function public.at_is_staff() from anon;
revoke execute on function public.at_is_ops() from anon;
revoke execute on function public.at_valid_transition(public.at_guide_status, public.at_guide_status) from anon;
