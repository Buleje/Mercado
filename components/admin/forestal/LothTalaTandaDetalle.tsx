"use client";

/**
 * Lo plegado de una fila de «Talar varios árboles»: lo que casi siempre es
 * igual para toda la jornada (motosierrista, hora) y la evidencia de ESE árbol
 * (GPS en el tocón, foto, observación). Si el libro rechazó la fila, arriba va
 * su motivo; si el árbol está bajo el DMC, el motivo que pide T8 para tumbarlo.
 */

import { useRef, useState } from "react";
import { AlertTriangle, Camera, Loader2, MapPin, X } from "@buleje/design-system/icons";
import { colaboradorPorNombre } from "./LothTalaDatosInternos";
import { pideJustificacion, queCorregir, type ComunesTala, type FilaTala } from "@/lib/forestal/loth-tala-tanda";
import { subirFotoEvidencia, type Motosierrista } from "./hooks/use-tala-en-tanda";

const INPUT =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] disabled:opacity-70";
const BTN =
  "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60";
const ROTULO = "mb-1 block text-xs font-semibold text-[var(--text-secondary)]";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

type Cambio = Partial<Pick<FilaTala, "motosierrista" | "motosierristaId" | "hora" | "gps" | "fotoUrl" | "nota" | "justificacionDmc" | "motivoCupo">>;

export default function LothTalaTandaDetalle({
  fila: f,
  comunes,
  motosierristas,
  idLista,
  bloqueada,
  onEditar,
}: {
  fila: FilaTala;
  comunes: ComunesTala;
  motosierristas: readonly Motosierrista[];
  /** El `<datalist>` del personal, uno solo para toda la planilla. */
  idLista: string;
  bloqueada: boolean;
  onEditar: (cambio: Cambio) => void;
}) {
  const code = f.arbol.treeCode;
  const quieta = bloqueada || f.resultado?.estado === "guardada";
  const fallida = f.resultado?.estado === "fallida" ? f.resultado : null;
  const [ubicando, setUbicando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  function tomarGps() {
    if (!navigator.geolocation) {
      setAviso("Este equipo no da la ubicación.");
      return;
    }
    setUbicando(true);
    setAviso(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onEditar({ gps: { lat: p.coords.latitude, lng: p.coords.longitude, origen: "telefono" } });
        setUbicando(false);
      },
      (err) => {
        setAviso(`No se pudo obtener la ubicación: ${err.message}`);
        setUbicando(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function subir(file: File | undefined) {
    if (!file) return;
    setSubiendo(true);
    setAviso(null);
    try {
      onEditar({ fotoUrl: await subirFotoEvidencia(file) });
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
      {fallida && (
        <p role="alert" className={`flex items-start gap-2 text-sm font-semibold ${ROJO}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {fallida.mensaje}
            {queCorregir(fallida) === "fecha" && " Cambia la fecha de esta fila y vuelve a guardar."}
          </span>
        </p>
      )}

      {pideJustificacion(f) && (
        <label className="block rounded-lg border-2 border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] p-2.5 dark:bg-[var(--data-error-500)]/12">
          <span className={`mb-1 block text-sm font-bold ${ROJO}`}>Bajo el diámetro mínimo de corta: ¿por qué se tala?</span>
          <input
            value={f.justificacionDmc}
            onChange={(e) => onEditar({ justificacionDmc: e.target.value })}
            disabled={quieta}
            maxLength={500}
            placeholder="Motivo (ej. árbol caído por viento, autorización especial N°…)"
            aria-label={`${code} · justificación de la tala bajo el DMC`}
            className={INPUT}
          />
          <span className={`mt-1 block text-xs font-semibold ${ROJO}`}>Sin el motivo el libro no la acepta. Queda escrito en la línea y en la auditoría.</span>
        </label>
      )}

      {queCorregir(fallida) === "cupo" && (
        <label className="block rounded-lg border-2 border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] p-2.5 dark:bg-[var(--data-error-500)]/12">
          <span className={`mb-1 block text-sm font-bold ${ROJO}`}>Pasa el cupo de la especie: ¿por qué se registra igual?</span>
          <input
            value={f.motivoCupo}
            onChange={(e) => onEditar({ motivoCupo: e.target.value })}
            disabled={quieta}
            maxLength={500}
            placeholder="Motivo (ej. el censo subestimó la altura, ampliación en trámite N°…)"
            aria-label={`${code} · motivo de la tala por encima del cupo`}
            className={INPUT}
          />
          <span className={`mt-1 block text-xs font-semibold ${ROJO}`}>Con el motivo se registra: queda escrito en la línea y en la auditoría.</span>
        </label>
      )}

      <div className="grid grid-cols-6 gap-3 [&>*]:min-w-0">
        <label className="col-span-6 block sm:col-span-4">
          <span className={ROTULO}>Motosierrista de este árbol</span>
          <input
            type="text"
            list={motosierristas.length > 0 ? idLista : undefined}
            value={f.motosierrista ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onEditar(v.trim() ? { motosierrista: v, motosierristaId: colaboradorPorNombre(motosierristas, v)?.id ?? null } : { motosierrista: null, motosierristaId: null });
            }}
            disabled={quieta}
            maxLength={120}
            placeholder={comunes.motosierrista.trim() ? `${comunes.motosierrista.trim()} (el de todos)` : "El de todos"}
            className={INPUT}
          />
        </label>
        <label className="col-span-6 block sm:col-span-2">
          <span className={ROTULO}>Hora de tala</span>
          <input
            type="time"
            value={f.hora ?? comunes.hora}
            onChange={(e) => onEditar({ hora: e.target.value === comunes.hora ? null : e.target.value })}
            disabled={quieta}
            title={f.hora != null ? "Distinta a la de todos" : "La de todos"}
            className={`${INPUT} font-mono tabular-nums ${f.hora != null ? "border-[var(--accent)]" : ""}`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <MapPin className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" aria-hidden="true" />
          {f.gps ? (f.gps.origen === "telefono" ? "GPS del teléfono" : "Coordenada copiada del censo") : "Sin GPS"}
        </span>
        <button type="button" onClick={tomarGps} disabled={quieta || ubicando} className={BTN}>
          {ubicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {f.gps?.origen === "telefono" ? "Tomar otra vez" : "Tomar GPS aquí"}
        </button>
        <input ref={archivoRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`Foto del tocón del árbol ${code}`} onChange={(e) => void subir(e.target.files?.[0])} />
        <button type="button" onClick={() => archivoRef.current?.click()} disabled={quieta || subiendo} className={BTN}>
          {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" />}
          {subiendo ? "Subiendo…" : f.fotoUrl ? "Cambiar foto" : "Foto del tocón"}
        </button>
        {f.fotoUrl && (
          <span className="inline-flex items-center gap-1">
            <a href={f.fotoUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.fotoUrl} alt={`Foto del tocón del árbol ${code}`} className="h-10 w-auto rounded-md border border-[var(--rule-base)] object-cover" />
            </a>
            {!quieta && (
              <button type="button" onClick={() => onEditar({ fotoUrl: null })} aria-label={`Quitar la foto del árbol ${code}`} className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]">
                <X className="h-4 w-4" />
              </button>
            )}
          </span>
        )}
      </div>
      {aviso && (
        <p className={`flex items-center gap-1.5 text-xs ${ROJO}`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {aviso}
        </p>
      )}

      <label className="block">
        <span className={ROTULO}>Observación de esta tala</span>
        <input
          value={f.nota}
          onChange={(e) => onEditar({ nota: e.target.value })}
          disabled={quieta}
          maxLength={500}
          placeholder="Opcional (ej. fuste hueco en la base)"
          className={INPUT}
        />
      </label>
    </div>
  );
}
