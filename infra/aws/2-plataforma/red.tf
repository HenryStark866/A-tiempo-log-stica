# ═══════════════════════════════════════════════════════════════════════════
# LA RED
#
# Tres zonas de disponibilidad. Con dos, perder una deja la mitad de la
# capacidad; con tres, un tercio. Es la diferencia entre degradarse y caerse, y
# es la base de todo lo que viene después.
#
# Las subredes privadas no tienen ruta a internet salvo por el NAT. Ahí van la
# base de datos y los contenedores: nada de eso debería ser alcanzable desde
# fuera ni por accidente.
# ═══════════════════════════════════════════════════════════════════════════

locals {
  azs = slice(data.aws_availability_zones.disponibles.names, 0, 3)
}

resource "aws_vpc" "yam" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "yam" }
}

resource "aws_internet_gateway" "yam" {
  vpc_id = aws_vpc.yam.id
  tags   = { Name = "yam" }
}

resource "aws_subnet" "publica" {
  count                   = 3
  vpc_id                  = aws_vpc.yam.id
  cidr_block              = "10.20.${count.index}.0/24"
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "yam-publica-${local.azs[count.index]}" }
}

resource "aws_subnet" "privada" {
  count             = 3
  vpc_id            = aws_vpc.yam.id
  cidr_block        = "10.20.${count.index + 10}.0/24"
  availability_zone = local.azs[count.index]
  tags              = { Name = "yam-privada-${local.azs[count.index]}" }
}

# ── Salida a internet desde lo privado ────────────────────────────────────
#
# UN SOLO NAT, no tres. Un NAT por zona sería lo canónico para alta
# disponibilidad, pero cuesta ~32 USD/mes cada uno más el tráfico, y aquí lo
# único que sale a internet son las llamadas a Shopify y a la pasarela de pago.
#
# El compromiso, dicho claro: si se cae la zona del NAT, los contenedores de las
# otras dos pierden la salida a internet — pero la app SIGUE respondiendo,
# porque el tráfico de entrada y la base de datos no pasan por aquí. Cuando el
# volumen justifique los otros dos, se sube `count` a 3 y se ajusta la tabla de
# rutas.
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "yam-nat" }
}

resource "aws_nat_gateway" "yam" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.publica[0].id
  depends_on    = [aws_internet_gateway.yam]
  tags          = { Name = "yam" }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.yam.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.yam.id
  }
  tags = { Name = "yam-publica" }
}

resource "aws_route_table_association" "publica" {
  count          = 3
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table" "privada" {
  vpc_id = aws_vpc.yam.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.yam.id
  }
  tags = { Name = "yam-privada" }
}

resource "aws_route_table_association" "privada" {
  count          = 3
  subnet_id      = aws_subnet.privada[count.index].id
  route_table_id = aws_route_table.privada.id
}

# ── Endpoints: menos factura de NAT y menos superficie ────────────────────
#
# Sin esto, cada lectura de S3 o de Secrets Manager sale por el NAT y se paga
# por GB. Con endpoints va por la red de AWS: más barato, más rápido, y ese
# tráfico deja de pasar por internet.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.yam.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.privada.id]
}

resource "aws_security_group" "endpoints" {
  name   = "yam-endpoints"
  vpc_id = aws_vpc.yam.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.yam.cidr_block]
  }
}

resource "aws_vpc_endpoint" "interfaz" {
  for_each = toset(["secretsmanager", "ecr.api", "ecr.dkr", "logs"])

  vpc_id              = aws_vpc.yam.id
  service_name        = "com.amazonaws.${var.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.privada[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
}

# ── Quién habla con quién ─────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name        = "yam-alb"
  description = "Lo unico abierto a internet."
  vpc_id      = aws_vpc.yam.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # El 80 solo existe para redirigir a HTTPS.
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

resource "aws_security_group" "servicios" {
  name        = "yam-servicios"
  description = "Contenedores. Solo reciben del ALB."
  vpc_id      = aws_vpc.yam.id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Entre ellos: Realtime consulta a la base y los servicios se hablan.
  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "base" {
  name        = "yam-base-de-datos"
  description = "Postgres. NO acepta nada de internet, ni siquiera del ALB."
  vpc_id      = aws_vpc.yam.id

  # Solo el proxy. Los contenedores NO hablan con Postgres directamente: pasan
  # por RDS Proxy. Eso está forzado aquí, no confiado a la configuración.
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.proxy.id]
  }
}

resource "aws_security_group" "proxy" {
  name        = "yam-rds-proxy"
  description = "RDS Proxy: recibe de los servicios, habla con Postgres."
  vpc_id      = aws_vpc.yam.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.servicios.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
