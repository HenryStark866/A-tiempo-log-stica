terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    bucket       = "atl-terraform-estado"
    key          = "yam/2-plataforma.tfstate"
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
      Pila     = "plataforma"
    }
  }
}

data "aws_availability_zones" "disponibles" {
  state = "available"
}
