# Puente YAM → SolV y SMS de confirmación

Implementa la pieza D de `SolV/CONTRATO-INTEGRACION.md`. Migraciones 0140–0142.

## Qué hace

Cuando en YAM pasa algo que mueve plata, un trigger deja una fila en
`at_solv_eventos` (cola) con la **Intención de Pago** y el **evento** en la forma
del contrato. El orquestador (sesión C) las toma y el libro (sesión B) las asienta.
YAM nunca llama a SolV: si el libro está caído, el CEDI sigue y el evento espera.

| Pasa en YAM | Evento SolV | `tipo` de la intención | Monto |
| --- | --- | --- | --- |
| Guía contraentrega pasa a `entregada` | `incoming_payment.completed` | `cobro_comercio` | `cod_amount` |
| Cierre de caja del mensajero → `conciliado` | `cash.received_by_agent` | `liquidacion_mensajero` | consignado (o esperado) |
| Remesa al comercio → `pagada` | `outgoing_payment.completed` | `remesa` | `net_amount` |

- `monto` = pesos × 100 como texto (COP, `asset_scale` 2).
- Idempotencia: `(origen, ref_id, tipo_evento)` único; `event_id` e `intent_id` son
  deterministas (md5 del origen+id), así que repetir el trigger no duplica nada.
- Wallets: YAM no las conoce; manda alias `yam:comprador:<guia>`, `yam:comercio:<client>`,
  `yam:mensajero:<profile>`, `yam:cedi`. El orquestador los resuelve con `solv.resolver_alias`.
- Solo se encola si el monto es > 0.

### Lo que consume el orquestador (solo `service_role`)

- `at_solv_tomar_eventos(p_limite)` → lote de eventos pendientes, marcados `enviando`
  (`skip locked`; lo que lleva >5 min en `enviando` se reofrece; máximo 8 intentos).
- `at_solv_marcar_evento(event_id, ok, error)` → `enviado` / reintento / `fallido`.
- `at_solv_confirmar_pago_enviado(intent_id)` → al recibir `outgoing_payment.completed`
  encola el SMS «pago enviado» al receptor (comercio o mensajero).

## SMS (por `at_message_outbox` → `enviar-mensajes` → SMS Gateway)

ASCII puro y ≤160 caracteres (una tilde pasa el SMS a UCS-2 y lo parte en dos).
Cada fila lleva `guide_id` y/o `intent_id`, más `plantilla` + `ref_key` (índice único:
un aviso por plantilla y referencia).

| Plantilla | Cuándo | A quién | Ejemplo |
| --- | --- | --- | --- |
| `pago_recibido` | guía COD entregada | destinatario | `A Tiempo: recibimos tu pago de $20.000 del pedido ATL-123. Ref 4b71b865` |
| `pago_enviado` | el orquestador confirma el pago de salida | receptor del pago | `A Tiempo: te enviamos un pago de $14.000. Ref af4189ce` |
| `remesa_liquidada` | remesa → `pagada` | teléfono del comercio | `A Tiempo: liquidamos tu remesa REM-45 por $14.000. Ref af4189ce` |
| código de entrega | guía recogida (`at_issue_delivery_code`) | destinatario | `A Tiempo: codigo de entrega 123456 del pedido ATL-123. Dalo solo cuando…` |
| `guia_entregada` | guía → `entregada` | destinatario | `A Tiempo: tu pedido ATL-123 fue entregado. Ref ATL-123` |
| `intento_fallido` | `novedad`/`reprogramada`/`en_devolucion` | destinatario | `A Tiempo: no pudimos entregar tu pedido ATL-123 (intento 1). Te contactamos. Ref ATL-123` |

Sin teléfono no se encola nada. Los mensajes caducan a las 12 h como siempre.

## Seguro para pruebas reales

La función `enviar-mensajes` acepta `SMSGATE_SOLO_A` (números E.164 separados por coma).
Con ella puesta, cualquier otro destino se rechaza antes de salir. Para el primer envío
real: `SMSGATE_SOLO_A=+573245769748` y **solo con la confirmación de Henry en el chat**.
La lógica de envío vive en `supabase/functions/enviar-mensajes/smsgate.ts`.

## Pruebas

- `tests/smsgate-mock.test.ts` — corre siempre: servidor HTTP simulado de la API de SMS Gateway.
- `tests/db/puente-solv-y-sms.test.ts` — contra la base local (`npm run test:db`): cobro→evento+SMS,
  entrega→SMS, intento fallido, recogida con código, cierre de caja, remesa (sin duplicar), pago
  enviado, consumo de la cola, RLS (anon no lee), y despacho del buzón al servidor simulado.

## Pendiente / supuestos

- «Liquidar a un mensajero» hoy es el cierre de caja (`at_settlements`, mensajero → ATL). YAM no
  tiene tabla de pago de salida al mensajero; cuando exista, se enchufa con `at_solv_encolar`.
- Asientos por evento: a validar con el contador (contrato, sección 5 del PDF).
- `0142` redefine `at_issue_delivery_code` (copia de la 0126 con SMS en ASCII): si otra
  migración vuelve a tocar esa función, debe partir de la 0142.

## Operar el celular de SMS en producción

Resumen para quien administre la instancia. **Ninguna clave va en este repo**: ni en
archivos, ni en commits, ni en chats.

- **Modo:** *Cloud server* de SMS Gateway for Android. El celular se conecta al servidor de
  sms-gate.app y recoge los envíos; `SMSGATE_URL` queda vacía y `enviar-mensajes` usa el
  servidor en la nube de la app. Para el servidor privado se pone aquí su dirección.
- **Dónde viven las credenciales:** AWS SSM Parameter Store, como `SecureString`:
  `/yam/instancia/smsgate_user` y `/yam/instancia/smsgate_pass`. Los valores salen de la
  sección *Cloud server* de la app, nunca de este repo.
- **Cómo llegan a la función:** la instancia las lee de SSM (`bootstrap.sh`) y las deja en
  `/opt/yam/.env` como `SMSGATE_USER` y `SMSGATE_PASS`. Tras cambiarlas hay que recrear el
  contenedor: `cd /opt/yam && docker compose up -d --force-recreate functions`.
- **El celular:** Android 5.0 o superior, con SIM y plan de SMS, **encendido, cargando, con
  señal y con la app en *Sin restricciones* de batería**. Si se apaga, los SMS esperan en
  `at_message_outbox` y caducan a las 12 h.
- **Rotar la clave:** cambiar usuario/clave en la app, actualizar los dos parámetros de SSM
  con `--overwrite`, repetir el `.env` y recrear `functions`.
- **Probar sin riesgo:** `SMSGATE_SOLO_A` (números E.164 separados por coma) limita los
  destinos; pruebas reales solo al número que Henry indique y con su confirmación.
- **Si algo falla:** mirar `at_message_outbox` (`status`, `error`, `attempts`); un SMS pasa a
  `fallido` tras 3 intentos o a las 12 h. El texto y el teléfono del destinatario pasan por
  el servidor de sms-gate.app en modo Cloud (ver «Privacidad» en `docs/sms-desde-celular.md`).
