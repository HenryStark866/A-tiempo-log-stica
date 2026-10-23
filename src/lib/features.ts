/**
 * Control centralizado de Feature Flags del aplicativo YAM.
 *
 * Permite gobernar la visibilidad de módulos en la interfaz pública y menús
 * sin eliminar código, rutas, componentes ni tablas de la base de datos.
 */

export const FEATURES = {
  /**
   * Controla si las opciones públicas de mensajería (como postulación/registro
   * de mensajeros en la web abierta) se muestran a los visitantes.
   *
   * Por defecto: FALSE.
   * La flota de mensajeros se habilita, asigna y administra privadamente desde
   * el panel operativo de CEDI y Administración (/mensajeros). Todo el código,
   * endpoints, tablas y rutas de conductores siguen 100% intactos.
   */
  MOSTRAR_MENSAJERIA_PUBLICO:
    process.env.NEXT_PUBLIC_FEATURE_MENSAJERIA_PUBLICO === "true",

  /**
   * Vitrina pública y experiencia de compra abierta para clientes e invitados.
   * Por defecto: TRUE.
   */
  VITRINA_PUBLICA_ACTIVA:
    process.env.NEXT_PUBLIC_FEATURE_VITRINA_PUBLICA !== "false",

  /**
   * Roles internos avanzados en registro público (asesores y CEDIs afiliados).
   * Por defecto: FALSE (ocultos de la interfaz pública para priorizar compradores y comercios).
   * Todo el código, lógica, validaciones y tablas de asesor y CEDI se mantienen intactos.
   */
  MOSTRAR_ROLES_LOGISTICOS_REGISTRO:
    process.env.NEXT_PUBLIC_FEATURE_ROLES_LOGISTICOS_REGISTRO === "true",

  /**
   * Catálogo de muestra (src/data/mockProducts.ts) cuando la base no devuelve
   * NINGÚN producto real o la consulta falla.
   * Por defecto: TRUE (comportamiento que ya tenía la portada).
   * Con `NEXT_PUBLIC_FEATURE_VITRINA_CATALOGO_DEMO=false` la portada muestra el
   * estado vacío en lugar de marcas de ejemplo.
   */
  VITRINA_CATALOGO_DEMO:
    process.env.NEXT_PUBLIC_FEATURE_VITRINA_CATALOGO_DEMO !== "false",

  /**
   * Insignias de inventario (Agotado, Últimas unidades, Bajo pedido, vendidos)
   * y precios de oferta en la vitrina. Por defecto: TRUE.
   * Apagarlo deja las tarjetas como estaban (precio único, sin insignias); el
   * checkout sigue cobrando la columna `price`, que es el precio final.
   */
  VITRINA_INVENTARIO_Y_OFERTAS:
    process.env.NEXT_PUBLIC_FEATURE_VITRINA_INVENTARIO_OFERTAS !== "false",
};
