-- ═══════════════════════════════════════════════════════════════════════════
-- EL SECRETO DEL RELOJ SE COMPRUEBA EN LA BASE, NO EN UNA COPIA
--
-- El secreto vivía en DOS sitios que había que mantener iguales a mano: el
-- vault (de donde el cron lo lee para mandarlo) y los secrets de Edge
-- Functions (contra los que la función lo comparaba).
--
-- Nunca se pusieron iguales. `AT_CRON_SECRET` jamás se configuró, así que el
-- cron de Shopify llevaba MESES respondiendo 401 cada quince minutos y los
-- pedidos no entraban solos. El fallo era invisible: nadie mira
-- `net._http_response`, y el cron «corría» sin quejarse.
--
-- Un secreto que hay que copiar a mano entre dos sistemas se va a desincronizar
-- tarde o temprano. Aquí solo queda una copia —la del vault— y la función
-- pregunta por ella. El secreto no sale nunca de la base: se manda el candidato
-- y se devuelve sí o no.
--
-- `security definer` porque `vault.decrypted_secrets` no es accesible para
-- nadie más; y permiso solo para `service_role`, que es el único rol con el que
-- corre una Edge Function.
--
-- Comprobado al aplicarlo: con el secreto bueno devuelve true; con uno
-- inventado, con vacío y con nulo devuelve false; y ni `anon` ni
-- `authenticated` pueden llamarla.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_cron_secreto_valido(p_secreto text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
stable
as $$
  -- Un secreto vacío nunca vale, aunque el vault esté vacío también: si no,
  -- una base sin configurar dejaría entrar a cualquiera que no mande nada.
  select coalesce(
    length(coalesce(p_secreto, '')) > 0
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'at_cron_secret'
        and decrypted_secret = p_secreto
    ),
    false
  );
$$;

revoke execute on function public.at_cron_secreto_valido(text) from public, anon, authenticated;
grant execute on function public.at_cron_secreto_valido(text) to service_role;
