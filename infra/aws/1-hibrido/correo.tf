# ═══════════════════════════════════════════════════════════════════════════
# SES — los correos transaccionales
#
# Hoy los manda Supabase con sus plantillas (correos/confirmar-cuenta.html y
# correos/bienvenida.html). Funciona, pero tiene dos problemas que se notan
# cuando el volumen sube:
#
#   · Los límites de envío son los de Supabase, compartidos, no negociables.
#   · Si un correo no llega, no hay forma de saber por qué. Sin rebotes, sin
#     quejas, sin métricas. Y «no me llegó el correo de confirmación» es el
#     primer motivo por el que un comercio nuevo no termina de registrarse.
#
# Esto deja el dominio verificado y firmado. Cambiar Supabase para que use SES
# como SMTP es un paso APARTE y posterior — verificar primero, mover después.
#
# ⚠️ SES arranca en modo sandbox: solo se puede enviar a direcciones
# verificadas a mano. Para mandar a comercios de verdad hay que pedir acceso a
# producción por la consola, y eso lo aprueba AWS a mano y tarda. Pídelo el
# mismo día que apliques esto, no el día que lo necesites.
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_ses_domain_identity" "atl" {
  domain = var.dominio
}

resource "aws_ses_domain_dkim" "atl" {
  domain = aws_ses_domain_identity.atl.domain
}

# Las tres claves DKIM que firman el correo. Sin ellas, Gmail y Outlook mandan
# los correos a spam con bastante alegría.
resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = aws_route53_zone.principal.zone_id
  name    = "${aws_ses_domain_dkim.atl.dkim_tokens[count.index]}._domainkey.${var.dominio}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.atl.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# MAIL FROM propio: hace que el SPF lo firme nuestro dominio y no amazonses.com.
# Mejora la entregabilidad y, sobre todo, que el destinatario vea un remitente
# coherente con la marca.
resource "aws_ses_domain_mail_from" "atl" {
  domain           = aws_ses_domain_identity.atl.domain
  mail_from_domain = "correo.${var.dominio}"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = aws_route53_zone.principal.zone_id
  name    = aws_ses_domain_mail_from.atl.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = aws_route53_zone.principal.zone_id
  name    = aws_ses_domain_mail_from.atl.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# DMARC en `none`: observa y reporta, pero no rechaza nada todavía. Empezar en
# `reject` con un dominio recién montado es la forma más rápida de que dejen de
# llegar los correos de confirmación sin que nadie entienda por qué. Se sube a
# `quarantine` y luego a `reject` cuando los informes lleguen limpios.
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.principal.zone_id
  name    = "_dmarc.${var.dominio}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none; rua=mailto:${var.correo_alertas}"]
}
