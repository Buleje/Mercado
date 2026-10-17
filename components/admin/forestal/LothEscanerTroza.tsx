"use client";

/**
 * «Escanear troza» del Control del permiso (Libro TH): se apunta el celular a
 * la etiqueta de una troza y aparece su tarjeta — estado, GTF, días en patio —
 * sin buscarla en la tabla. Con «Contar el patio» se escanea la pila de
 * corrido y se arma la lista («Leídas 12 · 11 en este permiso · 1
 * desconocida»), exportable a CSV.
 *
 * Tres entradas, el mismo camino (`use-escaner-troza-loth`):
 *   · la CÁMARA del celular: el `BarcodeScanner` del POS, vía `CamaraEscaneo`
 *     (tokens del panel + encima de Radix), en modo continuo;
 *   · la PISTOLA, que para el navegador es un teclado: tipea y da Enter;
 *   · el TECLADO: sin cámara (o sin `BarcodeDetector`, p. ej. Safari/Firefox)
 *     el campo es la entrada, y queda con el foco.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, ListChecks, ScanBarcode, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { resumirRafaga, textoResumenRafaga } from "@/lib/forestal/loth-qr-troza";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { CamaraEscaneo, LineaResultado } from "./escaner-trozas-partes";
import { useEscanerTrozaLoth } from "./hooks/use-escaner-troza-loth";
import LothEscanerTrozaLista, { bajarCsv } from "./LothEscanerTrozaLista";
import LothEscanerTrozaTarjeta from "./LothEscanerTrozaTarjeta";
import type { NavTablero } from "./LothTableroTrozasTabla";

/** ¿Este navegador puede leer códigos con la cámara? (Chrome/Edge en Android sí.) */
export function puedeLeerConCamara(): boolean {
  return (
    typeof window !== "undefined" &&
    "BarcodeDetector" in window &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export default function LothEscanerTroza({
  filas,
  entries,
  tituloHabilitante,
  nav,
  pedidoCamara,
  onVerEnTabla,
  onCerrar,
}: {
  /** Todas las trozas del permiso, ya cruzadas (sin los filtros de la tabla). */
  filas: readonly TrozaTablero[];
  entries: readonly LothEntryDTO[];
  tituloHabilitante?: string | null;
  nav?: NavTablero;
  /** Cambia cada vez que se toca «Escanear troza»: abre la cámara si se puede. */
  pedidoCamara: number;
  onVerEnTabla: (code: string) => void;
  onCerrar: () => void;
}) {
  const campoId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [camara, setCamara] = useState(false);
  const [conCamara] = useState(puedeLeerConCamara);
  const s = useEscanerTrozaLoth(filas);
  const resumen = resumirRafaga(s.lista);

  useEffect(() => {
    if (conCamara) setCamara(true);
    else inputRef.current?.focus();
  }, [pedidoCamara, conCamara]);

  const cerrarCamara = useCallback(() => {
    setCamara(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const { procesar, elegir, rafaga } = s;
  const alLeerConCamara = useCallback(
    (crudo: string) => {
      if (procesar(crudo)) cerrarCamara();
    },
    [procesar, cerrarCamara],
  );

  const lineaResumen = (
    <p className="text-sm font-bold tabular-nums text-[var(--text-secondary)]" data-escaner-resumen>
      {textoResumenRafaga(resumen)}
      {resumen.m3 > 0 && ` · ${fmtM3(resumen.m3)} m³`}
    </p>
  );

  return (
    <section
      aria-label="Escanear troza"
      className="space-y-3 rounded-2xl border-2 border-[var(--accent-muted)] bg-[var(--surface-sunken)] p-3"
      data-escaner-loth
    >
      <div className="flex items-center gap-2">
        <label
          htmlFor={campoId}
          className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]"
        >
          <ScanBarcode
            className="hidden h-5 w-5 shrink-0 text-[var(--text-tertiary)] sm:block"
            aria-hidden="true"
          />
          <span className="sr-only">Escanear o tipear el código de una troza</span>
          <input
            id={campoId}
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              s.procesar(texto);
              setTexto("");
            }}
            placeholder="Código de troza o árbol + Enter"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] dark:bg-transparent"
          />
        </label>
        {conCamara && (
          <button
            type="button"
            onClick={() => setCamara(true)}
            aria-label="Escanear con la cámara"
            title="Escanear con la cámara"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-600)]"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el escáner"
          title="Cerrar el escáner"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={s.rafaga}
          onClick={() => s.cambiarModo(!s.rafaga)}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors ${
            s.rafaga
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
          }`}
        >
          <ListChecks className="h-4 w-4" aria-hidden="true" />
          Contar el patio
        </button>
        <InfoTip
          title="Escanear trozas"
          what="Lee el QR grande o el chico de la etiqueta, el código de barras, o el código que tipees."
          affects="Una lectura: aparece la tarjeta de la troza. «Contar el patio»: escaneas la pila de corrido y se arma la lista, que bajas en CSV."
          example="Escaneas 12 trozas → «Leídas 12 · 11 en este permiso · 1 desconocida»."
        />
        {!conCamara && (
          <span className="text-sm text-[var(--text-secondary)]">
            Sin cámara en este navegador: tipea el código o usa la pistola.
          </span>
        )}
      </div>

      <div role="status" aria-live="polite" className="space-y-2">
        {s.aviso && <LineaResultado key={s.aviso.n} aviso={s.aviso} onElegir={s.elegir} />}
      </div>

      {!s.rafaga && s.actual && (
        <LothEscanerTrozaTarjeta
          fila={s.actual}
          entries={entries}
          tituloHabilitante={tituloHabilitante}
          nav={nav}
          onVerEnTabla={onVerEnTabla}
        />
      )}

      {s.rafaga && (
        <LothEscanerTrozaLista
          lista={s.lista}
          resumen={lineaResumen}
          onCsv={() => bajarCsv(s.lista, tituloHabilitante)}
          onVaciar={s.vaciar}
        />
      )}

      {camara && (
        <CamaraEscaneo
          continuo
          onLectura={alLeerConCamara}
          onCerrar={cerrarCamara}
          pie={
            <div className="space-y-1">
              {s.aviso ? (
                <LineaResultado
                  key={s.aviso.n}
                  aviso={s.aviso}
                  onElegir={(t) => {
                    elegir(t);
                    if (!rafaga) cerrarCamara();
                  }}
                />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Apunta a la etiqueta de la troza.
                </p>
              )}
              {s.rafaga && lineaResumen}
            </div>
          }
        />
      )}
    </section>
  );
}
