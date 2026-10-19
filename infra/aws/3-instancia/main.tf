# ═══════════════════════════════════════════════════════════════════════════
# UNA INSTANCIA CON TODO EL BACKEND (opción de créditos)
#
# EC2 + Docker con la pila abierta (Postgres, GoTrue, PostgREST, Realtime,
# Storage) detrás de Caddy, que saca solo el certificado TLS.
#
# Lo que NO hay, a propósito, por costo: ALB, NAT Gateway, RDS Proxy, Aurora,
# WAF y endpoints de VPC. A cambio, esto NO tiene alta disponibilidad: si la
# máquina cae, el servicio cae hasta que se recupere (la alarma de sistema la
# recupera sola, ~5 min) o se restaure. Los respaldos son:
#   · snapshot diario del disco (DLM), 7 días
#   · pg_dump cada 6 horas + archivos a S3 (con versionado), 35 días
# El punto de recuperación es de hasta 6 h; NO hay recuperación al minuto.
# ═══════════════════════════════════════════════════════════════════════════

data "aws_caller_identity" "yo" {}

data "aws_vpc" "predeterminada" {
  default = true
}

data "aws_subnet" "elegida" {
  vpc_id            = data.aws_vpc.predeterminada.id
  availability_zone = var.zona
  default_for_az    = true
}

data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "aws_route53_zone" "principal" {
  name = "${var.dominio}."
}

data "aws_sns_topic" "alertas" {
  name = "yam-alertas"
}

locals {
  bucket   = "atl-yam-respaldos-${data.aws_caller_identity.yo.account_id}"
  api_host = "api.${var.dominio}"
}

# ── Red: solo 80 y 443. Sin SSH: se entra por Session Manager (SSM). ───────

resource "aws_security_group" "instancia" {
  name        = "yam-instancia"
  description = "HTTPS y HTTP (para el certificado). Sin SSH."
  vpc_id      = data.aws_vpc.predeterminada.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ── Respaldos en S3 ──────────────────────────────────────────────────────────

resource "aws_s3_bucket" "respaldos" {
  bucket = local.bucket

  # Que un `terraform destroy` distraído no se lleve los respaldos.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "respaldos" {
  bucket                  = aws_s3_bucket.respaldos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "respaldos" {
  bucket     = aws_s3_bucket.respaldos.id
  depends_on = [aws_s3_bucket_versioning.respaldos]

  rule {
    id     = "dumps-35-dias"
    status = "Enabled"
    filter {
      prefix = "dumps/"
    }
    expiration {
      days = 35
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  rule {
    id     = "archivos-versiones-viejas"
    status = "Enabled"
    filter {
      prefix = "archivos/"
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "limpiar-subidas-incompletas"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

# ── Permisos de la instancia: lo mínimo ─────────────────────────────────────
# Puede ESCRIBIR y leer respaldos, pero no borrarlos: si la máquina se
# compromete, no puede destruir su propio respaldo.

data "aws_iam_policy_document" "ec2_asume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instancia" {
  name               = "yam-instancia"
  assume_role_policy = data.aws_iam_policy_document.ec2_asume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instancia.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "instancia" {
  statement {
    sid       = "RespaldosEscribirYLeer"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.respaldos.arn}/*"]
  }
  statement {
    sid       = "RespaldosListar"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.respaldos.arn]
  }
  statement {
    sid       = "SecretosDeLaInstancia"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter"]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.yo.account_id}:parameter/yam/instancia/*"]
  }
  statement {
    sid       = "MetricaDelRespaldo"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["YAM/Respaldo"]
    }
  }
}

resource "aws_iam_role_policy" "instancia" {
  name   = "respaldos-secretos-metrica"
  role   = aws_iam_role.instancia.id
  policy = data.aws_iam_policy_document.instancia.json
}

resource "aws_iam_instance_profile" "instancia" {
  name = "yam-instancia"
  role = aws_iam_role.instancia.name
}

# ── Disco de datos: aparte de la máquina, para sobrevivir a ella ─────────────

resource "aws_ebs_volume" "datos" {
  availability_zone = data.aws_subnet.elegida.availability_zone
  size              = var.disco_datos_gb
  type              = "gp3"
  encrypted         = true

  tags = {
    Name     = "yam-datos"
    Respaldo = "diario"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "datos" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.datos.id
  instance_id = aws_instance.yam.id
}

# ── La instancia ─────────────────────────────────────────────────────────────

resource "aws_instance" "yam" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.tipo_instancia
  subnet_id              = data.aws_subnet.elegida.id
  vpc_security_group_ids = [aws_security_group.instancia.id]
  iam_instance_profile   = aws_iam_instance_profile.instancia.name

  # "unlimited": si el CPU se sostiene por encima de la base, se paga el
  # exceso en vez de estrangular la base de datos. La alarma de abajo avisa.
  credit_specification {
    cpu_credits = "unlimited"
  }

  metadata_options {
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 2          # los contenedores leen el rol
  }

  root_block_device {
    volume_size = var.disco_raiz_gb
    volume_type = "gp3"
    encrypted   = true
    tags = {
      Name     = "yam-raiz"
      Respaldo = "diario"
    }
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    bucket          = aws_s3_bucket.respaldos.bucket
    region          = var.region
    volume_id       = aws_ebs_volume.datos.id
    compose_version = var.version_compose
    api_host        = local.api_host
    sitio           = var.sitio
    correo_acme     = var.correo_acme
  })

  tags = {
    Name = "yam"
  }

  lifecycle {
    # Una AMI nueva o un cambio del script NO deben recrear la máquina que
    # tiene la base de datos.
    ignore_changes = [ami, user_data]
  }
}

resource "aws_eip" "yam" {
  domain = "vpc"
  tags   = { Name = "yam" }
}

resource "aws_eip_association" "yam" {
  instance_id   = aws_instance.yam.id
  allocation_id = aws_eip.yam.id
}

# El registro vive en la zona de Route 53, pero mientras los NS del dominio
# sigan en GoDaddy NO resuelve en internet: para que Let's Encrypt emita el
# certificado hay que crear TAMBIÉN un registro A `api` en GoDaddy hacia la IP.
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.principal.zone_id
  name    = local.api_host
  type    = "A"
  ttl     = 60
  records = [aws_eip.yam.public_ip]
}

# ── Snapshots diarios del disco (DLM) ───────────────────────────────────────

data "aws_iam_policy_document" "dlm_asume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dlm" {
  name               = "yam-dlm"
  assume_role_policy = data.aws_iam_policy_document.dlm_asume.json
}

resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "diario" {
  description        = "Snapshot diario de los discos de YAM"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { Respaldo = "diario" }

    schedule {
      name = "diario-02h-medellin"
      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["07:00"] # 02:00 en Medellín, sin reparto
      }
      retain_rule {
        count = var.retencion_snapshots
      }
      copy_tags = true
    }
  }
}

# ── «Solo se gastan los créditos» ───────────────────────────────────────────
# AWS no permite poner un tope duro de gasto: lo que no cubren los créditos se
# cobra en la tarjeta. Esto es el aviso temprano. El presupuesto mide el costo YA
# DESCONTADOS los créditos (include_credit = true), así que mientras los créditos
# alcancen marca ~0 y suena en cuanto aparezca dinero real: al pasar de 1 USD
# (actual) o cuando se PREVEA pasar de 3 USD en el mes.
#
# El presupuesto yam-mensual de la pila 1 avisa recién a los 16 USD (80% de 20):
# demasiado tarde para esto. Los datos de Budgets tardan hasta un día en
# actualizarse; a ~1 USD diario de consumo, el aviso llega con ~1-2 USD de cobro.
resource "aws_budgets_budget" "solo_creditos" {
  name         = "yam-solo-creditos"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = true
    include_refund = true
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 1
    threshold_type             = "ABSOLUTE_VALUE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.correo_alertas]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 3
    threshold_type             = "ABSOLUTE_VALUE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.correo_alertas]
  }
}

# ── Alarmas (van al mismo tema SNS ya confirmado: yam-alertas) ──────────────

resource "aws_cloudwatch_metric_alarm" "sistema" {
  alarm_name        = "yam-instancia-fallo-de-sistema"
  alarm_description = "El hardware de la instancia falló. Se recupera sola (reinicia en otro host)."
  namespace         = "AWS/EC2"
  metric_name       = "StatusCheckFailed_System"
  dimensions        = { InstanceId = aws_instance.yam.id }

  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [
    "arn:aws:automate:${var.region}:ec2:recover",
    data.aws_sns_topic.alertas.arn,
  ]
}

resource "aws_cloudwatch_metric_alarm" "instancia" {
  alarm_name        = "yam-instancia-sin-respuesta"
  alarm_description = "El sistema operativo no responde. Hay que entrar por Session Manager o reiniciar."
  namespace         = "AWS/EC2"
  metric_name       = "StatusCheckFailed_Instance"
  dimensions        = { InstanceId = aws_instance.yam.id }

  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [data.aws_sns_topic.alertas.arn]
}

resource "aws_cloudwatch_metric_alarm" "creditos_cpu" {
  alarm_name        = "yam-instancia-cpu-pagando-exceso"
  alarm_description = "El CPU lleva rato por encima de la base y se está cobrando el exceso (modo unlimited). Si es sostenido, subir a t4g.large."
  namespace         = "AWS/EC2"
  metric_name       = "CPUSurplusCreditsCharged"
  dimensions        = { InstanceId = aws_instance.yam.id }

  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [data.aws_sns_topic.alertas.arn]
}

# El respaldo que falla en silencio es el fallo clásico. El script publica una
# métrica al terminar bien; si pasan ~2 días sin ella, suena la alarma.
resource "aws_cloudwatch_metric_alarm" "respaldo" {
  alarm_name        = "yam-respaldo-no-se-hizo"
  alarm_description = "Hace 18 horas o más que no termina bien el pg_dump a S3 (debería hacerse cada 6)."
  namespace         = "YAM/Respaldo"
  metric_name       = "RespaldoExitoso"

  # Tres ventanas de 6 h seguidas sin ningún respaldo bueno. Una sola ventana
  # vacía puede ser solo el desfase entre el horario y la ventana.
  statistic           = "Sum"
  period              = 21600
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  alarm_actions = [data.aws_sns_topic.alertas.arn]
}
