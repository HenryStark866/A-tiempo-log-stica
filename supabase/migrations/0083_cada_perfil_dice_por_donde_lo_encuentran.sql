-- Cada perfil puede decir por cuál red social lo encuentran — dos columnas en
-- at_profiles, no una tabla aparte: es un solo enlace por persona, no una
-- lista. La política de UPDATE ya deja que cada quien edite su propia fila
-- ("usuario edita su perfil"), y el guardia de la tabla (at_profiles_guard)
-- solo bloquea cambios de role/client_id/active — estas dos columnas quedan
-- libres sin tocar ni la política ni el guardia.

alter table public.at_profiles
  add column social_platform text,
  add column social_handle text;

comment on column public.at_profiles.social_platform is
  'Cuál red social eligió mostrar: whatsapp, instagram, facebook, tiktok, x. Null = ninguna.';
comment on column public.at_profiles.social_handle is
  'El @usuario, número o enlace de esa red. Va de la mano con social_platform: los dos vacíos o los dos con algo.';

-- Los dos vacíos o los dos con algo — nunca uno solo. Evita guardar un
-- "@usuario" sin decir de qué red, o una red elegida sin nada que mostrar.
alter table public.at_profiles
  add constraint at_profiles_social_coherente
  check ((social_platform is null) = (social_handle is null));
