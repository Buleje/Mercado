"use client";

/**
 * components/admin/FranjaNegocio.tsx
 *
 * Identidad del negocio en TODAS las pestañas del panel (Brandon 04-11: «cada
 * negocio con su color arriba, para no anotar nunca una guía en la copia
 * equivocada»). Blas real y sus 3 copias de prueba tenían el mismo color de marca,
 * que además solo se usa en la tienda, no en el panel.
 *
 *   - negocio real forestal → verde        - otro negocio real → turquesa del DS
 *   - copia de prueba       → gris rayado + chip «PRUEBA · no es el negocio real»
 *
 * Dos piezas, un mismo dato (`useIdentidad`):
 *   - `FranjaNegocio`: la franja de arriba (28 px en escritorio; en celular 4 px, o
 *     24 px con el chip «PRUEBA» si es una copia). Va una vez, sobre la cabecera.
 *   - `LineaNegocio`: la línea de 3 px en el borde de la cabecera sticky, para que
 *     el color siga a la vista al bajar (la franja se va con el scroll).
 *
 * No pide nada nuevo: slug, nombre y tipo de negocio ya los resuelve `TenantSlugProvider`.
 * Forestal = tipo `madereria` (04-11). NO por tener el libro CTP prendido: la Bodega
 * (`main`) lo tiene prendido para las pruebas del panel y salía verde como Blas.
 * Copia de prueba se decide con el slug, que se conoce desde el primer pintado:
 * nunca se ve «real» por un instante en una copia.
 */

import type { CSSProperties } from "react";
import { FlaskConical, ShieldCheck } from "@buleje/design-system/icons";
import { useTenant } from "@/contexts/tenant-context";
import { cn } from "@/lib/utils";
import { esCopiaDePrueba, tonoDelNegocio, type TonoNegocio } from "@/lib/admin/copia-de-prueba";

/* Por tono: barra sólida (celular y línea de la cabecera) · franja de escritorio
   (tinte + borde) · texto (los `-ink` del DS, AA en claro y oscuro). Las clases van
   enteras para que Tailwind las vea. */
const ESTILO: Record<TonoNegocio, { barra: string; franja: string; texto: string }> = {
  forestal: {
    barra: "bg-[var(--color-success)]",
    franja:
      "sm:bg-[color-mix(in_oklab,var(--color-success)_14%,var(--surface-raised))] border-[color-mix(in_oklab,var(--color-success)_45%,var(--surface-raised))]",
    texto: "text-[var(--data-success-ink)]",
  },
  general: {
    barra: "bg-[var(--accent)]",
    franja:
      "sm:bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface-raised))] border-[color-mix(in_oklab,var(--accent)_40%,var(--surface-raised))]",
    texto: "text-[var(--accent-ink)]",
  },
  prueba: {
    barra: "bg-[var(--text-secondary)]",
    franja:
      "bg-[color-mix(in_oklab,var(--text-primary)_12%,var(--surface-raised))] border-[var(--rule-strong)]",
    texto: "text-[var(--text-primary)]",
  },
};

/* Rayado de la copia de prueba: se nota aunque el gris se parezca al fondo. Sin hex. */
const RAYADO: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 10px, color-mix(in oklab, var(--text-primary) 9%, transparent) 10px 20px)",
};

function useIdentidad(): { tono: TonoNegocio; nombre: string; listo: boolean } {
  const { tenantSlug, branding, industry, isLoading: cargandoNegocio } = useTenant();
  const prueba = esCopiaDePrueba({ slug: tenantSlug, name: branding.name });
  const forestal = industry === "madereria";
  /* Un negocio real espera a saber su tipo (si no, pasaría de turquesa a verde). */
  const listo = prueba || !cargandoNegocio;
  return {
    tono: tonoDelNegocio({ slug: tenantSlug, name: branding.name, forestal }),
    nombre: branding.name ?? tenantSlug,
    listo,
  };
}

export function FranjaNegocio() {
  const { tono, nombre, listo } = useIdentidad();
  if (!listo) {
    /* Reserva el alto para que el panel no salte cuando llega el dato. */
    return <div aria-hidden className="h-1 w-full bg-[var(--surface-sunken)] sm:h-7" />;
  }
  const prueba = tono === "prueba";
  const estilo = ESTILO[tono];
  const Icono = prueba ? FlaskConical : ShieldCheck;
  /* En celular un negocio real queda en 4 px de color; el texto sigue ahí para el lector de pantalla. */
  const soloEscritorio = prueba ? "" : "max-sm:sr-only";
  return (
    <div
      role="note"
      aria-label={`${nombre}: ${prueba ? "copia de prueba, no es el negocio real" : "negocio real"}`}
      data-franja-negocio={tono}
      style={prueba ? RAYADO : undefined}
      className={cn(
        "flex w-full items-center gap-2 overflow-hidden px-3 text-xs font-medium sm:h-7 sm:border-b sm:px-4",
        prueba ? "h-6 border-b" : "h-1",
        estilo.texto,
        estilo.franja,
        !prueba && "max-sm:bg-[var(--color-franja)]",
        !prueba && tono === "forestal" && "[--color-franja:var(--color-success)]",
        !prueba && tono === "general" && "[--color-franja:var(--accent)]",
      )}
    >
      <Icono aria-hidden className={cn("h-4 w-4 shrink-0", soloEscritorio)} />
      <span className={cn("min-w-0 truncate", soloEscritorio)}>{nombre}</span>
      {prueba ? (
        <span className="shrink-0 rounded-[var(--radius-xs)] bg-[var(--text-primary)] px-2 py-0.5 font-semibold uppercase tracking-wide text-[var(--surface-canvas)]">
          <span className="sm:hidden">Prueba</span>
          <span className="max-sm:hidden">Prueba · no es el negocio real</span>
        </span>
      ) : (
        <span className={cn("shrink-0 font-semibold uppercase tracking-wide", soloEscritorio)}>
          Negocio real
        </span>
      )}
    </div>
  );
}

/** Línea de 3 px pegada al borde de la cabecera sticky (la cabecera ya es `position: sticky`). */
export function LineaNegocio() {
  const { tono, listo } = useIdentidad();
  if (!listo) return null;
  return (
    <span
      aria-hidden
      data-linea-negocio={tono}
      className={cn("pointer-events-none absolute inset-x-0 top-0 h-[3px]", ESTILO[tono].barra)}
    />
  );
}
