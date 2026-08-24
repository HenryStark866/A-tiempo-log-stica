import type { Metadata } from "next";
import { PaginaLegal, DatosDelResponsable } from "@/components/PaginaLegal";
import { MARCA } from "@/lib/marca";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos",
  description: `Cómo trata ${MARCA.empresa} los datos personales de quienes usan ${MARCA.app}, conforme a la Ley 1581 de 2012.`,
};

/**
 * Política de tratamiento de datos personales.
 *
 * Escrita para que la entienda quien la firma: un mensajero en la calle o el
 * dueño de una tienda, no un abogado. La ley pide que sea informada, y un
 * texto que nadie lee no informa a nadie.
 *
 * NO es asesoría legal: el contenido refleja lo que la plataforma hace de
 * verdad —lo que se puede comprobar leyendo el código— pero antes de darlo por
 * definitivo tiene que revisarlo un abogado.
 */
export default function PrivacidadPage() {
  return (
    <PaginaLegal
      titulo="Política de tratamiento de datos"
      entradilla="Qué datos tuyos guardamos, para qué los usamos y qué puedes exigirnos. Escrito conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013."
    >
      <DatosDelResponsable />

      <h2>Qué datos recogemos</h2>
      <p>Solo lo que hace falta para que el envío llegue y para pagarle a quien corresponde:</p>
      <ul>
        <li>
          <strong>De todos:</strong> nombre, correo y teléfono. El correo además es tu usuario.
        </li>
        <li>
          <strong>Del comercio:</strong> nombre del negocio, NIT, dirección, municipio y los
          medios por los que quieres recibir tu recaudo.
        </li>
        <li>
          <strong>Del mensajero:</strong> los documentos que la ley exige para conducir y para
          responder por un paquete —cédula, licencia, tarjeta de propiedad y certificado de
          medidas correctivas— y su <strong>ubicación mientras está en turno</strong>.
        </li>
        <li>
          <strong>Del destinatario:</strong> nombre, dirección y teléfono, que nos entrega el
          comercio para poder entregarle.
        </li>
        <li>
          <strong>De la entrega:</strong> fotos de evidencia y el nombre de quien recibió.
        </li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Recoger, transportar y entregar los paquetes, y dejar constancia de que se entregaron.</li>
        <li>Cobrar el contraentrega y girarle a cada comercio lo que le corresponde.</li>
        <li>Avisarte de lo que pasa con tu envío por la app, por correo o por WhatsApp.</li>
        <li>Facturar y cumplir las obligaciones contables y tributarias.</li>
        <li>Verificar que quien sale a la calle con un paquete es quien dice ser.</li>
      </ul>

      <h2>La ubicación del mensajero</h2>
      <p>
        Se registra <strong>solo mientras el turno está abierto</strong> y sirve para dos cosas:
        que el CEDI sepa a quién asignarle el siguiente lote, y que quien espera un pedido pueda
        ver por dónde va. Al cerrar el turno deja de registrarse. No se usa para evaluar a nadie
        fuera de su jornada.
      </p>

      <h2>Con quién los compartimos</h2>
      <p>
        Con nadie que no haga falta para entregar el paquete. En concreto: el mensajero asignado
        ve los datos del destinatario de las guías que lleva, y el comercio ve las suyas. No
        vendemos datos ni los cedemos con fines publicitarios.
      </p>
      <p>
        La plataforma se apoya en proveedores de tecnología que almacenan la información por
        cuenta nuestra (alojamiento y base de datos). Están obligados a los mismos deberes de
        seguridad y confidencialidad.
      </p>

      <h2>Cuánto los guardamos</h2>
      <p>
        Mientras dure la relación y después el tiempo que exijan las obligaciones legales,
        contables y tributarias. Un envío entregado deja rastro por años: es lo que permite
        resolver un reclamo o una devolución mucho después.
      </p>

      <h2>Tus derechos</h2>
      <p>Como titular de tus datos puedes, en cualquier momento:</p>
      <ul>
        <li>Saber qué tenemos tuyo y para qué lo usamos.</li>
        <li>Pedir que corrijamos lo que esté mal o incompleto.</li>
        <li>Pedir que borremos lo que ya no sea necesario, salvo lo que la ley nos obligue a conservar.</li>
        <li>Revocar esta autorización.</li>
        <li>Presentar una queja ante la Superintendencia de Industria y Comercio.</li>
      </ul>
      <p>
        Para ejercerlos, escríbenos con tu nombre y el correo con el que te registraste.
        Respondemos en los plazos de ley: quince días hábiles para consultas y quince para
        reclamos, prorrogables cuando la ley lo permite.
      </p>

      <h2>Datos de menores de edad</h2>
      <p>
        La plataforma no está dirigida a menores de edad y no pedimos ni tratamos sus datos a
        sabiendas.
      </p>

      <h2>Seguridad</h2>
      <p>
        Cada quien ve solo lo suyo, y eso se controla en la base de datos y no solo en la
        pantalla. Las contraseñas se guardan cifradas de forma irreversible: ni el administrador
        ni nosotros podemos leerlas. Los documentos de identidad se guardan en almacenamiento
        privado y se abren con enlaces temporales.
      </p>

      <h2>Cambios</h2>
      <p>
        Si esta política cambia, la versión nueva queda publicada aquí y se te pedirá aceptarla
        de nuevo cuando el cambio sea sustancial.
      </p>
    </PaginaLegal>
  );
}
