# ═══════════════════════════════════════════════════════════════════════════
# Proveedores y estado — pila 3: UNA instancia con todo el backend
#
# Estado propio (otra llave en el mismo bucket de 1-hibrido): un `apply` aquí
# no puede tocar Route 53/SES/CloudFront, y al revés.
# ═══════════════════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "atl-terraform-estado"
    key          = "yam/3-instancia.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Proyecto = "YAM"
      Empresa  = "A Tiempo Logistica SAS"
      Gestion  = "terraform"
      Pila     = "3-instancia"
    }
  }
}
