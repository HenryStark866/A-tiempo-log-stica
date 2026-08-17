# ═══════════════════════════════════════════════════════════════════════════
# LA BASE DE DATOS
#
# Aurora PostgreSQL, y delante RDS Proxy. El proxy es lo que hace que esto
# aguante miles de usuarios; sin él, lo demás no importa.
#
# ── Por qué el proxy no es opcional ──────────────────────────────────────
#
# PostgREST abre una conexión de Postgres por petición. Postgres no aguanta
# miles de conexiones concurrentes: cada una cuesta memoria, y pasado cierto
# punto el servidor dedica más tiempo a cambiar de contexto que a responder.
# Se cae por agotamiento de conexiones mucho antes que por CPU.
#
# Supabase gestionado ya trae esto resuelto (Supavisor). Al autogestionar la
# pila, esa pieza hay que ponerla, y es justo la que se olvida — el sistema
# funciona perfecto en pruebas y se derrumba el día que entra tráfico real.
# ═══════════════════════════════════════════════════════════════════════════

resource "random_password" "postgres" {
  length  = 32
  special = false # Evita líos de escapado en cadenas de conexión.
}

resource "aws_secretsmanager_secret" "postgres" {
  name                    = "yam/postgres"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "postgres" {
  secret_id = aws_secretsmanager_secret.postgres.id
  secret_string = jsonencode({
    username = "postgres"
    password = random_password.postgres.result
  })
}

# El secreto que firma los JWT. Lo comparten GoTrue (los emite) y PostgREST
# (los verifica). Si no coinciden, la sesión de cualquiera vale para nada.
resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt" {
  name                    = "yam/jwt"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = jsonencode({ secret = random_password.jwt.result })
}

resource "aws_db_subnet_group" "yam" {
  name       = "yam"
  subnet_ids = aws_subnet.privada[*].id
}

resource "aws_rds_cluster" "yam" {
  cluster_identifier = "yam"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = "16.4"
  database_name      = "postgres"

  master_username = "postgres"
  master_password = random_password.postgres.result

  db_subnet_group_name   = aws_db_subnet_group.yam.name
  vpc_security_group_ids = [aws_security_group.base.id]

  serverlessv2_scaling_configuration {
    min_capacity = var.acu_min
    max_capacity = var.acu_max
  }

  # ── Respaldo ────────────────────────────────────────────────────────────
  backup_retention_period      = var.retencion_respaldos_dias
  preferred_backup_window      = "07:00-08:00"  # 02:00-03:00 en Medellín: sin reparto.
  preferred_maintenance_window = "tue:08:00-tue:09:00"
  copy_tags_to_snapshot        = true

  storage_encrypted = true

  # Tres cinturones contra el borrado accidental de una base con dinero dentro:
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "yam-final-${formatdate("YYYYMMDD-hhmm", timestamp())}"

  # Los logs de Postgres a CloudWatch: sin esto, una consulta lenta o un error
  # de RLS en producción no deja rastro consultable.
  enabled_cloudwatch_logs_exports = ["postgresql"]

  lifecycle {
    # `timestamp()` cambia en cada plan y provocaría un diff eterno.
    ignore_changes = [final_snapshot_identifier]
  }
}

# El escritor, y las réplicas. Aurora coloca cada instancia en una zona
# distinta y promociona una réplica sola si el escritor cae.
resource "aws_rds_cluster_instance" "nodos" {
  count = 1 + var.replicas_lectura

  identifier         = "yam-${count.index}"
  cluster_identifier = aws_rds_cluster.yam.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.yam.engine
  engine_version     = aws_rds_cluster.yam.engine_version

  # Cuanto más bajo el número, antes se promociona. El 0 es el escritor.
  promotion_tier = count.index

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitor.arn
}

resource "aws_iam_role" "rds_monitor" {
  name = "yam-rds-monitor"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitor" {
  role       = aws_iam_role.rds_monitor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── RDS Proxy ─────────────────────────────────────────────────────────────

resource "aws_iam_role" "proxy" {
  name = "yam-rds-proxy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "proxy" {
  name = "leer-credenciales"
  role = aws_iam_role.proxy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.postgres.arn]
    }]
  })
}

resource "aws_db_proxy" "yam" {
  name                   = "yam"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.proxy.arn
  vpc_subnet_ids         = aws_subnet.privada[*].id
  vpc_security_group_ids = [aws_security_group.proxy.id]

  # Que no se quede una conexión colgada para siempre si un contenedor muere.
  idle_client_timeout = 1800
  require_tls         = true

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.postgres.arn
  }
}

resource "aws_db_proxy_default_target_group" "yam" {
  db_proxy_name = aws_db_proxy.yam.name

  connection_pool_config {
    # Deja un 10% de conexiones libres para tareas administrativas: si el pool
    # se come el 100%, no queda ni una para entrar a diagnosticar por qué.
    max_connections_percent      = 90
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

resource "aws_db_proxy_target" "yam" {
  db_proxy_name         = aws_db_proxy.yam.name
  target_group_name     = aws_db_proxy_default_target_group.yam.name
  db_cluster_identifier = aws_rds_cluster.yam.id
}

# Endpoint de solo lectura: las pantallas que solo consultan —el tablero, el
# rastreo público— pueden ir a la réplica y dejarle el escritor a lo que
# escribe. Es la palanca más barata cuando el volumen suba.
resource "aws_db_proxy_endpoint" "lectura" {
  count                  = var.replicas_lectura > 0 ? 1 : 0
  db_proxy_name          = aws_db_proxy.yam.name
  db_proxy_endpoint_name = "yam-lectura"
  vpc_subnet_ids         = aws_subnet.privada[*].id
  vpc_security_group_ids = [aws_security_group.proxy.id]
  target_role            = "READ_ONLY"
}
