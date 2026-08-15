# Arranque en producción — lo que solo puedes hacer tú

Todo lo que está en el código ya quedó hecho y desplegado. Esta lista es lo que
vive en paneles a los que yo no entro: Vercel, Supabase y tu registrador de
dominios.

Está en orden de urgencia. Los tres primeros bloquean la operación del lunes.

---

## 1. El secreto del reloj de Shopify — 2 minutos

**Sin esto, los pedidos de Shopify NO llegan solos.** Está comprobado: ahora
mismo la función responde `401 No autorizado` al reloj, a propósito, porque
falta este paso. Es un fallo seguro — vale más que la sincronización no arranque
a que quede un endpoint abierto.

1. En el **SQL Editor** de Supabase (proyecto `A Tiempo Logistica`), lee el
   secreto que ya se generó:

   ```sql
   select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret';
   ```

2. Copia ese valor.
3. Ve a **Edge Functions → Secrets** (o *Settings → Edge Functions*).
4. Crea uno nuevo:
   - Nombre: `AT_CRON_SECRET`
   - Valor: lo que copiaste
5. Guarda.

El reloj corre cada 15 minutos. Para comprobar que quedó:

```sql
select status_code, content from net._http_response order by id desc limit 3;
```

Debe responder `200` con algo como `{"tiendas":N,"creadas":0,"fallaron":[]}`.
Si sigue en `401`, el secreto no coincide.

---

## 2. El asesor que quedó sin comercio — 1 minuto

Hay un asesor en producción con el comercio **sin asignar**, así que hoy no
puede hacer nada: al no tener comercio, la base lo deja fuera de todo.

Fue culpa de la pantalla de Usuarios, que borraba el comercio al guardar
cualquier rol que no fuera «cliente». Ya está corregido, y además ahora hay un
selector.

Entra a **Usuarios → esa persona → Comercio para el que trabaja**, elige su
tienda y guarda.

> De aquí en adelante el camino normal es otro y no te toca a ti: el asesor
> elige su comercio al registrarse y **su jefe** lo habilita desde Mi equipo.

## 3. Faltan mensajeros y operarios

Después del reset no quedó ninguno. Sin mensajeros no hay quien recoja ni
entregue, y sin operarios no hay quien reciba en el CEDI.

Que se registren desde `/registro` y los habilitas tú desde **Usuarios**.

---

## 4. El dominio atiempologistica.com

### En Vercel

**Settings → Domains → Add**. Agrega `atiempologistica.com` y
`www.atiempologistica.com`.

### En tu registrador

Vercel te dirá los valores exactos; normalmente son:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

Los DNS tardan entre minutos y unas horas. El certificado HTTPS lo emite Vercel
solo cuando el dominio resuelve.

### En Supabase — **esto no se puede olvidar**

**Authentication → URL Configuration**:

- `Site URL`: `https://atiempologistica.com`
- `Redirect URLs`: agrega `https://atiempologistica.com/**`
  y deja también `https://atiempo-logistica.vercel.app/**`

Si no lo haces, los correos de confirmación seguirán mandando a la gente al
dominio viejo, y el enlace de «confirma tu correo» fallará para quien entre por
el nuevo.

### Lo que NO hay que hacer

**No hay que reimprimir guías.** Vercel mantiene vivo
`atiempo-logistica.vercel.app` junto al dominio nuevo, así que todos los QR ya
impresos siguen funcionando. En el código nada estaba escrito a mano salvo un
texto, que ya se cambió: todo lo demás usa el dominio por el que entró cada
persona.

---

## 5. Las plantillas de correo

Están versionadas en `correos/` para que no se pierdan.

**Authentication → Emails**, en el proyecto **A Tiempo Logistica** — ojo, no en
el YAM que borraste:

| Plantilla | Archivo | Asunto |
| --- | --- | --- |
| *Confirm signup* | `correos/confirmar-cuenta.html` | Confirma tu correo y empieza a mover paquetes con YAM |
| *(bienvenida, se manda aparte)* | `correos/bienvenida.html` | — |

## 6. Seguridad de las cuentas

**Authentication → Providers → Email**, y en **Settings**:

- Activar **Leaked password protection** (compara contra contraseñas filtradas
  conocidas; es gratis y evita el problema más común).
- Revisar los **límites de registro** para que nadie cree cuentas en masa.

## 7. Limpieza pendiente

- **Storage**: borrar el bucket `evidencias`, que quedó vacío. Desde SQL no se
  puede (`storage.protect_delete` lo impide); hay que hacerlo desde el panel.
- **Comercios de prueba**: los que no son reales, desde `/clientes`.
- **Facturas de Supabase**: al día. Una factura vencida puede pausar la base de
  datos, y eso es la app caída para todo el mundo.

---

## Cómo comprobar que todo quedó bien

1. Entra como **asesor** de un comercio: crea un pedido de punta a punta
   viendo el total con domicilio, y pide una recogida.
2. Suspende a ese asesor desde **Mi equipo** (como dueño) y comprueba que ya no
   puede crear pedidos. Vuelve a habilitarlo.
3. Espera un ciclo de 15 minutos y mira si entraron pedidos de Shopify, o
   revisa `net._http_response` como arriba.
4. Abre `https://atiempologistica.com` y registra una cuenta de prueba para ver
   que el correo de confirmación llega con el dominio nuevo.
