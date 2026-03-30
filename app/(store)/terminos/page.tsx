import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones | Buleje",
  description: "Términos y condiciones de uso del servicio de delivery de Buleje en Pucallpa.",
};

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-foreground mb-8">
        Términos y Condiciones
      </h1>
      <p className="text-sm text-gray-500 dark:text-muted mb-8">
        Última actualización: {new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
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
            <li>El servicio de delivery está disponible únicamente dentro de la zona de cobertura en Pucallpa, Ucayali.</li>
            <li>Los horarios de delivery están sujetos a disponibilidad y pueden variar según la demanda.</li>
            <li>El tiempo estimado de entrega puede variar según la distancia y condiciones del tráfico.</li>
            <li>Nos reservamos el derecho de rechazar pedidos fuera de nuestra zona de cobertura.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">3. Precios y disponibilidad</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Los precios están expresados en Soles Peruanos (S/) e incluyen IGV donde corresponda.</li>
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
          <h2 className="text-xl font-bold">10. Contacto</h2>
          <p>
            Para consultas sobre estos términos y condiciones:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>WhatsApp: 916 409 675</li>
            <li>Dirección: Jr. Ucayali 450, Pucallpa, Ucayali, Perú</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
