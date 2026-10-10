"use client";

/**
 * «Leer voucher» en el bloque 3 del alta: el botón (en la cabecera del bloque),
 * el aviso de lo que se leyó y la marca «del voucher» bajo el monto. El estado
 * y el OCR viven en `hooks/use-leer-voucher`; el parser, en
 * `lib/adelantos/voucher` (puro, con test).
 */

import { useRef } from "react";
import { AlertTriangle, Loader2, ScanText, Undo2, X } from "@buleje/design-system/icons";
import type { LeerVoucher } from "../hooks/use-leer-voucher";

const BOTON_SUAVE =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

export function BotonLeerVoucher({ voucher }: { voucher: LeerVoucher }) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const leyendo = voucher.estado.fase === "leyendo";
  return (
    <>
      <button
        type="button"
        onClick={() => archivoRef.current?.click()}
        disabled={leyendo}
        title="Sube la captura de Yape, Plin o de la transferencia: pone el monto, la fecha y la nota para que los revises."
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary/12 px-3 text-sm font-bold text-[var(--accent-ink)] ring-1 ring-primary/40 transition-colors hover:bg-primary/20 disabled:opacity-60"
      >
        {leyendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ScanText className="h-4 w-4" aria-hidden />}
        Leer voucher
      </button>
      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        aria-label="Captura del voucher"
        data-voucher-archivo
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          /* Vaciarlo: elegir la misma captura otra vez tiene que volver a leerla. */
          e.target.value = "";
          if (f) void voucher.leer(f);
        }}
      />
    </>
  );
}

function Miniatura({ src }: { src: string }) {
  /* eslint-disable-next-line @next/next/no-img-element -- blob local de la captura, no pasa por el optimizador */
  return <img src={src} alt="Captura del voucher" className="h-20 w-14 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover object-top" />;
}

export function AvisoVoucher({ voucher }: { voucher: LeerVoucher }) {
  const { estado } = voucher;
  if (estado.fase === "inactivo") return null;

  if (estado.fase === "leyendo") {
    const p = estado.progreso;
    return (
      <div role="status" aria-live="polite" data-aviso-voucher="leyendo" className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5">
        <Miniatura src={estado.miniatura} />
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent-ink)]" aria-hidden />
        <span className="text-sm font-semibold text-[var(--text-secondary)]">
          {p ? `${p.etapa}… ${Math.round(p.progreso * 100)} %` : "Leyendo el voucher…"}
        </span>
      </div>
    );
  }

  if (estado.fase === "error" || estado.fase === "sin-monto") {
    return (
      <div role="alert" data-aviso-voucher={estado.fase} className="mb-4 flex items-start gap-3 rounded-xl bg-[var(--data-warning-500)]/10 px-3.5 py-3">
        {estado.fase === "sin-monto" && <Miniatura src={estado.miniatura} />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex items-start gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden />
            {estado.fase === "error" ? estado.mensaje : "No encontré el monto en la imagen: no cambié nada."}
          </p>
          {estado.fase === "sin-monto" && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Prueba con la captura original del celular (no una foto de otra pantalla) o escribe el monto a mano. Confianza de la lectura: {estado.confianza} %.
              </p>
              <details className="text-sm text-[var(--text-secondary)]">
                <summary className="cursor-pointer font-semibold">Lo que leí</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-sunken)] p-2 font-mono text-xs">
                  {estado.texto.trim() || "(nada)"}
                </pre>
              </details>
            </>
          )}
        </div>
        <button type="button" onClick={voucher.cerrar} aria-label="Cerrar el aviso del voucher" className={BOTON_SUAVE}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  const baja = estado.confianza < 80;
  return (
    <div role="status" aria-live="polite" data-aviso-voucher="leido" className="mb-4 flex items-start gap-3 rounded-xl bg-primary/8 px-3.5 py-3 ring-1 ring-primary/30">
      <Miniatura src={estado.miniatura} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Ícono y título en un solo bloque: a 400 px el ícono quedaba solo en su renglón. */}
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)]">
            <ScanText className="h-4 w-4 shrink-0" aria-hidden />
            Leído del voucher — revisa
          </span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
              baja ? "bg-[var(--data-warning-500)]/15 text-[var(--text-primary)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            }`}
          >
            Confianza {estado.confianza} %{baja ? " · baja" : ""}
          </span>
        </div>
        <ul className="space-y-0.5 text-sm text-[var(--text-primary)]">
          {estado.puestos.map((p) => (
            <li key={p} className="break-words">{p}</li>
          ))}
        </ul>
        {estado.avisos.map((a) => (
          <p key={a} className="flex items-start gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden />
            {a}
          </p>
        ))}
        <p className="text-sm text-[var(--text-tertiary)]">Nada se guarda hasta que confirmes con el botón de abajo.</p>
        {/* Abajo y en fila, no en una columna al costado: a 400 px la columna
            dejaba ~110 px para el texto. */}
        <div className="-ml-2.5 flex flex-wrap gap-1">
          <button type="button" onClick={voucher.deshacer} className={BOTON_SUAVE}>
            <Undo2 className="h-4 w-4" aria-hidden /> Deshacer
          </button>
          <button type="button" onClick={voucher.cerrar} className={BOTON_SUAVE}>
            <X className="h-4 w-4" aria-hidden /> Listo
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bajo el monto, mientras siga siendo el que se leyó. */
export function MarcaDelVoucher({ voucher, monto }: { voucher: LeerVoucher; monto: string }) {
  const { estado } = voucher;
  if (estado.fase !== "leido" || monto !== estado.montoPuesto) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-ink)]">
      <ScanText className="h-4 w-4 shrink-0" aria-hidden />
      Leído del voucher — revisa
    </p>
  );
}
