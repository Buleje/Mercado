import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: "Términos y condiciones de uso del servicio de delivery de Buleje.",
};

export default function TerminosPage() {
  return (
    <>
    {/* Designer audit P0: H1 antes era text-[var(--text-primary)] hardcoded → invisible
        en dark mode (contraste 1.2:1). Ahora token DS que se adapta. */}
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16 text-[var(--text-primary)]">
      <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-8">
        Términos y Condiciones
      </h1>
      <p className="text-sm text-[var(--text-tertiary)] mb-8">
        Última actualización: 2 de junio de 2026
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-[var(--text-secondary)]">
        <section>
          <h2 className="text-xl font-bold">1. Aceptación de los términos</h2>
          <p>
            Al utilizar el sitio web y los servicios de Buleje, aceptas estos términos y condiciones. 
            Si no estás de acuerdo, por favor no utilices nuestros servicios.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">2. Servicio de delivery</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>El servicio de delivery está disponible únicamente dentro de nuestra zona de cobertura.</li>
            <li>Los horarios de delivery están sujetos a disponibilidad y pueden variar según la demanda.</li>
            <li>El tiempo estimado de entrega puede variar según la distancia y condiciones del tráfico.</li>
            <li>El <strong>costo del delivery</strong> se calcula según la zona y se muestra de forma clara <strong>antes de confirmar el pedido</strong>, sumado al subtotal de los productos.</li>
            <li>Nos reservamos el derecho de rechazar pedidos fuera de nuestra zona de cobertura.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">3. Precios y disponibilidad</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Los precios están expresados en Soles Peruanos (S/) e incluyen IGV (18%) donde corresponda.</li>
            <li>Antes de confirmar verás el <strong>precio total</strong>: subtotal de productos + costo de envío + impuestos aplicables. No cobramos montos ocultos.</li>
            <li>Los precios pueden cambiar sin previo aviso.</li>
            <li>La disponibilidad de productos está sujeta a stock. Si un producto no está disponible, te contactaremos para ofrecer una alternativa.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">4. Métodos de pago</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Yape:</strong> Realiza el pago al número indicado y proporciona el número de operación para verificación.</li>
            <li><strong>Efectivo:</strong> Pago contra entrega. Procura tener el monto exacto o billetes pequeños para facilitar el cambio.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">5. Cancelaciones y devoluciones</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Puedes cancelar tu pedido antes de que sea confirmado por la tienda.</li>
            <li>Una vez que el pedido está en camino, no se aceptan cancelaciones.</li>
            <li>Si recibes un producto en mal estado o diferente al solicitado, contáctanos dentro de las 24 horas siguientes para gestionar el reemplazo o reembolso.</li>
            <li>Los reembolsos por pagos con Yape se realizarán dentro de 24-48 horas hábiles.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">6. Responsabilidades del cliente</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Proporcionar información de contacto y dirección correcta.</li>
            <li>Estar disponible para recibir el pedido en el horario acordado.</li>
            <li>Verificar los productos al momento de la entrega.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">7. Limitación de responsabilidad</h2>
          <p>
            Buleje no será responsable por retrasos causados por condiciones climáticas extremas, 
            problemas viales, desastres naturales u otras circunstancias fuera de nuestro control.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">8. Uso del sitio web</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>No utilices el sitio para fines ilegales o no autorizados.</li>
            <li>No intentes acceder a áreas restringidas del sistema.</li>
            <li>Nos reservamos el derecho de suspender el servicio a usuarios que incumplan estos términos.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">9. Modificaciones</h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios 
            entrarán en vigor desde su publicación en el sitio web.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">10. Comprobante de pago</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Por cada pedido se emite el comprobante de pago electrónico que corresponda (<strong>boleta de venta</strong> o <strong>factura</strong>), conforme a las normas de la SUNAT.</li>
            <li>Si necesitas factura, indica tu <strong>RUC y razón social</strong> al realizar el pedido.</li>
            <li>El comprobante es emitido por la tienda vendedora, responsable de la transacción comercial.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">11. Naturaleza del servicio: marketplace e intermediación</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Buleje es una <strong>plataforma tecnológica (marketplace)</strong> que conecta a consumidores con tiendas y vendedores independientes (los “vendedores”).</li>
            <li>Los vendedores son <strong>terceros responsables</strong> de los productos que ofrecen: su calidad, stock, precios y la emisión de comprobantes de pago. Salvo en pedidos vendidos y despachados directamente por Buleje, la relación de consumo se entabla entre el consumidor y el vendedor.</li>
            <li>Buleje actúa como intermediario, facilita el pedido, el pago y, cuando aplica, el delivery, y colabora en la <strong>solución de controversias</strong> entre consumidor y vendedor a través del <a href="/libro-de-reclamaciones" className="font-semibold text-[var(--accent)] hover:underline">Libro de Reclamaciones</a>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">12. Venta de bebidas alcohólicas (mayores de 18 años)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>La venta y entrega de bebidas alcohólicas está permitida <strong>únicamente a personas mayores de 18 años</strong>, conforme a la Ley N° 28681. Al comprarlas declaras ser mayor de edad.</li>
            <li>El repartidor podrá <strong>solicitar un documento de identidad</strong> al entregar y negar la entrega si no se acredita la mayoría de edad o si el receptor se encuentra en evidente estado de ebriedad.</li>
            <li>Está <strong>prohibida la venta de alcohol a menores de edad</strong>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">13. Libro de Reclamaciones e INDECOPI</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Conforme a la Ley N° 29571 y el D.S. 011-2011-PCM, ponemos a tu disposición el <a href="/libro-de-reclamaciones" className="font-semibold text-[var(--accent)] hover:underline">Libro de Reclamaciones Virtual</a>. Atenderemos tu reclamo o queja en un plazo máximo de <strong>15 días hábiles</strong>.</li>
            <li>La presentación de un reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para denunciar ante el <a href="https://www.gob.pe/indecopi" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent)] hover:underline">INDECOPI</a>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">14. Contacto</h2>
          <p>
            Para consultas sobre estos términos y condiciones:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>WhatsApp: 929 340 532</li>
            <li>Dirección: Jr. Ucayali 450, Ucayali, Perú</li>
            <li><a href="/libro-de-reclamaciones" className="font-semibold text-[var(--accent)] hover:underline">Libro de Reclamaciones Virtual</a></li>
          </ul>
        </section>
      </div>
    </main>
    </>
  );
}
