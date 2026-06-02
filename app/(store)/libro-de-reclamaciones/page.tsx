import type { Metadata } from "next";
import Link from "next/link";
import {
  BookText,
  Building2,
  ShieldCheck,
  ExternalLink,
  Clock,
  Mail,
  Ticket,
  ClipboardList,
  Send,
  CheckCircle2,
  MessageCircle,
  Phone,
  ChevronDown,
} from "lucide-react";
import LibroReclamacionesForm from "@/components/legal/LibroReclamacionesForm";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import { buildWaLink } from "@/lib/wa-number";
import {
  LEGAL,
  LEGAL_COMPLETO,
  INDECOPI,
  PLAZO_RESPUESTA_DIAS_HABILES,
} from "@/lib/legal";

const BASE_URL = "https://www.buleje.pe";
const PAGE_URL = `${BASE_URL}/libro-de-reclamaciones`;

/** Estilo de tarjeta único: borde 1px + elevación sutil (look limpio del DS). */
const CARD =
  "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

export const metadata: Metadata = {
  title: "Libro de Reclamaciones",
  description:
    "Libro de Reclamaciones Virtual de Buleje conforme a la Ley N° 29571 y el D.S. 011-2011-PCM. Registra tu reclamo o queja y recibe respuesta en 15 días hábiles.",
  alternates: { canonical: `${BASE_URL}/libro-de-reclamaciones` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Libro de Reclamaciones — Buleje",
    description: "Registra tu reclamo o queja. Respuesta en 15 días hábiles.",
    url: `${BASE_URL}/libro-de-reclamaciones`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

// BreadcrumbList JSON-LD — consistente con el resto de páginas (ej. /vender).
const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Libro de Reclamaciones", item: PAGE_URL },
  ],
};

const BENEFITS = [
  { icon: Clock, label: `Respuesta en ${PLAZO_RESPUESTA_DIAS_HABILES} días hábiles` },
  { icon: Ticket, label: "Código de seguimiento al instante" },
  { icon: Mail, label: "Copia inmediata a tu correo" },
  { icon: ShieldCheck, label: "Acceso libre al INDECOPI" },
] as const;

// Campos de la "Hoja de Reclamación" mostrada como documento oficial en el hero.
const HOJA_FIELDS = [
  { k: "N° de registro", v: "Se genera al enviar" },
  { k: "Plazo de respuesta", v: `${PLAZO_RESPUESTA_DIAS_HABILES} días hábiles` },
  { k: "Costo del trámite", v: "Gratuito" },
  { k: "Marco legal", v: "Ley N° 29571" },
  { k: "Entidad supervisora", v: "INDECOPI" },
] as const;

const STEPS = [
  {
    icon: ClipboardList,
    title: "Completa la hoja",
    desc: "Tus datos, el producto o servicio y el detalle de tu reclamo o queja.",
  },
  {
    icon: Send,
    title: "Registramos tu caso",
    desc: "Recibes un código de seguimiento al instante y una copia en tu correo.",
  },
  {
    icon: CheckCircle2,
    title: "Te respondemos",
    desc: `En un plazo máximo de ${PLAZO_RESPUESTA_DIAS_HABILES} días hábiles, según la ley.`,
  },
] as const;

const FAQ_LEGAL = [
  {
    q: "¿Cuál es la diferencia entre un reclamo y una queja?",
    a: "Un reclamo es tu disconformidad con el producto o servicio recibido (no llegó, llegó en mal estado o no es lo que se ofreció). Una queja expresa tu malestar con la atención o el trato, no con el producto en sí. Puedes registrar cualquiera de los dos en este mismo formulario.",
  },
  {
    q: "¿Cuánto demora la respuesta y cómo la recibo?",
    a: `Te respondemos en un plazo máximo de ${PLAZO_RESPUESTA_DIAS_HABILES} días hábiles, como exige el Código de Protección y Defensa del Consumidor (Ley N° 29571). La respuesta llega al correo electrónico que registres en la hoja.`,
  },
  {
    q: "¿Tiene algún costo registrar mi reclamo?",
    a: "No. El Libro de Reclamaciones es totalmente gratuito. Nadie puede condicionar tu reclamo a un pago, exigirte una compra previa ni negarte el acceso al libro.",
  },
  {
    q: "¿Qué pasa si no quedo conforme con la respuesta?",
    a: "Formular este reclamo no te impide acudir a otras vías de solución, y no es requisito previo para denunciar. Puedes presentar una denuncia ante el INDECOPI mediante Reclama Virtual o sus líneas de atención (Lima 224-7777 · Provincias 0-800-4-4040).",
  },
  {
    q: "¿Puedo reclamar si soy menor de edad?",
    a: "Sí. Marca la casilla “Soy menor de edad” en el formulario e indica el nombre de tu padre, madre o apoderado, quien figurará como representante del reclamo.",
  },
  {
    q: "¿Qué hacen con mis datos personales?",
    a: "Usamos tus datos únicamente para atender y dar seguimiento a tu reclamo, conforme a la Ley N° 29733 de Protección de Datos Personales. Puedes ejercer tus derechos de acceso, rectificación y supresión cuando lo necesites.",
  },
] as const;

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_LEGAL.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const waHelp = buildWaLink(
  LEGAL.whatsapp,
  "Hola Buleje, tengo una consulta sobre el Libro de Reclamaciones.",
);

export default function LibroReclamacionesPage() {
  return (
    <main id="main-content" className="bg-[var(--surface-canvas)]">
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={faqLd} />

      {/* ── Breadcrumb ── */}
      <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <Breadcrumbs items={[{ label: "Libro de Reclamaciones" }]} />
        </div>
      </div>

      {/* ── Hero (2 columnas) ── */}
      <section className="relative overflow-hidden border-b border-[var(--rule-soft)] bg-gradient-to-b from-[var(--accent-soft)]/60 to-[var(--surface-raised)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--accent)]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
          {/* Columna texto */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--surface-raised)] px-3 py-1 text-sm font-bold text-[var(--accent)] shadow-[var(--shadow-sm)]">
              <BookText className="h-4 w-4" strokeWidth={2.5} />
              Conforme a la Ley N° 29571 · D.S. 011-2011-PCM
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-5xl sm:leading-[1.05] lg:text-[3.5rem]">
              Libro de Reclamaciones Virtual
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
              Registra tu reclamo o queja de forma gratuita. Lo atendemos con seriedad
              y te respondemos dentro del plazo que exige la ley peruana de protección
              al consumidor.
            </p>
            <ul className="mt-7 grid gap-3 sm:max-w-md sm:grid-cols-2">
              {BENEFITS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <span className="text-base font-medium text-[var(--text-secondary)]">{label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Columna: Hoja de Reclamación como documento oficial */}
          <aside className="lg:justify-self-end">
            <article className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)]">
              <header className="flex items-center justify-between gap-3 bg-[var(--accent)] px-5 py-4 text-white">
                <span className="flex items-center gap-2 text-base font-extrabold">
                  <BookText className="h-5 w-5" strokeWidth={2.25} /> Hoja de Reclamación
                </span>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-[var(--ls-wider)]">
                  Virtual
                </span>
              </header>
              <dl className="divide-y divide-[var(--rule-soft)]">
                {HOJA_FIELDS.map(({ k, v }) => (
                  <div key={k} className="flex items-center justify-between gap-4 px-5 py-3">
                    <dt className="text-sm font-medium text-[var(--text-tertiary)]">{k}</dt>
                    <dd className="text-right text-base font-bold text-[var(--text-primary)]">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="flex items-center gap-2 bg-[var(--surface-sunken)] px-5 py-3 text-sm text-[var(--text-tertiary)]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
                Documento con validez conforme al D.S. 011-2011-PCM.
              </p>
            </article>
          </aside>
        </div>
      </section>

      {/* ── Cómo funciona (stepper conectado) ── */}
      <section className="border-b border-[var(--rule-soft)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
            Cómo funciona
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
            Tres pasos, sin trámites complicados
          </h2>
          <ol className="relative mt-8 grid gap-8 sm:grid-cols-3">
            <div className="pointer-events-none absolute inset-x-0 top-7 hidden h-px bg-[var(--rule-soft)] sm:block" />
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <li key={title} className="relative">
                <span className="relative z-10 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--accent)] shadow-[var(--shadow-sm)]">
                  <Icon className="h-6 w-6" strokeWidth={2.25} />
                </span>
                <p className="mt-4 text-sm font-bold text-[var(--text-tertiary)] tabular-nums">
                  Paso {i + 1}
                </p>
                <h3 className="mt-1 text-lg font-extrabold text-[var(--text-primary)]">{title}</h3>
                <p className="mt-1.5 text-base leading-relaxed text-[var(--text-secondary)]">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Cuerpo: formulario + aside ── */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* Formulario (Hoja de Reclamación) */}
          <div>
            <LibroReclamacionesForm />
          </div>

          {/* Aside informativo */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            {/* Identificación del proveedor */}
            <section className={`${CARD} p-5`}>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
                <Building2 className="h-4 w-4" strokeWidth={2.5} /> Identificación del proveedor
              </h2>
              {LEGAL_COMPLETO ? (
                <dl className="space-y-2.5">
                  {(
                    [
                      ["Razón social", LEGAL.razonSocial],
                      ["RUC", LEGAL.ruc],
                      ["Domicilio fiscal", LEGAL.domicilioFiscal],
                      ["Nombre comercial", LEGAL.nombreComercial],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-sm font-medium text-[var(--text-tertiary)]">{k}</dt>
                      <dd className="font-semibold text-[var(--text-primary)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-base leading-relaxed text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)]">{LEGAL.nombreComercial}</strong> · Tu
                  reclamo queda registrado y será atendido en el plazo legal.
                </p>
              )}
            </section>

            {/* Ayuda / contacto */}
            <section className={`${CARD} p-5`}>
              <h2 className="mb-1.5 flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
                <MessageCircle className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} /> ¿Necesitas ayuda?
              </h2>
              <p className="text-base leading-relaxed text-[var(--text-secondary)]">
                Escríbenos antes o después de registrar tu reclamo y te acompañamos.
              </p>
              <div className="mt-4 grid gap-2.5">
                {waHelp && (
                  <a
                    href={waHelp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
                  >
                    <MessageCircle className="h-5 w-5" strokeWidth={2.5} /> WhatsApp
                  </a>
                )}
                <a
                  href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40"
                >
                  <Phone className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} /> {LEGAL.telefono}
                </a>
              </div>
            </section>

            {/* Tus derechos / INDECOPI */}
            <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <h2 className="mb-1.5 flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
                <ShieldCheck className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} /> Tus derechos
              </h2>
              <p className="text-base leading-relaxed text-[var(--text-secondary)]">
                Formular este reclamo no impide acudir a otras vías de solución ni es
                requisito para denunciar ante el INDECOPI.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={INDECOPI.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40"
                >
                  INDECOPI <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                </a>
                <a
                  href={INDECOPI.reclamaVirtual}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40"
                >
                  Reclama Virtual <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                </a>
              </div>
              <p className="mt-3 text-sm text-[var(--text-tertiary)]">
                Línea INDECOPI: Lima {INDECOPI.telefonoLima} · Provincias {INDECOPI.telefonoProvincias}. Ver
                también nuestros{" "}
                <Link href="/terminos" className="font-bold text-[var(--accent)] hover:underline">
                  Términos
                </Link>
                .
              </p>
            </section>
          </aside>
        </div>
      </div>

      {/* ── Mini-FAQ legal ── */}
      <section className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
              Preguntas frecuentes
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-3xl">
              Dudas legales sobre el Libro de Reclamaciones
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
              Lo esencial sobre tus derechos y el proceso.{" "}
              {waHelp ? (
                <a
                  href={waHelp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[var(--accent)] hover:underline"
                >
                  ¿No encuentras tu duda? Escríbenos por WhatsApp
                </a>
              ) : (
                <span className="font-bold text-[var(--text-primary)]">Escríbenos por WhatsApp</span>
              )}{" "}
              y te ayudamos.
            </p>
          </div>
          <ul className="space-y-3">
            {FAQ_LEGAL.map(({ q, a }) => (
              <li key={q}>
                <details className="group rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] transition-colors open:border-[var(--accent)]/30 open:shadow-[var(--shadow-sm)] [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-base font-bold text-[var(--text-primary)] sm:text-lg">
                    {q}
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-[var(--accent)] transition-transform duration-200 group-open:rotate-180"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  </summary>
                  <p className="px-5 pb-5 text-base leading-relaxed text-[var(--text-secondary)]">
                    {a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
