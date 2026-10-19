variable "region" {
  type    = string
  default = "us-east-1"
}

variable "zona" {
  description = "Zona de disponibilidad de la instancia y del disco de datos (tienen que ser la misma)."
  type        = string
  default     = "us-east-1a"
}

variable "dominio" {
  type    = string
  default = "atiempologistica.com"
}

variable "tipo_instancia" {
  description = <<-DESC
    t4g.medium = 2 vCPU y 4 GB, el mínimo que pide Supabase autoalojado. Con 9
    comercios sobra; si Realtime o Postgres aprietan la memoria, subir a
    t4g.large (8 GB, el doble de precio) sin perder datos: están en el disco
    aparte.
  DESC
  type        = string
  default     = "t4g.medium"
}

variable "disco_raiz_gb" {
  type    = number
  default = 20
}

variable "disco_datos_gb" {
  description = "Postgres y los archivos subidos. Se agranda sin parar la máquina; no se puede achicar."
  type        = number
  default     = 30
}

variable "retencion_snapshots" {
  description = "Cuántos snapshots diarios del disco se conservan."
  type        = number
  default     = 7
}

variable "version_compose" {
  description = "Versión fijada del plugin docker compose. VERIFICAR que existe antes del apply."
  type        = string
  default     = "2.29.7"
}

variable "correo_acme" {
  description = "Correo para el aviso de vencimiento del certificado de Let's Encrypt."
  type        = string
}
