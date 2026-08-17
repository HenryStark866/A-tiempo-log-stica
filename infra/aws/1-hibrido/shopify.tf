# ═══════════════════════════════════════════════════════════════════════════
# El reloj de Shopify — Lambda + EventBridge
#
# Reemplaza a `cron.schedule('at-shopify', …)` de la migración 0082.
#
# El motivo está escrito largo en lambda/shopify-sync/index.mjs y se resume en
# una frase: hoy esa llamada responde 401 en producción y NADIE SE ENTERA.
# Los pedidos de Shopify no están entrando solos y la única forma de saberlo es
# consultar `net._http_response` a mano.
#
# ⚠️ Al aplicar esto, hay que APAGAR el cron viejo o se ejecutarán los dos:
#     select cron.unschedule('at-shopify');
# Está en el runbook (README.md, paso 4) y no es opcional.
# ═══════════════════════════════════════════════════════════════════════════

# ── El secreto ────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "shopify_reloj" {
  name        = "yam/shopify-reloj"
  description = "Secreto compartido con AT_CRON_SECRET de Supabase, y la llave anónima."

  # 7 días de gracia al borrar: si alguien lo elimina por error, se recupera.
  recovery_window_in_days = 7
}

# El VALOR no se pone en Terraform: acabaría en el estado, y el estado se lee
# entero con `terraform show`. Se carga una vez a mano (README.md, paso 4) y
# Terraform solo gestiona el contenedor.
#
# `ignore_changes` es lo que impide que el siguiente `apply` lo pise con el
# marcador de posición.
resource "aws_secretsmanager_secret_version" "shopify_reloj" {
  secret_id = aws_secretsmanager_secret.shopify_reloj.id
  secret_string = jsonencode({
    cron_secret = "PENDIENTE-cargar-a-mano"
    anon_key    = "PENDIENTE-cargar-a-mano"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Empaquetado ───────────────────────────────────────────────────────────
# Sin bundler: el SDK de AWS v3 ya viene en el runtime de Node de Lambda, y es
# la única dependencia. Un zip de un archivo.
data "archive_file" "shopify_sync" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/shopify-sync"
  output_path = "${path.module}/.build/shopify-sync.zip"
}

# ── Permisos ──────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "lambda_asume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "shopify_sync" {
  name               = "yam-shopify-sync"
  assume_role_policy = data.aws_iam_policy_document.lambda_asume.json
}

resource "aws_iam_role_policy_attachment" "shopify_sync_logs" {
  role       = aws_iam_role.shopify_sync.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Solo ESTE secreto. Nada de `Resource: "*"`: si algún día esta Lambda se
# compromete, que no pueda leer los secretos de todo lo demás.
data "aws_iam_policy_document" "shopify_sync_secreto" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.shopify_reloj.arn]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.shopify_muertos.arn]
  }
}

resource "aws_iam_role_policy" "shopify_sync_secreto" {
  name   = "leer-secreto-y-cola-muerta"
  role   = aws_iam_role.shopify_sync.id
  policy = data.aws_iam_policy_document.shopify_sync_secreto.json
}

# ── La cola de lo que no se pudo ──────────────────────────────────────────
resource "aws_sqs_queue" "shopify_muertos" {
  name                      = "yam-shopify-sync-muertos"
  message_retention_seconds = 1209600 # 14 días, el máximo
}

# ── La función ────────────────────────────────────────────────────────────
resource "aws_lambda_function" "shopify_sync" {
  function_name = "yam-shopify-sync"
  role          = aws_iam_role.shopify_sync.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"] # Graviton: más barato y sobra para esto.

  filename         = data.archive_file.shopify_sync.output_path
  source_code_hash = data.archive_file.shopify_sync.output_base64sha256

  # 130 s: la llamada corta a los 120 s por su cuenta, y quedan 10 para que la
  # función registre el fallo en vez de morir sin decir nada.
  timeout     = 130
  memory_size = 256

  environment {
    variables = {
      SUPABASE_URL = var.supabase_url
      SECRETO_ARN  = aws_secretsmanager_secret.shopify_reloj.arn
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.shopify_muertos.arn
  }
}

# 30 días de logs. Por omisión sería "para siempre", que a la larga se paga.
resource "aws_cloudwatch_log_group" "shopify_sync" {
  name              = "/aws/lambda/${aws_lambda_function.shopify_sync.function_name}"
  retention_in_days = 30
}

# ── El reloj ──────────────────────────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "shopify_cada_15" {
  name                = "yam-shopify-cada-15-min"
  description         = "Despierta el sync de Shopify. Sustituye a pg_cron 'at-shopify'."
  schedule_expression = "rate(${var.cada_cuantos_minutos_shopify} minutes)"
}

resource "aws_cloudwatch_event_target" "shopify_cada_15" {
  rule      = aws_cloudwatch_event_rule.shopify_cada_15.name
  target_id = "lambda"
  arn       = aws_lambda_function.shopify_sync.arn

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 600 # 10 min: pasado eso, la corrida siguiente ya viene.
  }

  dead_letter_config {
    arn = aws_sqs_queue.shopify_muertos.arn
  }
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "DesdeEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shopify_sync.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.shopify_cada_15.arn
}

# ── Las alarmas, que son el motivo de todo esto ───────────────────────────
resource "aws_sns_topic" "alertas" {
  name = "yam-alertas"
}

resource "aws_sns_topic_subscription" "alertas_correo" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.correo_alertas

  # ⚠️ AWS manda un correo de confirmación. Hasta que alguien haga clic, esta
  # suscripción está "pending" y las alarmas NO llegan a nadie. Es el fallo más
  # típico al montar esto: se da por hecho que quedó y no.
}

resource "aws_cloudwatch_metric_alarm" "shopify_falla" {
  alarm_name        = "yam-shopify-sync-falla"
  alarm_description = "El sync de Shopify falló. Si es 401, cron_secret no coincide con AT_CRON_SECRET en Supabase."

  namespace   = "AWS/Lambda"
  metric_name = "Errors"
  dimensions  = { FunctionName = aws_lambda_function.shopify_sync.function_name }

  statistic           = "Sum"
  period              = 900 # una corrida
  evaluation_periods  = 2   # dos seguidas: un fallo suelto puede ser Shopify, no nosotros
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
  ok_actions    = [aws_sns_topic.alertas.arn] # avisa también cuando se arregla
}

resource "aws_cloudwatch_metric_alarm" "shopify_no_corre" {
  alarm_name        = "yam-shopify-sync-no-corre"
  alarm_description = "Hace más de una hora que el sync no se ejecuta. El reloj está parado."

  namespace   = "AWS/Lambda"
  metric_name = "Invocations"
  dimensions  = { FunctionName = aws_lambda_function.shopify_sync.function_name }

  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"

  # `breaching` a propósito: "no llegó ningún dato" ES el fallo que se busca.
  # Con `notBreaching` esta alarma no saltaría nunca, que es justo lo contrario
  # de lo que hace falta.
  treat_missing_data = "breaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "shopify_tiendas_fallidas" {
  alarm_name        = "yam-shopify-tiendas-fallidas"
  alarm_description = "Alguna tienda no sincronizó. Suele ser un token de Shopify vencido: el comercio tiene que reconectar."

  namespace   = "YAM/Shopify"
  metric_name = "TiendasFallidas"

  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alertas.arn]
}
