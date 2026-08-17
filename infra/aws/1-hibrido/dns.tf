# ═══════════════════════════════════════════════════════════════════════════
# DNS — atiempologistica.com
#
# Esta es la pieza que desbloquea el punto 4 de docs/arranque-produccion.md,
# que lleva pendiente desde antes de esta sesión.
#
# El dominio sigue apuntando a VERCEL. Route 53 solo pasa a ser quien manda en
# la zona; la app no se mueve. Eso es deliberado: separar "cambiar de DNS" de
# "cambiar de hosting" hace que cada uno se pueda revertir por su cuenta, y
# ninguno de los dos tumba al otro si sale mal.
#
# ── Por qué Route 53 y no los servidores de nombres de Vercel ────────────
#
# Vercel también puede llevar el DNS (ns1/ns2.vercel-dns.com) y es más simple.
# Se elige Route 53 porque en esta zona tienen que convivir cosas que Vercel no
# gestiona: los registros DKIM, MX y DMARC de SES (correo.tf) y, más adelante,
# `api.atiempologistica.com` apuntando a la pila de AWS. Todo el DNS en un solo
# sitio y bajo Terraform.
#
# Lo que se pierde: con el ápice como registro A, Vercel no puede emitir
# certificados comodín (*.atiempologistica.com) — para eso haría falta
# delegarle los servidores de nombres. Aquí no hacen falta: son el ápice y
# `www`, y esos van con certificado normal.
#
# ⚠️ ANTES DE APLICAR: al crear la zona, Route 53 asigna cuatro servidores de
# nombres. Hay que ponerlos en el REGISTRADOR del dominio. Mientras eso no pase,
# esta zona no la consulta nadie y no cambia nada — que es justo lo que la hace
# segura de aplicar primero.
#
# ⚠️ Y NO OLVIDAR, que es donde siempre se falla: Supabase →
# Authentication → URL Configuration. `Site URL` a https://atiempologistica.com
# y añadir https://atiempologistica.com/** a las redirecciones, DEJANDO la del
# .vercel.app. Sin eso, el correo de confirmación sigue mandando al dominio
# viejo y el enlace falla para quien entre por el nuevo.
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_route53_zone" "principal" {
  name    = var.dominio
  comment = "YAM — A Tiempo Logistica. Gestionada por Terraform."
}

# El ápice del dominio no puede ser un CNAME (lo prohíbe el DNS), de ahí el
# registro A con la IP de Vercel.
#
# ⚠️ Esa IP la da Vercel y NO es la misma para todos los proyectos: los nuevos
# toman una de un pool según plan y proyecto. Sácala de la tarjeta de
# Vercel → Settings → Domains, no de un tutorial.
resource "aws_route53_record" "apice" {
  zone_id = aws_route53_zone.principal.zone_id
  name    = var.dominio
  type    = "A"
  ttl     = 300
  records = [var.vercel_ip]
}

resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.principal.zone_id
  name    = "www.${var.dominio}"
  type    = "CNAME"
  ttl     = 300
  records = [var.vercel_cname]
}

# TTL corto a propósito mientras se estabiliza el dominio: si hay que corregir
# algo, el cambio se propaga en cinco minutos y no en un día. Subirlo a 3600
# cuando lleve unas semanas sin tocarse.
