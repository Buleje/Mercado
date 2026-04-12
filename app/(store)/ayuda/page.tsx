import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

export const metadata: Metadata = {
  title: "Centro de Ayuda — Buleje",
  description:
    "Preguntas frecuentes, guias de uso y soporte para Buleje ERP. Aprende a usar inventario, POS, delivery, fiado digital y facturacion SUNAT.",
  alternates: { canonical: "https://www.buleje.pe/ayuda" },
};

const FAQS = [
  {
    category: "Pedidos",
    items: [
      { q: "¿Como hago un pedido?", a: "Agrega productos al carrito desde la tienda, ingresa tus datos y confirma el pedido. Puedes pagar con Yape, Plin o efectivo contra entrega." },
      { q: "¿Como sigo mi pedido?", a: "Despues de hacer tu pedido, recibes un link de seguimiento por WhatsApp. Tambien puedes verlo en Mi Cuenta > Mis Pedidos." },
      { q: "¿Puedo cancelar un pedido?", a: "Si, puedes cancelar desde Mis Pedidos si el estado es 'Pendiente'. Una vez confirmado por la tienda, contacta directamente." },
      { q: "¿Cuanto demora el delivery?", a: "El tiempo estimado es 30-60 minutos dependiendo de tu zona. Te notificamos por WhatsApp cuando sale el pedido." },
    ],
  },
  {
    category: "Pagos",
    items: [
      { q: "¿Que metodos de pago aceptan?", a: "Yape, Plin, efectivo contra entrega y transferencia bancaria. La tienda elige cuales activar." },
      { q: "¿Es seguro pagar aqui?", a: "Si. Los pagos con Yape/Plin se procesan directamente en esas apps. Nunca guardamos datos de tarjetas." },
      { q: "¿Puedo comprar al credito (fiado)?", a: "Si la tienda tiene Fiado Digital activado, puedes ver tu credito disponible en /mi-credito. Se calcula automaticamente segun tu historial." },
    ],
  },
  {
    category: "Mi Cuenta",
    items: [
      { q: "¿Como creo una cuenta?", a: "Al hacer tu primer pedido, se crea automaticamente con tu numero de telefono. Tambien puedes registrarte en /registro." },
      { q: "¿Donde veo mis puntos de lealtad?", a: "En Mi Cuenta > Puntos. Ganas puntos con cada compra y puedes canjearlos por descuentos." },
      { q: "¿Como invito a un amigo?", a: "En Mi Cuenta encontraras tu codigo de referido. Compartelo y ambos ganan puntos cuando tu amigo hace su primera compra." },
    ],
  },
  {
    category: "Para Tiendas (Dueños)",
    items: [
      { q: "¿Como registro mi bodega en Buleje?", a: "Ve a /registro, elige un plan (hay plan gratuito) y configura tu tienda en 5 minutos con el wizard de onboarding." },
      { q: "¿Buleje emite boletas SUNAT?", a: "Si, con integracion a Nubefact. Configura tu RUC y token en Ajustes > Facturacion y emite boletas/facturas automaticamente." },
      { q: "¿Cuanto cuesta Buleje?", a: "Plan gratuito para empezar (50 productos, 1 usuario). Planes de pago desde S/49/mes con mas funciones." },
      { q: "¿Funciona en todo el Peru?", a: "Si, Buleje funciona en cualquier ciudad del Peru. Fue creado en Pucallpa y tiene cobertura nacional." },
    ],
  },
];

function FAQSection({ category, items }: { category: string; items: { q: string; a: string }[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">{category}</h2>
      <div className="space-y-3">
        {items.map((faq) => (
          <details key={faq.q} className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <summary className="cursor-pointer px-5 py-3 font-medium text-sm text-slate-700 dark:text-slate-200 hover:text-emerald-700 transition-colors list-none flex items-center justify-between">
              {faq.q}
              <svg className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p className="px-5 pb-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function AyudaPage() {
  // JSON-LD FAQPage for SEO
  const allFaqs = FAQS.flatMap((c) => c.items);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allFaqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbSchema items={[
        { name: "Buleje", url: "https://www.buleje.pe" },
        { name: "Ayuda", url: "https://www.buleje.pe/ayuda" },
      ]} />
      <Header />
      <div className="h-[6.75rem] sm:h-[7.75rem]" />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
          Centro de Ayuda
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          Encuentra respuestas rapidas o contactanos por WhatsApp.
        </p>

        {FAQS.map((section) => (
          <FAQSection key={section.category} {...section} />
        ))}

        {/* Contact options */}
        <div className="mt-10 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">
            ¿No encontraste lo que buscas?
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Nuestro equipo te ayuda por WhatsApp de lunes a sabado, 8am a 8pm.
          </p>
          <a
            href="https://wa.me/51900000000?text=Hola%20Buleje%2C%20necesito%20ayuda"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-white font-semibold shadow hover:bg-[#20BD5A] transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            Escribir por WhatsApp
          </a>
        </div>

        {/* Links utiles */}
        <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/pricing" className="text-emerald-600 hover:text-emerald-700 font-medium">Ver planes</Link>
          <Link href="/registro" className="text-emerald-600 hover:text-emerald-700 font-medium">Crear tienda</Link>
          <Link href="/tienda" className="text-emerald-600 hover:text-emerald-700 font-medium">Ver productos</Link>
          <Link href="/privacidad" className="text-emerald-600 hover:text-emerald-700 font-medium">Privacidad</Link>
        </div>
      </main>
      <Suspense fallback={null}><Footer /></Suspense>
    </>
  );
}
