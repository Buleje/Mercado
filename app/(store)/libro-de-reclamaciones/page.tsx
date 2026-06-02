import type { Metadata } from "next";
import Link from "next/link";
import { BookText, Building2, ShieldCheck, ExternalLink } from "lucide-react";
import LibroReclamacionesForm from "@/components/legal/LibroReclamacionesForm";
import {
  LEGAL,
  LEGAL_COMPLETO,
  INDECOPI,
  PLAZO_RESPUESTA_DIAS_HABILES,
} from "@/lib/legal";

const BASE_URL = "https://www.buleje.pe";

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

export default function LibroReclamacionesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* ── Encabezado oficial ── */}
      <header className="rounded-3xl border-2 border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-[0_4px_14px_rgba(0,180,166,0.35)]">
            <BookText className="h-7 w-7" strokeWidth={2.25} />
          </span>
          <div>
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
              Conforme a la Ley N° 29571
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-3xl">
              Libro de Reclamaciones Virtual
            </h1>
            <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
              Registra aquí tu reclamo o queja. Te responderemos en un plazo máximo
              de <strong className="text-[var(--text-primary)]">{PLAZO_RESPUESTA_DIAS_HABILES} días hábiles</strong>.
            </p>
          </div>
        </div>
      </header>

      {/* ── Identificación del proveedor ── */}
      <section className="mt-5 rounded-3xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
          <Building2 className="h-4 w-4" strokeWidth={2.5} /> Identificación del proveedor
        </h2>
        {LEGAL_COMPLETO ? (
          <dl className="grid gap-2 text-base sm:grid-cols-2">
            <div>
              <dt className="text-sm font-bold text-[var(--text-tertiary)]">Razón social</dt>
              <dd className="font-semibold text-[var(--text-primary)]">{LEGAL.razonSocial}</dd>
            </div>
            <div>
              <dt className="text-sm font-bold text-[var(--text-tertiary)]">RUC</dt>
              <dd className="font-semibold text-[var(--text-primary)] tabular-nums">{LEGAL.ruc}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-bold text-[var(--text-tertiary)]">Domicilio fiscal</dt>
              <dd className="font-semibold text-[var(--text-primary)]">{LEGAL.domicilioFiscal}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-bold text-[var(--text-tertiary)]">Nombre comercial</dt>
              <dd className="font-semibold text-[var(--text-primary)]">{LEGAL.nombreComercial}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-base text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">{LEGAL.nombreComercial}</strong> · Tu
            reclamo queda registrado y será atendido en el plazo legal. Para consultas:{" "}
            <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)]">
              {LEGAL.telefono}
            </a>.
          </p>
        )}
      </section>

      {/* ── Formulario ── */}
      <div className="mt-6">
        <LibroReclamacionesForm />
      </div>

      {/* ── Aviso INDECOPI ── */}
      <section className="mt-6 rounded-3xl border-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
          <ShieldCheck className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} /> Tus derechos como consumidor
        </h2>
        <p className="text-base leading-relaxed text-[var(--text-secondary)]">
          La formulación del reclamo no impide acudir a otras vías de solución de
          controversias ni es requisito previo para interponer una denuncia ante el
          INDECOPI. Conoce tus derechos y presenta una denuncia en:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={INDECOPI.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40"
          >
            INDECOPI <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
          </a>
          <a
            href={INDECOPI.reclamaVirtual}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40"
          >
            Reclama Virtual <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
          </a>
        </div>
        <p className="mt-3 text-sm text-[var(--text-tertiary)]">
          Línea INDECOPI: Lima {INDECOPI.telefonoLima} · Provincias {INDECOPI.telefonoProvincias}.
          Ver también nuestros{" "}
          <Link href="/terminos" className="font-bold text-[var(--accent)] hover:underline">
            Términos y Condiciones
          </Link>.
        </p>
      </section>
    </main>
  );
}
