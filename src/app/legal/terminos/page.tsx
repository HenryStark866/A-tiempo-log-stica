import type { Metadata } from "next";
import { PaginaLegal, DatosDelResponsable } from "@/components/PaginaLegal";
import { MARCA } from "@/lib/marca";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: `Condiciones de uso de ${MARCA.app}, la plataforma de última milla de ${MARCA.empresa}.`,
};

/**
 * Términos y condiciones del servicio.
 *
 * Describe lo que la plataforma hace de verdad hoy: los estados por los que
 * pasa un pedido, cómo se cobra el contraentrega, cuándo se le gira al
 * comercio y qué pasa con una devolución. Nada de cláusulas copiadas que
 * prometan cosas que el software no hace.
 *
 * NO es asesoría legal: antes de darlo por definitivo tiene que revisarlo un
 * abogado, sobre todo los límites de responsabilidad.
 */
export default function TerminosPage() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      entradilla={`Las reglas del servicio de ${MARCA.app}: qué hacemos, qué esperamos de ti y qué pasa cuando algo sale mal.`}
    >
      <DatosDelResponsable />

      <h2>Qué es esto</h2>
      <p>
        {MARCA.app} es la plataforma con la que {MARCA.empresa} presta el servicio de mensajería
        de última milla: recoge paquetes en el comercio, los procesa en un centro de
        distribución y los entrega al destinatario, cobrando contraentrega cuando así se pacta.
      </p>

      <h2>Quién puede usarla</h2>
      <ul>
        <li>
          <strong>Comercios:</strong> negocios que despachan pedidos. Registran sus envíos y
          reciben el recaudo.
        </li>
        <li>
          <strong>Mensajeros:</strong> quienes recogen y entregan. Deben estar habilitados, y
          para habilitarse hay que presentar los documentos que se piden en la app.
        </li>
        <li>
          <strong>Personal de operación:</strong> quienes coordinan el centro de distribución.
        </li>
      </ul>
      <p>
        Una cuenta nueva nace pendiente: alguien de {MARCA.empresaCorto} revisa y asigna el rol
        antes de que se pueda operar. Cada quien responde por lo que se haga desde su cuenta y
        se compromete a no compartir su contraseña.
      </p>

      <h2>Cómo funciona un envío</h2>
      <p>
        El comercio registra el pedido, se programa una recogida, el mensajero la confirma
        paquete por paquete, el centro de distribución lo recibe y lo asigna a una ruta, y se
        entrega al destinatario dejando constancia. Cada paso queda registrado con su hora.
      </p>
      <p>
        Las recogidas se agendan dentro de la jornada, en turnos de quince minutos, y no se
        pueden pedir para un momento que ya pasó.
      </p>

      <h2>El dinero</h2>
      <ul>
        <li>
          <strong>Contraentrega:</strong> si el pedido se marca como contraentrega, tiene que
          decir cuánto cobrar. El mensajero recauda esa suma al entregar.
        </li>
        <li>
          <strong>Giro al comercio:</strong> lo recaudado se le devuelve al comercio en una
          remesa, descontando lo que corresponda por el servicio de domicilio y lo que tenga
          pendiente de facturas.
        </li>
        <li>
          <strong>Tarifas:</strong> el precio del domicilio depende de la zona de origen y la de
          destino, y queda congelado en el pedido en el momento de crearlo: un cambio de tarifa
          posterior no altera lo ya despachado.
        </li>
        <li>
          <strong>Medio de cobro:</strong> para recibir tu recaudo tienes que registrar a dónde
          girártelo. Sin eso no podemos pagarte.
        </li>
      </ul>

      <h2>Entregas fallidas y devoluciones</h2>
      <p>
        Si no se puede entregar, el mensajero reporta la novedad y el pedido se reprograma o se
        devuelve. Una devolución se cobra según la tarifa acordada, porque el trayecto se hizo.
      </p>

      <h2>Qué esperamos de ti</h2>
      <ul>
        <li>Que los datos que registras sean ciertos, empezando por la dirección del destinatario.</li>
        <li>Que no despaches nada prohibido por la ley, peligroso, perecedero sin avisar, ni dinero en efectivo.</li>
        <li>Que declares el contenido real del paquete y avises si es frágil.</li>
        <li>Que tengas autorización de tus compradores para entregarnos sus datos.</li>
      </ul>

      <h2>Nuestra responsabilidad</h2>
      <p>
        Respondemos por el transporte del paquete en los términos de la ley colombiana y de lo
        pactado con cada comercio. No respondemos por lo que se salga de nuestras manos: una
        dirección mal escrita, un destinatario que no aparece, o mercancía prohibida o mal
        declarada.
      </p>
      <p>
        La plataforma puede tener interrupciones por mantenimiento o por fallas de terceros. Si
        el servicio se cae, la operación sigue y los registros se ponen al día.
      </p>

      <h2>Tus datos</h2>
      <p>
        El tratamiento de datos personales se rige por nuestra{" "}
        <a href="/legal/privacidad">política de tratamiento de datos</a>, que aceptas junto con
        estos términos.
      </p>

      <h2>Terminación</h2>
      <p>
        Puedes dejar de usar la plataforma cuando quieras. Podemos suspender una cuenta que
        incumpla estos términos o que ponga en riesgo la operación o los datos de terceros. Lo
        que quede pendiente de pagar o de girar se liquida igual.
      </p>

      <h2>Ley aplicable</h2>
      <p>
        Estos términos se rigen por la ley colombiana. Cualquier controversia se tramitará ante
        los jueces competentes de {MARCA.ciudad}.
      </p>
    </PaginaLegal>
  );
}
