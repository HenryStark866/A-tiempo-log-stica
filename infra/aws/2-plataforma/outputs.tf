output "api_url" {
  description = "Lo que va en NEXT_PUBLIC_SUPABASE_URL cuando se haga el corte."
  value       = "https://api.${var.dominio}"
}

output "alb_dns" {
  description = "Para probar antes de que el DNS resuelva."
  value       = aws_lb.yam.dns_name
}

output "proxy_escritura" {
  value = aws_db_proxy.yam.endpoint
}

output "proxy_lectura" {
  value = try(aws_db_proxy_endpoint.lectura[0].endpoint, "sin réplica")
}

output "cluster_aurora" {
  value = aws_rds_cluster.yam.endpoint
}

output "secreto_postgres" {
  value = aws_secretsmanager_secret.postgres.arn
}

output "tablero" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=yam"
}
