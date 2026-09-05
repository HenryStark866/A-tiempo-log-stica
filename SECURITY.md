# Seguridad

## Reportar algo

Escribe a **henrytaborda57@gmail.com** con el asunto `[seguridad] …`. No abras
un *issue* público: este repo sirve una aplicación en producción con datos de
comercios y de compradores reales.

Cuenta qué viste, cómo llegaste ahí y qué se puede hacer con ello. Si hace
falta una cuenta para reproducirlo, dilo y se crea una de prueba.

## Qué protege qué

**La autorización vive entera en la base de datos.** La aplicación habla con
Supabase directo desde el navegador, con una llave anónima que es **pública por
diseño** — está en el paquete de JavaScript de cualquiera que abra la app.

Que esa llave sea pública no es un descuido: lo que protege los datos son las
políticas RLS y las comprobaciones de rol dentro de cada función de Postgres.
Una llave anónima filtrada no da acceso a nada.

Lo que **sí** es grave y merece un correo:

- Una consulta que devuelve filas de un comercio a alguien de otro.
- Una función que se puede llamar sin la sesión que debería exigir.
- Una forma de recorrer números de guía y llevarse el historial de envíos.
- Cualquier cosa que enseñe un token de rastreo o de pago que no sea tuyo.
- Un secreto de servidor visible desde el navegador (llave de servicio,
  credenciales de la pasarela de pago o del puente de WhatsApp).

## Lo que ya está puesto

Las medidas y su porqué están en
[`docs/estandares-de-plataforma.md`](docs/estandares-de-plataforma.md), frentes
2 y 7. En corto: RLS en las 33 tablas, freno de peticiones en Postgres para lo
que no pasa por nuestro servidor, CSP estricta con *nonce* por petición, HSTS
con `preload`, y `npm audit` en cada cambio.

## Lo que NO está puesto

Está escrito y a la vista, en el mismo documento («Lo que falta»). Si alguna de
esas casillas es lo que encontraste, ya lo sabemos — pero avisa igual si le ves
un alcance mayor del que le hemos dado.
