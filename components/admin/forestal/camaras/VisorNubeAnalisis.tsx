"use client";

/**
 * El aviso de «Analizar» (ADR-471) debajo del video: mientras se toma, sube y
 * lee la foto, un renglón con su paso; al terminar, lo que vio la IA (personas,
 * placa, chalecos) con la miniatura y «Ver en Fotos». Lo usan el visor de una
 * cámara y cada cuadro del mosaico.
 */

import { AlertTriangle, Images, Loader2, Sparkles, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BTN } from "./camaras-ui";
import { resumenDeLectura } from "./analizar-cuadro";
import type { AnalisisCuadro, FaseAnalisis } from "./use-analizar-cuadro";

const PASO: Partial<Record<FaseAnalisis, string>> = {
  capturando: "Tomando el cuadro del video…",
  subiendo: "Guardando la foto…",
  leyendo: "La IA está mirando la foto…",
};

const CAJA = "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--text-primary)]";

const TONO = {
  ok: "border-[var(--accent)]/40 bg-[var(--accent-soft)]",
  espera: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
  aviso: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10",
} as const;

interface Props {
  a: AnalisisCuadro;
  /** Cierra el visor y lleva a «Fotos», donde quedó la foto con su lectura. */
  onVerFotos: () => void;
}

function BotonCerrar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar el aviso"
      className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

export default function VisorNubeAnalisis({ a, onVerFotos }: Props) {
  const e = a.estado;
  return (
    <>
      {a.espera && (
        <p role="status" className="text-xs text-[var(--text-tertiary)]">
          {a.espera}
        </p>
      )}
      {e && PASO[e.fase] && (
        <p role="status" className={cn(CAJA, TONO.espera, "items-center")} data-analisis={e.fase}>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent-ink)]" aria-hidden />
          {PASO[e.fase]}
        </p>
      )}
      {e?.fase === "error" && (
        <div role="alert" className={cn(CAJA, TONO.aviso)} data-analisis="error">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]"
            aria-hidden
          />
          <span className="min-w-0 flex-1">{e.mensaje}</span>
          <BotonCerrar onClick={a.cerrar} />
        </div>
      )}
      {e?.fase === "listo" && <Resultado a={a} onVerFotos={onVerFotos} />}
    </>
  );
}

function Resultado({ a, onVerFotos }: Props) {
  const captura = a.estado?.captura ?? null;
  const r = resumenDeLectura(captura);
  /* Miniatura + texto + cerrar en una fila y «Ver en Fotos» abajo: a 400 px (y
     en un cuadro del mosaico, ~480 px) el botón al costado aplastaba el texto. */
  return (
    <div
      role="status"
      className={cn("rounded-xl border p-2.5 text-sm text-[var(--text-primary)]", TONO[r.tono])}
      data-analisis="listo"
    >
      <div className="flex items-start gap-2.5">
        {captura?.url && (
          /* eslint-disable-next-line @next/next/no-img-element -- imagen de storage propio, sin layout fijo */
          <img
            src={captura.url}
            alt=""
            className="h-14 w-20 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover sm:w-24"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            <Sparkles
              className="mr-1 inline-block h-4 w-4 align-text-bottom text-[var(--accent-ink)]"
              aria-hidden
            />
            {r.titulo}
          </p>
          {r.detalle && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{r.detalle}</p>}
        </div>
        <BotonCerrar onClick={a.cerrar} />
      </div>
      <button type="button" onClick={onVerFotos} className={cn(BTN, "mt-2")}>
        <Images className="h-4 w-4" aria-hidden /> Ver en Fotos
      </button>
    </div>
  );
}
