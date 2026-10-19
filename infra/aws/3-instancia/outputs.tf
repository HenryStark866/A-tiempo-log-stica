output "ip_publica" {
  description = "IP fija de la instancia. Es la que va en el registro A `api` de GoDaddy."
  value       = aws_eip.yam.public_ip
}

output "api_url" {
  value = "https://${local.api_host}"
}

output "instancia_id" {
  description = "Para entrar sin SSH: aws ssm start-session --target <id>"
  value       = aws_instance.yam.id
}

output "bucket_respaldos" {
  description = "Aquí se sube bootstrap/instancia.tgz y aquí caen los respaldos."
  value       = aws_s3_bucket.respaldos.bucket
}
