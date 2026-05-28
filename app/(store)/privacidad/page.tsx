import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | Buleje",
  description: "Cómo recopilamos, usamos y protegemos tu información personal en Buleje.",
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-8">
        Política de Privacidad
      </h1>
      <p className="text-sm text-[var(--text-tertiary)] dark:text-muted mb-8">
        Última actualización: 12 de abril de 2026
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
          {/*
            SEO 2026-05-28 audit MEDIUM: H2 explícito "Derechos ARCO" hace
            visible el cumplimiento Ley 29733 PE (compliance trust signal).
            H3 por cada derecho mejora estructura para Google y aumenta
            chance de Featured Snippet en búsquedas "ley 29733 ejercer derechos".
          */}
          <h2 className="text-xl font-bold">5. Tus derechos ARCO (Ley 29733 Perú)</h2>
          <p>
            Como titular de datos personales en Perú, gozas de los derechos ARCO
            (Acceso, Rectificación, Cancelación, Oposición) reconocidos por la
            Ley 29733 de Protección de Datos Personales:
          </p>

          <h3 className="text-lg font-semibold mt-4">Derecho de Acceso</h3>
          <p>
            Solicitar gratuitamente una copia de todos los datos personales que
            mantenemos sobre ti, incluyendo su origen y los fines de uso.
          </p>

          <h3 className="text-lg font-semibold mt-4">Derecho de Rectificación</h3>
          <p>
            Solicitar la corrección de datos incorrectos, inexactos, incompletos
            o desactualizados.
          </p>

          <h3 className="text-lg font-semibold mt-4">Derecho de Cancelación</h3>
          <p>
            Solicitar la eliminación de tus datos cuando ya no sean necesarios
            para los fines que se recolectaron, o cuando retires tu consentimiento
            (derecho al olvido).
          </p>

          <h3 className="text-lg font-semibold mt-4">Derecho de Oposición</h3>
          <p>
            Oponerte al tratamiento de tus datos para finalidades específicas,
            como comunicaciones promocionales o decisiones automatizadas.
          </p>

          <p className="mt-4">
            Para ejercer cualquiera de estos derechos, contáctanos por WhatsApp al{" "}
            <a href="tel:+51929340532" className="text-primary hover:underline">929 340 532</a>{" "}
            o vía el formulario en{" "}
            <a href="/cuenta/privacidad" className="text-primary hover:underline">tu cuenta → Privacidad</a>.
            Respondemos en máximo 10 días hábiles según ley.
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
            <li>WhatsApp: 929 340 532</li>
            <li>Dirección: Jr. Ucayali 450, Ucayali, Perú</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
