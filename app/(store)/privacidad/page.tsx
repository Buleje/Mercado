import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | Buleje",
  description: "Cómo recopilamos, usamos y protegemos tu información personal en Buleje.",
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-foreground mb-8">
        Política de Privacidad
      </h1>
      <p className="text-sm text-gray-500 dark:text-muted mb-8">
        Última actualización: {new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-bold">1. Información que recopilamos</h2>
          <p>
            Cuando realizas un pedido en Buleje, recopilamos la siguiente información:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Nombre completo</strong> — para identificar tu pedido.</li>
            <li><strong>Número de teléfono</strong> — para contactarte sobre tu pedido y enviar actualizaciones por WhatsApp.</li>
            <li><strong>Dirección de entrega y referencia</strong> — para realizar el delivery.</li>
            <li><strong>Método de pago seleccionado</strong> (Yape o Efectivo) — para procesar tu pago.</li>
            <li><strong>Número de operación Yape</strong> — solo si pagas con Yape, para verificar tu pago.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">2. Cómo usamos tu información</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Procesar y entregar tus pedidos.</li>
            <li>Enviarte actualizaciones del estado de tu pedido por WhatsApp.</li>
            <li>Mejorar nuestro servicio y experiencia de compra.</li>
            <li>Enviarte promociones y ofertas si te suscribes a nuestro newsletter (puedes darte de baja en cualquier momento).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">3. Protección de datos</h2>
          <p>
            Tu información se almacena de forma segura en servidores protegidos. No vendemos, 
            alquilamos ni compartimos tu información personal con terceros, excepto cuando sea 
            necesario para procesar tu pedido (por ejemplo, compartir tu dirección con el repartidor).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">4. Cookies y tecnologías similares</h2>
          <p>
            Utilizamos cookies técnicas necesarias para el funcionamiento del sitio (carrito de compras, 
            preferencias de tema, sesión). No utilizamos cookies de seguimiento de terceros con fines publicitarios.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">5. Tus derechos</h2>
          <p>Tienes derecho a:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Acceder a tus datos personales.</li>
            <li>Solicitar la corrección de datos incorrectos.</li>
            <li>Solicitar la eliminación de tus datos.</li>
            <li>Darte de baja de comunicaciones promocionales.</li>
          </ul>
          <p>
            Para ejercer cualquiera de estos derechos, contáctanos por WhatsApp al{" "}
            <a href="tel:+51916409675" className="text-primary hover:underline">916 409 675</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">6. Cambios a esta política</h2>
          <p>
            Podemos actualizar esta política ocasionalmente. Te notificaremos de cambios significativos 
            a través de nuestro sitio web.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">7. Contacto</h2>
          <p>
            Si tienes preguntas sobre esta política de privacidad, puedes contactarnos:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>WhatsApp: 916 409 675</li>
            <li>Dirección: Jr. Ucayali 450, Ucayali, Perú</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
