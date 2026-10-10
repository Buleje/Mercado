"use client";

/**
 * «Papeles de esta guía» dentro de «Documentos del permiso» (ADR-482, Brandon
 * 08-10: «la opción de poner ahí todos los documentos de la guía, sea factura,
 * guía de remisión, GTF y lista de trozas originales firmado y demás»).
 *
 * Son los MISMOS casilleros del Libro CTP (ADR-438, `CtpDocumentosGuiaCasilleros`):
 * con el mismo N° de guía, lo que se sube acá lo ve el ingreso del CTP y al
 * revés. Plegable: abre solo cuando la guía no tiene ningún papel de ley (lo
 * que hay que hacer es subirlos); con papeles, se listan arriba junto a las
 * carpetas del plan para elegir y mandar.
 */

import { useCallback, useRef, useState } from "react";
import { ChevronDown, Paperclip } from "@buleje/design-system/icons";
import type { DocumentosDeGuia } from "@/hooks/use-documentos-guia";
import { PAPELES_DE_LEY, labelEnFrase } from "@/lib/forestal/documentos-guia";
import type { ArchivoDelPlan } from "@/lib/forestal/plan-documentos-tipos";
import CtpDocumentosGuiaCasilleros from "./CtpDocumentosGuiaCasilleros";
import { usePapelesGuias } from "./papeles-guias-contexto";

/** Los archivos de los casilleros, en la forma de un archivo del plan (sin repetir). */
function comoArchivos(d: DocumentosDeGuia): ArchivoDelPlan[] {
  const vistos = new Set<string>();
  return d.casilleros.flatMap((c) =>
    c.docs
      .filter((x) => !vistos.has(x.id) && vistos.add(x.id))
      .map((x) => ({
        documentId: x.id,
        nombre: x.name,
        mimeType: x.mimeType,
        size: x.size,
        expiresAt: null,
        uploadedAt: x.uploadedAt,
        campoId: c.clave,
      })),
  );
}

export default function GtfPapelesDeLaGuia({
  gtf,
  onArchivos,
  onCambio,
}: {
  gtf: string;
  /** Los papeles subidos, para elegirlos junto a las carpetas del plan. */
  onArchivos: (a: ArchivoDelPlan[]) => void;
  /** Cambió cuántos casilleros tienen archivo (quien no está bajo la tabla del Libro TH). */
  onCambio?: () => void;
}) {
  const ctx = usePapelesGuias();
  /* El primer conteo es la lectura al abrir, no un cambio: no se repide la tabla. */
  const leido = useRef(false);
  const [datos, setDatos] = useState<DocumentosDeGuia | null>(null);
  /* `null` = todavía no lo tocó: abierto sólo si no hay ningún papel de ley. */
  const [abiertoManual, setAbiertoManual] = useState<boolean | null>(null);

  const faltan = datos
    ? PAPELES_DE_LEY.filter((c) => !datos.casilleros.some((k) => k.clave === c && k.docs.length > 0))
    : null;
  const abierto = abiertoManual ?? (faltan != null && faltan.length === PAPELES_DE_LEY.length);

  const alLeer = useCallback(
    (d: DocumentosDeGuia) => {
      setDatos(d);
      onArchivos(comoArchivos(d));
    },
    [onArchivos],
  );

  const resumen =
    faltan == null
      ? "Leyendo…"
      : faltan.length === 0
        ? `Completos: ${PAPELES_DE_LEY.length} de ${PAPELES_DE_LEY.length}`
        : `${PAPELES_DE_LEY.length - faltan.length} de ${PAPELES_DE_LEY.length} · falta ${faltan
            .map(labelEnFrase)
            .join(", ")}`;

  return (
    <section
      aria-label={`Papeles de la guía ${gtf}`}
      className="rounded-xl border-2 border-[var(--accent)]/40"
    >
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbiertoManual(!abierto)}
        className="flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-left sm:flex-nowrap"
      >
        <Paperclip className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
        <span className="mr-auto text-sm font-bold text-[var(--text-primary)] sm:mr-0">Papeles de esta guía</span>
        {/* En celular, en su propia línea: el «falta factura, GTF…» no se corta. */}
        <span className="order-last basis-full pl-6 text-sm tabular-nums text-[var(--text-secondary)] sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto sm:truncate sm:pl-0">
          {resumen}
        </span>
        <span className="shrink-0 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          {abierto ? "Cerrar" : "Subir o cambiar"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {/* Montado aunque esté plegado: sus archivos se listan abajo para elegirlos. */}
      <div hidden={!abierto} className="border-t border-[var(--rule-soft)] p-3">
        <CtpDocumentosGuiaCasilleros
          gtf={gtf}
          onDatos={alLeer}
          onCambio={() => {
            if (!leido.current) {
              leido.current = true;
              return;
            }
            ctx?.refrescar();
            onCambio?.();
          }}
        />
      </div>
    </section>
  );
}
