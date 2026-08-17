# ═══════════════════════════════════════════════════════════════════════════
# LA PILA DE SUPABASE EN ECS
#
# Los mismos contenedores oficiales que corre Supabase gestionado. Eso es lo
# que hace viable este camino: PostgREST sigue siendo PostgREST, así que los
# 53 archivos del frontend que hablan directo con la base **no se tocan**, y
# las 55 políticas RLS siguen valiendo tal cual. Y GoTrue sigue siendo GoTrue,
# o sea que los hashes de contraseña viajan intactos y nadie tiene que
# restablecer la suya el día del cambio.
#
# Lo que se cambia en la app: dos variables de entorno.
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_ecs_cluster" "yam" {
  name = "yam"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "yam" {
  cluster_name       = aws_ecs_cluster.yam.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ── El balanceador ────────────────────────────────────────────────────────

resource "aws_lb" "yam" {
  name               = "yam"
  load_balancer_type = "application"
  subnets            = aws_subnet.publica[*].id
  security_groups    = [aws_security_group.alb.id]

  # Que no se pueda borrar de un `terraform destroy` distraído.
  enable_deletion_protection = true

  # Los mensajeros están en redes móviles malas: 60 s de gracia antes de cerrar
  # una conexión ociosa evita reconexiones constantes.
  idle_timeout = 60
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.yam.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"error\":\"ruta desconocida\"}"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener" "http_a_https" {
  load_balancer_arn = aws_lb.yam.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── Certificado para api.atiempologistica.com ─────────────────────────────
#
# La zona de Route 53 la crea la pila 1-hibrido. Aquí se lee, no se recrea:
# dos zonas para el mismo dominio es la forma más rápida de que el DNS deje de
# resolver.
data "aws_route53_zone" "principal" {
  name = "${var.dominio}."
}

resource "aws_acm_certificate" "api" {
  domain_name       = "api.${var.dominio}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validacion_api" {
  for_each = {
    for o in aws_acm_certificate.api.domain_validation_options :
    o.domain_name => { name = o.resource_record_name, type = o.resource_record_type, record = o.resource_record_value }
  }

  zone_id = data.aws_route53_zone.principal.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.validacion_api : r.fqdn]
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.principal.zone_id
  name    = "api.${var.dominio}"
  type    = "A"

  alias {
    name                   = aws_lb.yam.dns_name
    zone_id                = aws_lb.yam.zone_id
    evaluate_target_health = true
  }
}

# ── Los servicios ─────────────────────────────────────────────────────────
#
# Uno por contenedor de la pila, todos con la misma forma. `for_each` sobre
# este mapa en vez de cinco bloques repetidos: añadir un servicio es una
# entrada más, no copiar 80 líneas.

locals {
  servicios = {
    postgrest = {
      imagen   = "postgrest/postgrest:${var.version_postgrest}"
      puerto   = 3000
      ruta     = ["/rest/*", "/rpc/*"]
      salud    = "/"
      cpu      = 1024
      memoria  = 2048
      # PostgREST es quien recibe TODO el tráfico de datos del navegador:
      # es el que más escala y el primero que hay que vigilar.
      prioridad = 100
    }
    auth = {
      imagen    = "supabase/gotrue:${var.version_gotrue}"
      puerto    = 9999
      ruta      = ["/auth/*"]
      salud     = "/health"
      cpu       = 512
      memoria   = 1024
      prioridad = 200
    }
    realtime = {
      imagen    = "supabase/realtime:${var.version_realtime}"
      puerto    = 4000
      ruta      = ["/realtime/*"]
      salud     = "/api/health"
      cpu       = 1024
      memoria   = 2048
      prioridad = 300
    }
    storage = {
      imagen    = "supabase/storage-api:${var.version_storage}"
      puerto    = 5000
      ruta      = ["/storage/*"]
      salud     = "/status"
      cpu       = 512
      memoria   = 1024
      prioridad = 400
    }
  }
}

resource "aws_cloudwatch_log_group" "servicios" {
  for_each          = local.servicios
  name              = "/yam/${each.key}"
  retention_in_days = 30
}

resource "aws_lb_target_group" "servicios" {
  for_each = local.servicios

  name        = "yam-${each.key}"
  port        = each.value.puerto
  protocol    = "HTTP"
  vpc_id      = aws_vpc.yam.id
  target_type = "ip"

  health_check {
    path                = each.value.salud
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200-299"
  }

  # Que una tarea que se está apagando termine lo que tiene entre manos.
  deregistration_delay = 30
}

resource "aws_lb_listener_rule" "servicios" {
  for_each = local.servicios

  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.prioridad

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.servicios[each.key].arn
  }

  condition {
    path_pattern {
      values = each.value.ruta
    }
  }
}

resource "aws_ecs_task_definition" "servicios" {
  for_each = local.servicios

  family                   = "yam-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memoria
  execution_role_arn       = aws_iam_role.ejecucion.arn
  task_role_arn            = aws_iam_role.tarea.arn

  runtime_platform {
    cpu_architecture        = "ARM64" # Graviton: ~20% más barato a igual rendimiento.
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name      = each.key
    image     = each.value.imagen
    essential = true

    portMappings = [{ containerPort = each.value.puerto, protocol = "tcp" }]

    # La cadena de conexión apunta al PROXY, nunca al escritor directo. Es lo
    # que hace que miles de clientes no se traduzcan en miles de conexiones.
    environment = [
      { name = "PGRST_DB_URI", value = "postgres://postgres@${aws_db_proxy.yam.endpoint}:5432/postgres?sslmode=require" },
      { name = "PGRST_DB_SCHEMAS", value = "public,storage" },
      { name = "PGRST_DB_ANON_ROLE", value = "anon" },
      { name = "PGRST_DB_POOL", value = "20" },
      { name = "API_EXTERNAL_URL", value = "https://api.${var.dominio}" },
      { name = "GOTRUE_SITE_URL", value = "https://${var.dominio}" },
      { name = "GOTRUE_URI_ALLOW_LIST", value = "https://${var.dominio}/**,https://www.${var.dominio}/**" },
      { name = "DB_HOST", value = aws_db_proxy.yam.endpoint },
      { name = "REGION", value = var.region },
    ]

    secrets = [
      { name = "PGRST_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.jwt.arn}:secret::" },
      { name = "GOTRUE_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.jwt.arn}:secret::" },
      { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.postgres.arn}:password::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.servicios[each.key].name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = each.key
      }
    }
  }])
}

resource "aws_ecs_service" "servicios" {
  for_each = local.servicios

  name            = each.key
  cluster         = aws_ecs_cluster.yam.id
  task_definition = aws_ecs_task_definition.servicios[each.key].arn
  desired_count   = var.tareas_min
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.privada[*].id
    security_groups = [aws_security_group.servicios.id]
    # Sin IP pública: se sale por el NAT y no se entra desde fuera.
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.servicios[each.key].arn
    container_name   = each.key
    container_port   = each.value.puerto
  }

  # Despliegue sin caída: levanta las nuevas, comprueba que responden, y solo
  # entonces retira las viejas. Si las nuevas no pasan la revisión de salud,
  # revierte solo.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Margen para que el contenedor arranque antes de darlo por muerto.
  health_check_grace_period_seconds = 60

  lifecycle {
    # El autoescalado manda sobre el número de tareas, no Terraform. Sin esto,
    # cada `apply` devolvería el servicio al mínimo en plena hora punta.
    ignore_changes = [desired_count]
  }
}

# ── Autoescalado ──────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "servicios" {
  for_each = local.servicios

  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.yam.name}/${aws_ecs_service.servicios[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.tareas_min
  max_capacity       = var.tareas_max
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = local.servicios

  name               = "yam-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.servicios[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.servicios[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.servicios[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value = 60 # Deja aire para un pico repentino.

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    # Sube rápido, baja despacio: quedarse corto cuesta caídas; sobrar cuesta
    # céntimos.
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}

# ── Permisos de las tareas ────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_asume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ejecucion" {
  name               = "yam-ecs-ejecucion"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

resource "aws_iam_role_policy_attachment" "ejecucion" {
  role       = aws_iam_role.ejecucion.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ejecucion_secretos" {
  name = "leer-secretos"
  role = aws_iam_role.ejecucion.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.postgres.arn, aws_secretsmanager_secret.jwt.arn]
    }]
  })
}

resource "aws_iam_role" "tarea" {
  name               = "yam-ecs-tarea"
  assume_role_policy = data.aws_iam_policy_document.ecs_asume.json
}

# ── WAF ───────────────────────────────────────────────────────────────────
#
# El endpoint queda abierto a internet, igual que hoy con Supabase. La app ya
# tiene su propio freno contra solicitudes masivas en la base (migración 0063),
# pero eso se evalúa DESPUÉS de gastar una conexión de Postgres. El WAF corta
# antes de llegar.

resource "aws_wafv2_web_acl" "yam" {
  name  = "yam"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "limite-por-ip"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        # 2.000 peticiones por IP cada 5 minutos. Generoso a propósito: un
        # comercio cargando un CSV de 500 destinatarios hace muchas peticiones
        # seguidas y legítimas.
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "limite-por-ip"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "reglas-comunes-aws"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "reglas-comunes"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "yam"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "yam" {
  resource_arn = aws_lb.yam.arn
  web_acl_arn  = aws_wafv2_web_acl.yam.arn
}
