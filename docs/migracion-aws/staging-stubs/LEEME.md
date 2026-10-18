# Parches de staging local (2026-10-18)

`supabase start` sobre `supabase/migrations/` falla porque producción tiene objetos
que ninguna migración crea (se hicieron desde el panel / SQL editor). Estos dos
archivos son **stubs solo para staging**: no van a `supabase/migrations/`.

Uso: copiar `supabase/` (config.toml + migrations) a una carpeta de trabajo, añadir
estos dos archivos a su `migrations/` y correr `npx supabase start` desde ahí.

Objetos que faltan en las migraciones locales:
- funciones `at_evento_al_crear_pedido()`, `at_franja_de_recogida()`, `at_valida_hora_recogida(time)`
- tablas `at_survey_responses`, `at_survey_snooze`
- `at_notifications` en la publicación `supabase_realtime`

Retrato del staging parchado vs control de producción: tablas 33=33, índices 100=100,
enums 12=12, cron 5=5; funciones 143 vs 150, triggers 22 vs 23, políticas 63 vs 62,
bucket `evidencias` ausente. Faltan ~7 funciones y 1 trigger reales que solo se
pueden listar leyendo producción (proyecto pausado por facturas impagas).
