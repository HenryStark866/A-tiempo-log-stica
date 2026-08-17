# ═══════════════════════════════════════════════════════════════════════════
# Guardarraíl de costos
#
# Primera cuenta de AWS de la empresa. Lo de este Terraform cuesta céntimos,
# pero una cuenta sin aviso de presupuesto es como no tener el freno de mano:
# no lo usas nunca hasta el día que lo necesitas.
#
# Avisa al 80% y al 100% de lo previsto, y también cuando la PREVISIÓN del mes
# se pase — ese es el que sirve de verdad, porque llega el día 5 y no el 28.
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_budgets_budget" "mensual" {
  name         = "yam-mensual"
  budget_type  = "COST"
  limit_amount = tostring(var.presupuesto_mensual_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.correo_alertas]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.correo_alertas]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.correo_alertas]
  }
}
