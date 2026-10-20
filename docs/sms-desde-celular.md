# Códigos de entrega por SMS desde un celular propio

Los códigos de entrega salen por SMS desde un celular Android de la empresa, con
la app de código abierto **SMS Gateway for Android** (sms-gate.app, licencia
Apache-2.0). No hay cobro por mensaje: solo el plan de la SIM.

La edge function `enviar-mensajes` ya sabe hablar con la app (`enviarPorCelular`).
Mientras el celular no esté configurado, los códigos se quedan en la cola y
caducan a las 12 h, como siempre.

## Qué hace falta

- Un Android 5.0 o superior (sirve uno viejo), con SIM y **plan de SMS
  ilimitado** o con muchos SMS.
- Que el celular quede **encendido, cargando y con señal** todo el día.
- Wi-Fi o datos: el teléfono se conecta a internet para recoger los envíos.

## Paso a paso en el celular

1. Instalar **SMS Gateway for Android**. Está en Google Play como
   "SMS Gateway for Android™" (autor capcom6), o el APK en
   github.com/capcom6/android-sms-gateway/releases.
2. Abrirla y darle permiso para **enviar SMS** y para **notificaciones**.
3. En Ajustes del teléfono → Batería → la app → **Sin restricciones**, para que
   Android no la duerma.
4. En la app, activar **Cloud server** y tocar **Online**.
5. Copiar el **usuario** y la **contraseña** que muestra la sección Cloud
   server y pasárselos a quien administra la instancia por un canal privado.

## Paso a paso en la instancia (lo hace el administrador)

Cargar las credenciales en SSM y recrear el contenedor `functions`:

```bash
aws ssm put-parameter --region us-east-1 --name /yam/instancia/smsgate_user --type SecureString --value "USUARIO" --overwrite
aws ssm put-parameter --region us-east-1 --name /yam/instancia/smsgate_pass --type SecureString --value "CLAVE" --overwrite
```

En la instancia, poner esos valores en `SMSGATE_USER` y `SMSGATE_PASS` de
`/opt/yam/.env` (o repetir `bootstrap.sh`) y:

```bash
cd /opt/yam && docker compose up -d --force-recreate functions
```

`SMSGATE_URL` se deja vacío: usa el servidor en la nube de la app. Si algún día
se monta el servidor privado de sms-gate.app, se pone aquí su dirección.

## Lo que cambia en la operación al encenderlo

- Cada guía recogida dispara un SMS con su código al teléfono del destinatario.
- **El código pasa a ser obligatorio en la entrega** de esa guía (migración
  0022: se exige solo cuando hay un mensaje `enviado`). Los mensajeros deben
  pedirlo en la puerta.
- La fila de WhatsApp de cada código se queda pendiente y caduca sola mientras
  no haya canal de WhatsApp; el botón manual de WhatsApp sigue funcionando.

## Privacidad

En modo Cloud server, el texto del SMS (código y número de pedido) y el teléfono
del destinatario pasan por el servidor de sms-gate.app antes de llegar al
celular. Si eso no es aceptable, la alternativa es el servidor privado de la
app en nuestra instancia.
