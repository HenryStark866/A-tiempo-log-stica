variable "region" {
  description = <<-DESC
    Región de AWS.

    us-east-1 por dos motivos: es la más barata y la que primero recibe
    servicios nuevos, y desde Medellín tiene mejor latencia que us-west-2,
    donde estaba el proyecto viejo de Supabase.
  DESC
  type        = string
  default     = "us-east-1"
}

variable "dominio" {
  description = "Dominio raíz de la plataforma."
  type        = string
  default     = "atiempologistica.com"
}

variable "correo_alertas" {
  description = <<-DESC
    A dónde llegan las alarmas de CloudWatch y el aviso de presupuesto.

    Conviene que sea una lista de distribución de los tres socios y no el correo
    de una persona: el punto focal rota cada semana y una alarma que llega al
    buzón de quien está de vacaciones no sirve de nada.
  DESC
  type        = string
}

variable "vercel_ip" {
  description = <<-DESC
    IP del registro A de Vercel para el ápice del dominio.

    ⚠️ NO HAY UNA IP ÚNICA. `76.76.21.21` es la anycast clásica y sirve para
    muchos proyectos, pero los proyectos nuevos toman una IP de un pool según el
    plan y el proyecto —puede salir `216.198.79.1` u otra distinta—.

    **Manda lo que muestre la tarjeta de Vercel → Settings → Domains.** Copiar
    la de otro proyecto, o la de un tutorial, es la causa número uno de que un
    dominio quede apuntando a ninguna parte.

    Por eso NO hay valor por defecto: obliga a mirarlo.
  DESC
  type        = string
}

variable "vercel_cname" {
  description = <<-DESC
    Destino del CNAME de `www`. Este sí es estable en todos los proyectos, pero
    confírmalo en la misma tarjeta que la IP.
  DESC
  type        = string
  default     = "cname.vercel-dns.com"
}

variable "supabase_url" {
  description = <<-DESC
    URL del proyecto de Supabase que sirve producción. La usa la Lambda del
    reloj de Shopify para llamar a la edge function.

    Ojo: hay una mudanza de proyecto a medias. Confirmar cuál está sirviendo
    de verdad antes de aplicar.
  DESC
  type        = string
}

variable "presupuesto_mensual_usd" {
  description = <<-DESC
    Tope mensual para el aviso de presupuesto.

    Todo lo de este Terraform debería costar menos de 5 USD/mes al volumen de
    hoy: la zona de Route 53 son 0,50 USD, y Lambda, SES y CloudFront caben en
    la capa gratuita. Un aviso en 20 avisa de que algo se salió de madre —una
    Lambda en bucle, un bucket que alguien llenó— antes de que sea una factura.
  DESC
  type        = number
  default     = 20
}

variable "cada_cuantos_minutos_shopify" {
  description = "Cadencia del reloj de Shopify. 15 min es lo que hacía pg_cron."
  type        = number
  default     = 15
}
