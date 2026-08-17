# ═══════════════════════════════════════════════════════════════════════════
# ALARMAS
#
# Con seis servicios y una base gestionada por nosotros, la diferencia entre
# «tenemos AWS» y «operamos en AWS» son estas alarmas. Sin ellas, autogestionar
# la pila es peor que Supabase: mismo riesgo y sin nadie mirando.
#
# Cada una responde a una pregunta concreta que alguien se haría a las 3 de la
# mañana.
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_sns_topic" "alertas" {
  name = "yam-plataforma-alertas"
}

resource "aws_sns_topic_subscription" "correo" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.correo_alertas

  # ⚠️ AWS manda un correo de confirmación. Hasta que alguien haga clic, esto
  # queda en "pending" y NINGUNA alarma llega. Es el fallo más típico.
}

# ── ¿Está respondiendo la API? ────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "sin_instancias_sanas" {
  for_each = local.servicios

  alarm_name        = "yam-${each.key}-sin-instancias-sanas"
  alarm_description = "Ninguna tarea de ${each.key} pasa la revisión de salud. Ese servicio está caído."

  namespace   = "AWS/ApplicationELB"
  metric_name = "HealthyHostCount"
  dimensions = {
    TargetGroup  = aws_lb_target_group.servicios[each.key].arn_suffix
    LoadBalancer = aws_lb.yam.arn_suffix
  }

  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
  ok_actions    = [aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "errores_5xx" {
  alarm_name        = "yam-errores-5xx"
  alarm_description = "La plataforma está devolviendo errores de servidor."

  namespace   = "AWS/ApplicationELB"
  metric_name = "HTTPCode_Target_5XX_Count"
  dimensions  = { LoadBalancer = aws_lb.yam.arn_suffix }

  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "lentitud" {
  alarm_name        = "yam-respuestas-lentas"
  alarm_description = "El percentil 95 pasa de 2 s. El mensajero en la calle lo nota antes que nadie."

  namespace          = "AWS/ApplicationELB"
  metric_name        = "TargetResponseTime"
  dimensions         = { LoadBalancer = aws_lb.yam.arn_suffix }
  extended_statistic = "p95"

  period              = 300
  evaluation_periods  = 2
  threshold           = 2
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
}

# ── ¿Aguanta la base? ─────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "aurora_al_tope" {
  alarm_name        = "yam-aurora-al-tope"
  alarm_description = "Aurora lleva rato en el máximo de ACU. O hay que subir acu_max, o hay una consulta sin índice."

  namespace   = "AWS/RDS"
  metric_name = "ServerlessDatabaseCapacity"
  dimensions  = { DBClusterIdentifier = aws_rds_cluster.yam.id }

  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.acu_max * 0.9
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "conexiones" {
  alarm_name        = "yam-conexiones-a-la-base"
  alarm_description = "Muchas conexiones abiertas. Si sube con el proxy puesto, algo las está fugando."

  namespace   = "AWS/RDS"
  metric_name = "DatabaseConnections"
  dimensions  = { DBClusterIdentifier = aws_rds_cluster.yam.id }

  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 400
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "proxy_esperando" {
  alarm_name        = "yam-proxy-cola-de-espera"
  alarm_description = "Hay peticiones esperando conexión libre. El pool se quedó corto: es la señal de saturación real."

  namespace   = "AWS/RDS"
  metric_name = "DatabaseConnectionsBorrowLatency"
  dimensions  = { ProxyName = aws_db_proxy.yam.name }

  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1000000 # microsegundos = 1 s esperando
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
}

# ── El tablero ────────────────────────────────────────────────────────────

resource "aws_cloudwatch_dashboard" "yam" {
  dashboard_name = "yam"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "Peticiones y errores"
          region = var.region
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.yam.arn_suffix, { stat = "Sum" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { stat = "Sum" }],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "Tiempo de respuesta (p50 / p95 / p99)"
          region = var.region
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.yam.arn_suffix, { stat = "p50" }],
            ["...", { stat = "p95" }],
            ["...", { stat = "p99" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "Base de datos — capacidad y conexiones"
          region = var.region
          metrics = [
            ["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", aws_rds_cluster.yam.id],
            [".", "DatabaseConnections", ".", "."],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "RDS Proxy — espera por conexión"
          region = var.region
          metrics = [
            ["AWS/RDS", "DatabaseConnectionsBorrowLatency", "ProxyName", aws_db_proxy.yam.name],
            [".", "ClientConnections", ".", "."],
          ]
        }
      },
    ]
  })
}
