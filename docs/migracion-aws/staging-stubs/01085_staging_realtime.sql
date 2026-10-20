-- STUB STAGING: en producción at_notifications estaba en la publicación realtime
-- (añadida desde el panel, sin migración). 0110 la quita.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='at_notifications') then
    alter publication supabase_realtime add table public.at_notifications;
  end if;
end $$;
