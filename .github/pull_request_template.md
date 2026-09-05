<!--
El título del PR se escribe como un commit de este repo: en español, en
indicativo y contando el efecto para quien usa la app.

  Sí: «el CEDI recibe el lote de un escaneo»
  No: «refactor del componente EscanerQR»

La lista de abajo no es burocracia: cada casilla es un fallo que ya ocurrió en
este proyecto. Tacha lo que no aplique en vez de borrarlo — así se ve que se
miró y se descartó.
-->

## Qué cambia, y para quién

<!-- Una o dos frases. Quién nota la diferencia: el mensajero, el CEDI, el
     comercio, el comprador. -->

## Por qué

<!-- Si arregla algo, cómo se rompía. Si es nuevo, qué se hacía antes. -->

## Cómo se comprobó

<!-- «Compila» no es comprobar. Qué pantalla se abrió, con qué rol, y qué se
     vio. Si toca la base, contra qué proyecto. -->

---

- [ ] `npm run verificar` en verde (tipos, lint, tests, build, paquete)
- [ ] Si toca **el esquema**: migración nueva y numerada (nunca editar una
      aplicada), y `get_advisors` de **seguridad y rendimiento** revisado
- [ ] Si toca **RLS o una función `security definer`**: comprobado con una
      sesión de verdad, no con `service_role` — esa llave se salta RLS y todo
      pasa
- [ ] Si toca **`/api`**: usa `respuesta.ts` y `freno.ts`, y el cliente de
      Supabase corresponde a **quién llama** (persona → `server.ts`,
      máquina → `servicio.ts`)
- [ ] Ningún secreto en el diff (`.env.local` no se commitea)
- [ ] Si se aceptó algo a sabiendas, está escrito en
      `docs/estandares-de-plataforma.md`
