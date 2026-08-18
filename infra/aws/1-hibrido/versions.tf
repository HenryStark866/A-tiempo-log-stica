# ═══════════════════════════════════════════════════════════════════════════
# Proveedores y estado
#
# El estado va en S3 con bloqueo en DynamoDB. Con tres socios que pueden tocar
# esto desde equipos distintos, un estado local es cuestión de tiempo hasta que
# dos aplican a la vez y se pisan.
#
# Huevo y gallina: el bucket y la tabla del estado no se pueden crear con este
# mismo Terraform, porque hacen falta ANTES de que exista el estado. Se crean
# una vez a mano — está en README.md, paso 0.
# ═══════════════════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "atl-terraform-estado"
    key          = "yam/1-hibrido.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  # Todo lo que cree este Terraform queda marcado. Sin esto, dentro de seis
  # meses nadie sabe qué recurso de la cuenta salió de aquí y cuál se creó a
  # mano por la consola.
  default_tags {
    tags = {
      Proyecto = "YAM"
      Empresa  = "A Tiempo Logistica SAS"
      Gestion  = "terraform"
      Repo     = "HenryStark866/A-tiempo-log-stica"
    }
  }
}

# CloudFront solo acepta certificados de ACM emitidos en us-east-1, pase lo que
# pase con `var.region`. Por eso este proveedor extra.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Proyecto = "YAM"
      Empresa  = "A Tiempo Logistica SAS"
      Gestion  = "terraform"
    }
  }
}
