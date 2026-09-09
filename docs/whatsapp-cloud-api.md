# El código de entrega sale solo, por WhatsApp

Cómo encender el envío automático de los códigos de confirmación. Cuando esto
esté puesto, el comprador recibe su código en WhatsApp a los dos minutos de que
el mensajero recoge el paquete, sin que nadie toque nada.

## Por qué la Cloud API de Meta y no otra cosa

| Canal | Veredicto |
| --- | --- |
| **WhatsApp Cloud API (Meta)** | **Elegido.** Oficial, sin servidor propio, y es el canal que en Colombia se lee. Una llamada HTTPS desde la edge function. Plantilla de utilidad a Colombia: del orden de **US$0,01 por mensaje** — a decenas al mes, centavos |
| Twilio SMS | Sirve y ya está cableado (ver abajo). Llega a todo el mundo pero se lee menos, y cuesta ~5× más por mensaje |
| Puente propio OpenWA | Descartado como principal. **Lleva desde agosto sin dónde vivir** (Oracle sin capacidad, PAYG pide US$100) y es WhatsApp Web automatizado: un volumen alto puede costar el bloqueo del número. Se queda en el código por si algún día se monta |
| Botón manual `wa.me` (migración 0040) | **No se toca.** Sigue ahí para reenviar a mano cuando haga falta |

El comentario de la migración 0040 —«ningún proveedor manda el primer mensaje
gratis»— sigue siendo cierto al céntimo. Lo que cambió es que el coste que de
verdad frenaba esto era el **servidor** del puente, no el mensaje.

## Lo que ya está hecho (en el repo)

- **Migración `0113`** — añade `at_message_outbox.template_params` y hace que
  `at_issue_delivery_code` guarde ahí el número de pedido y el código por
  separado. Una plantilla se rellena con parámetros, no con texto ya montado.
- **`supabase/functions/enviar-mensajes/index.ts`** — el canal `whatsapp` sale
  por la Cloud API si está configurada; si no, por el puente; si no, Twilio.

Falta lo que solo puedes hacer tú: la cuenta de Meta, el número y la plantilla.

---

## Paso 1 — La app de Meta y el número

1. Entra a <https://developers.facebook.com/apps> → **Crear app** → tipo
   **Empresa** (Business).
2. Dentro de la app, **Agregar producto → WhatsApp → Configurar**.
3. Meta te da un **número de prueba** gratis para empezar. Sirve para probar
   todo el circuito, pero **solo manda a números que registres a mano** (hasta
   5). Para producción hay que añadir el número real de la operación en
   *WhatsApp → Configuración de la API → Agregar número de teléfono*.
   > ⚠️ El número que registres en WhatsApp Business API **deja de poder usarse
   > en la app normal de WhatsApp**. No uses el celular personal de nadie ni el
   > número desde el que hoy se manda a mano.
4. Anota el **Identificador del número de teléfono** (`WHATSAPP_PHONE_ID`): son
   dígitos, y **no** es el número de teléfono.

## Paso 2 — Un token que no caduque

El token que Meta muestra en pantalla dura 24 horas: no sirve. Hace falta uno
de usuario del sistema:

1. <https://business.facebook.com> → **Configuración del negocio → Usuarios →
   Usuarios del sistema** → **Agregar**, rol *Administrador*.
2. **Agregar activos** → tu app de WhatsApp → control total.
3. **Generar token** → elige la app → permisos `whatsapp_business_messaging` y
   `whatsapp_business_management` → **caducidad: nunca**.
4. Cópialo. **No lo pegues en el chat ni en la bóveda**: va directo al paso 4.

## Paso 3 — La plantilla

*WhatsApp → Administrar plantillas → Crear plantilla.*

| Campo | Valor |
| --- | --- |
| Nombre | `codigo_entrega` |
| Categoría | **Utilidad** (no Marketing: se aprueba más rápido y cuesta menos) |
| Idioma | **Español** (`es`) |
| Encabezado | *(ninguno)* |
| Pie | *(ninguno)* |
| Botones | *(ninguno)* |

**Cuerpo**, exactamente:

```
Tu código de entrega para el pedido {{1}} es: {{2}}

Dáselo al mensajero de A Tiempo Logística solo cuando ya tengas el paquete en la mano. Es la prueba de que llegó a ti.
```

Ejemplos que pide Meta para revisar: `{{1}}` → `ATL-100184`, `{{2}}` → `498385`.

La aprobación suele tardar de minutos a un día hábil. Si la rechazan, casi
siempre es por categoría: vuelve a enviarla como **Utilidad** dejando claro que
es sobre un pedido que la persona ya hizo.

## Paso 4 — Los secretos

```bash
npx supabase@latest secrets set --project-ref uhbtivaepyhwfdvtpfjq \
  WHATSAPP_TOKEN='EAAG...' \
  WHATSAPP_PHONE_ID='123456789012345'
```

Opcionales, solo si te apartas de lo de arriba:

| Variable | Por omisión |
| --- | --- |
| `WHATSAPP_TEMPLATE` | `codigo_entrega` |
| `WHATSAPP_LANG` | `es` |
| `WHATSAPP_API_VERSION` | `v22.0` — súbela el día que Meta jubile esa versión |

## Paso 5 — Comprobar

Con la plantilla ya aprobada y un pedido de prueba recogido:

```sql
-- ¿Salió?
select channel, status, provider_id, error, sent_at
from at_message_outbox
where guide_id = (select id from at_guides where guide_number = 'ATL-100184');
```

Lo esperado: la fila `whatsapp` en `enviado` con un `provider_id` que empieza
por `wamid.`. Si quedó `fallido`, el `error` trae el motivo textual de Meta.

Errores típicos:

| Lo que dice Meta | Qué es |
| --- | --- |
| `template name does not exist` | La plantilla no está aprobada todavía, o el idioma no coincide (`es` vs `es_CO`) |
| `Recipient phone number not in allowed list` | Estás con el número de prueba; hay que registrar el destino a mano |
| `(#131030)` | Lo mismo de arriba |
| `Invalid OAuth access token` | El token era el de 24 h. Vuelve al paso 2 |

## Lo que se enciende solo cuando esto funcione

La migración **0022** ya dejó la regla puesta: al confirmar la entrega, el
código **se exige solo si hubo un mensaje `enviado`** para esa guía. Hoy no hay
ninguno, así que el mensajero no se traba. En cuanto la Cloud API empiece a
mandar, la exigencia se activa sola, pedido por pedido, sin desplegar de nuevo.

Dicho al revés, y conviene tenerlo claro antes de encender: **a partir de ese
momento el mensajero no puede cerrar una entrega sin el código**, salvo que un
coordinador lo autorice —y eso queda escrito en el historial de la guía—.

## El atajo, si hay prisa: Twilio SMS

Ya está cableado en la misma edge function, no necesita plantilla ni cuenta de
Meta, y se enciende en veinte minutos. Cuesta ~US$0,05 por mensaje.

```bash
npx supabase@latest secrets set --project-ref uhbtivaepyhwfdvtpfjq \
  TWILIO_ACCOUNT_SID='ACxxxx' \
  TWILIO_AUTH_TOKEN='xxxx' \
  TWILIO_SMS_FROM='ATiempo'
```

Para Colombia, Twilio admite **remitente alfanumérico**: no hay que comprar
número. Es de una sola vía —el comprador no puede responder—, que para un
código está bien.

Los dos canales conviven: por cada código se encola una fila de WhatsApp y una
de SMS, y **basta con que una llegue**. Poner Twilio ahora y la Cloud API
después no estorba; deja al SMS de respaldo para los números que no tengan
WhatsApp.
