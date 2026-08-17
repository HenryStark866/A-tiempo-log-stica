variable "region" {
  type    = string
  default = "us-east-1"
}

variable "dominio" {
  type    = string
  default = "atiempologistica.com"
}

variable "correo_alertas" {
  description = "Lista de los tres socios, no el correo de una persona."
  type        = string
}

# ── Base de datos ─────────────────────────────────────────────────────────

variable "acu_min" {
  description = <<-DESC
    Capacidad mínima de Aurora Serverless v2, en ACU (1 ACU ≈ 2 GB de RAM).

    Esto se paga SIEMPRE, se use o no: es el suelo. Con 0.5 la base nunca se
    duerme del todo, que es lo que hace que la primera consulta de la mañana no
    tarde. Para miles de usuarios concurrentes conviene subirlo a 2, pero
    empezar bajo y subir viendo la métrica es más barato que al revés.
  DESC
  type        = number
  default     = 0.5
}

variable "acu_max" {
  description = <<-DESC
    Techo de Aurora. Es también el tope de gasto si algo se desboca —una
    consulta sin índice en bucle, por ejemplo—.

    16 ACU son ~32 GB de RAM: sobra para miles de usuarios de esta aplicación,
    donde la carga es corta y transaccional, no analítica.
  DESC
  type        = number
  default     = 16
}

variable "replicas_lectura" {
  description = <<-DESC
    Réplicas de lectura, en OTRA zona de disponibilidad que el escritor.

    Con 1 hay conmutación automática si se cae la zona del escritor: eso es lo
    que convierte «tenemos backup» en «seguimos funcionando». Es el requisito
    de estabilidad, no un lujo.
  DESC
  type        = number
  default     = 1
}

variable "retencion_respaldos_dias" {
  description = <<-DESC
    Días de respaldo automático con recuperación a un punto en el tiempo.

    35 es el máximo de Aurora. Con dinero contraentrega y datos personales de
    por medio, poder volver al minuto anterior a un borrado accidental vale más
    que lo que cuesta el almacenamiento.
  DESC
  type        = number
  default     = 35
}

# ── Servicios ─────────────────────────────────────────────────────────────

variable "tareas_min" {
  description = "Tareas por servicio en reposo. 2 y no 1: con una sola, un despliegue o una caída deja el servicio a cero."
  type        = number
  default     = 2
}

variable "tareas_max" {
  type    = number
  default = 20
}

variable "version_postgrest" {
  type    = string
  default = "v12.2.3"
}

variable "version_gotrue" {
  type    = string
  default = "v2.158.1"
}

variable "version_realtime" {
  type    = string
  default = "v2.30.34"
}

variable "version_storage" {
  type    = string
  default = "v1.11.13"
}
