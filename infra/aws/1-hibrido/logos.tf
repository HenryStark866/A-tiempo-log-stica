# ═══════════════════════════════════════════════════════════════════════════
# S3 + CloudFront — SOLO los logos de marca
#
# ── Lo que NO se mueve, y por qué ────────────────────────────────────────
#
# En Supabase hay seis buckets. Cinco son PRIVADOS y contienen datos personales
# y prueba legal:
#
#   at-courier-docs       cédulas y licencias de los mensajeros
#   at-delivery-evidence  fotos de entrega, con direcciones y a veces personas
#   at-facility-docs      documentos de las sedes
#   at-payment-receipts   comprobantes de pago de los comercios
#   evidencias            vacío, herencia de otra app — hay que borrarlo
#
# Esos NO se tocan. Su control de acceso son políticas RLS de Supabase atadas a
# la sesión de cada persona (ver [Modelo de datos y RLS] en la bóveda), y
# reproducir eso con URLs firmadas de S3 es reescribir la autorización entera de
# los archivos. Es exactamente el tipo de cambio que no se hace "de paso"
# mientras se monta un CDN.
#
# El único que se mueve es `at-brand-logos`: son los logotipos que se pintan en
# el rastreo público y en la pantalla de pago, que abre cualquiera sin cuenta.
# Es contenido público por definición, se pide desde el teléfono del comprador
# —a menudo con mala red— y hoy sale de Supabase sin CDN.
#
# Beneficio real: la portada y el rastreo cargan el logo desde el borde en vez
# de desde us-east-1 de Supabase. Riesgo: ninguno, porque si CloudFront falla lo
# peor que pasa es que no se vea un logotipo.
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_s3_bucket" "logos" {
  bucket = "atl-yam-logos-marca"
}

# El bucket NO es público. CloudFront entra con Origin Access Control y S3 solo
# le abre a él. Un bucket público es la forma más común de acabar sirviendo
# —y pagando— tráfico que no es tuyo.
resource "aws_s3_bucket_public_access_block" "logos" {
  bucket                  = aws_s3_bucket.logos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logos" {
  bucket = aws_s3_bucket.logos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versionado: un logo se sube mal o se borra por accidente, y con esto se
# recupera. Cuesta casi nada con archivos de este tamaño.
resource "aws_s3_bucket_versioning" "logos" {
  bucket = aws_s3_bucket.logos.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Las versiones viejas no se guardan para siempre: a los 90 días sobran.
resource "aws_s3_bucket_lifecycle_configuration" "logos" {
  bucket     = aws_s3_bucket.logos.id
  depends_on = [aws_s3_bucket_versioning.logos]

  rule {
    id     = "limpiar-versiones-viejas"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_cloudfront_origin_access_control" "logos" {
  name                              = "atl-yam-logos"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "logos" {
  enabled     = true
  comment     = "YAM — logotipos de marca"
  price_class = "PriceClass_100" # Norteamérica y Europa. Sobra para Colombia y es lo más barato.

  origin {
    domain_name              = aws_s3_bucket.logos.bucket_regional_domain_name
    origin_id                = "s3-logos"
    origin_access_control_id = aws_cloudfront_origin_access_control.logos.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-logos"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # CachingOptimized, la política gestionada de AWS. Ver el id en:
    # https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Certificado de CloudFront, sin dominio propio. Se sirve por el
  # d111111abcdef8.cloudfront.net que asigna AWS.
  #
  # Se deja así a propósito: poner logos.atiempologistica.com exigiría un
  # certificado de ACM en us-east-1 con validación por DNS, y eso solo funciona
  # DESPUÉS de que el registrador apunte a los servidores de nombres de Route 53
  # (ver dns.tf). Encadenarlo aquí haría que este `apply` se quedara colgado
  # esperando una validación que no puede pasar todavía.
  #
  # Cuando el dominio resuelva por Route 53, se añade el certificado y el alias.
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "logos_desde_cloudfront" {
  statement {
    sid       = "SoloCloudFront"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.logos.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.logos.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "logos" {
  bucket = aws_s3_bucket.logos.id
  policy = data.aws_iam_policy_document.logos_desde_cloudfront.json
}
