output "servidores_de_nombres" {
  description = "PONER ESTOS CUATRO EN EL REGISTRADOR DEL DOMINIO. Hasta entonces, la zona no la consulta nadie."
  value       = aws_route53_zone.principal.name_servers
}

output "cdn_logos" {
  description = "Dominio de CloudFront para los logotipos."
  value       = aws_cloudfront_distribution.logos.domain_name
}

output "bucket_logos" {
  description = "Bucket donde subir los logos de marca."
  value       = aws_s3_bucket.logos.id
}

output "secreto_shopify_arn" {
  description = "Cargar aquí cron_secret y anon_key. Ver README.md, paso 4."
  value       = aws_secretsmanager_secret.shopify_reloj.arn
}

output "cola_muertos_shopify" {
  description = "Donde caen las corridas que agotaron los reintentos."
  value       = aws_sqs_queue.shopify_muertos.url
}

output "verificacion_ses" {
  description = "Estado de la identidad de SES. Recuerda pedir salida del sandbox."
  value       = aws_ses_domain_identity.atl.verification_token
  sensitive   = true
}
