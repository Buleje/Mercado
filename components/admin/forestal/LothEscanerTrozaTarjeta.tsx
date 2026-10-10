"use client";

/**
 * La tarjeta de la troza escaneada en «Control del permiso»: qué es, en qué
 * estado está y qué se puede hacer con ella — sólo con acciones que el libro
 * YA tiene (la cadena, la GTF, la etiqueta, el mapa del árbol, la sección de
 * despacho). Nada de «marcar despachada» desde acá: la salida legal se
 * registra con su GTF en «Despachar con guía».
 */

import { useState, type ReactNode } from "react";
import {
  FileText,
  Link2,
  Loader2,
  MapPin,
  Printer,
  Search,
  Truck,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { ESTADOS_META, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { diasEnPatioDe } from "@/lib/forestal/loth-tablero-columnas";
import { fechaConDia } from "@/lib/forestal/loth-qr-troza";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { TONO } from "./loth-tablero-partes";
import type { NavTablero } from "./LothTableroTrozasTabla";

/**
 * Cambia de vista DENTRO del libro sin recargar: `pushState` + `popstate`
 * (receta de `loth-mapa-tala-url`). `useVistaModulo` relee `?vista=` y el
 * libro recoge `?seccion=` / `?arbol=` en su escucha de `popstate`.
 */
export function irDentroDelLibro(params: Record<string, string>): void {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  window.history.pushState(null, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const BTN =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</dt>
      <dd className="truncate text-sm font-semibold text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

const VACIO = <span className="font-normal text-[var(--text-tertiary)]">—</span>;

export default function LothEscanerTrozaTarjeta({
  fila,
  entries,
  tituloHabilitante,
  nav,
  onVerEnTabla,
}: {
  fila: TrozaTablero;
  /** Las líneas del libro: de ahí sale la línea de Trozado para reimprimir su etiqueta. */
  entries: readonly LothEntryDTO[];
  tituloHabilitante?: string | null;
  nav?: NavTablero;
  onVerEnTabla: (code: string) => void;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dias = diasEnPatioDe(fila);
  const sigue = fila.estado === "disponible";
  const trozado = entries.find(
    (e) => e.section === "trozado" && e.status !== "anulado" && e.trozaCode?.trim() === fila.code,
  );

  /* La ventana se abre YA, en el clic: después de un `await` el navegador la
     bloquea como pop-up (gotcha de ADR-436, igual que en el libro). */
  const imprimir = () => {
    if (!trozado) return;
    const ventana = window.open("", "_blank", "width=980,height=760");
    if (!ventana) {
      setError(
        "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.",
      );
      return;
    }
    ventana.document.write(
      '<!doctype html><meta charset="utf-8"><title>Generando etiqueta…</title><p style="font:16px system-ui;padding:24px">Generando etiqueta…</p>',
    );
    setImprimiendo(true);
    setError(null);
    import("@/lib/forestal/loth-troza-etiquetas")
      .then(({ imprimirEtiquetasTrozasLoth }) =>
        imprimirEtiquetasTrozasLoth([trozado], {
          tituloHabilitante: tituloHabilitante ?? null,
          planNumber: fila.plan,
          ventana,
        }),
      )
      .catch((err: unknown) => {
        console.error("[loth-escaner] etiqueta falló", err);
        setError("No se pudo armar la etiqueta. Vuelve a intentarlo.");
        try {
          ventana.close();
        } catch {
          /* ya cerrada */
        }
      })
      .finally(() => setImprimiendo(false));
  };

  const verArbol = (arbol: string) =>
    nav?.onVerArbol ? nav.onVerArbol(arbol) : irDentroDelLibro({ vista: "mapa", arbol });
  const registrarDespacho = () =>
    nav?.onRegistrarDespacho
      ? nav.onRegistrarDespacho(fila.code)
      : irDentroDelLibro({ vista: "secciones", seccion: "despacho_troza" });

  return (
    <article
      aria-label={`Troza ${fila.code}`}
      data-escaner-tarjeta={fila.estado}
      className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">{fila.code}</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-sm font-bold ${TONO[fila.estado].chip}`}
        >
          <span className={`h-2 w-2 rounded-full ${TONO[fila.estado].punto}`} aria-hidden="true" />
          {ESTADOS_META[fila.estado].label}
        </span>
        {fila.cites && (
          <span className="rounded-md bg-[var(--data-info-50)] px-1.5 py-0.5 text-xs font-bold text-[var(--data-info-700)]">
            CITES
          </span>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Dato label="Árbol">
          {fila.treeCode ? <span className="font-mono">{fila.treeCode}</span> : VACIO}
        </Dato>
        <Dato label="Especie">{fila.especie ?? VACIO}</Dato>
        <Dato label="Volumen">
          {fila.volumenM3 != null ? (
            <span className="font-mono tabular-nums">{fmtM3(fila.volumenM3)} m³</span>
          ) : (
            <span className="font-normal text-[var(--text-tertiary)]">sin medir</span>
          )}
        </Dato>
        <Dato label={sigue ? "Días en patio" : "Estuvo en patio"}>
          {dias != null ? <span className="font-mono tabular-nums">{dias} d</span> : VACIO}
        </Dato>
        <Dato label="GTF">{fila.gtf ? <span className="font-mono">{fila.gtf}</span> : VACIO}</Dato>
        <Dato label="Placa">
          {fila.placa ? <span className="font-mono">{fila.placa}</span> : VACIO}
        </Dato>
        <Dato label="Salida">{fechaConDia(fila.fechaSalida) ?? VACIO}</Dato>
        <Dato label="Plan">
          {fila.plan ? <span className="font-mono">{fila.plan}</span> : VACIO}
        </Dato>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {sigue && (
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={registrarDespacho}
              className={`${BTN} border-[var(--accent)] text-[var(--accent-dark)] dark:text-[var(--accent)]`}
            >
              <Truck className="h-4 w-4" aria-hidden="true" />
              Registrar su despacho
            </button>
            <InfoTip
              title="Registrar su despacho"
              what="Te lleva a Despacho de trozas: la salida se registra con su GTF en «Despachar con guía»."
              affects="La guía todavía no llega con la troza elegida: márcala en la lista de trozas de la guía."
              side="left"
            />
          </span>
        )}
        {nav?.onVerCadena && (
          <button type="button" onClick={() => nav.onVerCadena?.(fila.code)} className={BTN}>
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Ver su cadena
          </button>
        )}
        {fila.gtf && nav?.onVerGtf && (
          <button type="button" onClick={() => nav.onVerGtf?.(fila.gtf as string)} className={BTN}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Ver la GTF
          </button>
        )}
        {trozado && (
          <button type="button" onClick={imprimir} disabled={imprimiendo} className={BTN}>
            {imprimiendo ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Printer className="h-4 w-4" aria-hidden="true" />
            )}
            Imprimir etiqueta
          </button>
        )}
        {fila.treeCode && (
          <button type="button" onClick={() => verArbol(fila.treeCode as string)} className={BTN}>
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Árbol en el mapa
          </button>
        )}
        <button type="button" onClick={() => onVerEnTabla(fila.code)} className={BTN}>
          <Search className="h-4 w-4" aria-hidden="true" />
          Ver en la tabla
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)]">
          {error}
        </p>
      )}
    </article>
  );
}
