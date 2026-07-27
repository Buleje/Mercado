"use client";

/**
 * ImportarProgreso — lo que se ve MIENTRAS se sube una carpeta entera.
 *
 * Subir 300 archivos detrás de una barra muda es una pantalla de fe: no se
 * sabe si avanza, cuál falló ni cuánto falta. Acá se ve el porcentaje, los
 * megas, el tiempo que queda y, sobre todo, la lista archivo por archivo con
 * su estado — que es lo que uno mira cuando algo tarda.
 */

import { useEffect, useRef } from "react";
import { AlertCircle, Check, ChevronRight, Loader2 } from "@buleje/design-system/icons";
import { bytesLegibles } from "@/lib/documentos/importar-arbol";

/** Los mismos estados que reporta el pool de subida del drive. */
export type EstadoArchivo = "en-cola" | "comprimiendo" | "subiendo" | "listo" | "error";

export interface FilaArchivo {
  /** Ruta relativa dentro del import: "Contratos/2026/alquiler.pdf". */
  ruta: string;
  nombre: string;
  carpeta: string;
  size: number;
}

export interface ImportarProgresoProps {
  archivos: FilaArchivo[];
  estados: Record<string, EstadoArchivo>;
  /** Por qué falló cada uno, por ruta. Sólo para los que están en error. */
  motivos?: Record<string, string>;
  bytesListos: number;
  bytesTotal: number;
  archivosListos: number;
  carpetasListas: number;
  carpetasTotal: number;
  /** Segundos desde que arrancó la subida (para el "falta …"). */
  segundos: number;
  terminado: boolean;
  /** El import ni llegó a subir (falló el árbol): no hay progreso que mostrar. */
  abortado?: boolean;
  /** Qué está haciendo ahora ("Creando 6 carpetas…"). */
  paso: string;
}

const META: Record<EstadoArchivo, { texto: string; clase: string }> = {
  "en-cola": { texto: "en cola", clase: "text-[var(--text-tertiary)]" },
  comprimiendo: { texto: "comprimiendo", clase: "text-[var(--data-info-500)]" },
  subiendo: { texto: "subiendo", clase: "text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  listo: { texto: "listo", clase: "text-[var(--data-success-500)]" },
  error: { texto: "error", clase: "text-[var(--data-error-500)]" },
};

function Icono({ estado }: { estado: EstadoArchivo }) {
  if (estado === "listo") return <Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-500)]" />;
  if (estado === "error") return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--data-error-500)]" />;
  if (estado === "en-cola") return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--rule-strong)]" />;
  return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--accent-ink)] dark:text-[var(--accent)]" />;
}

/** "2 min 10 s" / "45 s" — nadie quiere leer 130 segundos. */
function tiempoLegible(seg: number): string {
  if (seg < 60) return `${Math.max(1, Math.round(seg))} s`;
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

export default function ImportarProgreso({
  archivos, estados, motivos = {}, bytesListos, bytesTotal, archivosListos,
  carpetasListas, carpetasTotal, segundos, terminado, abortado, paso,
}: ImportarProgresoProps) {
  const total = archivos.length;
  // El porcentaje sale SIEMPRE de los bytes confirmados, también al terminar:
  // forzar 100% al final tapaba los archivos que habían fallado.
  const crudo = bytesTotal === 0 ? 0 : (bytesListos / bytesTotal) * 100;
  const pct = terminado ? Math.round(crudo) : Math.min(99, Math.round(crudo));

  // Los que están viajando ahora mismo. Con un pool de 3 y archivos parejos, el
  // porcentaje confirmado se queda en 0 varios segundos: la franja translúcida
  // muestra lo que está en vuelo para que la barra no parezca colgada.
  const bytesEnVuelo = terminado ? 0 : archivos.reduce((s, a) => {
    const e = estados[a.ruta];
    return e === "subiendo" || e === "comprimiendo" ? s + a.size : s;
  }, 0);
  const pctEnVuelo = bytesTotal === 0 ? 0 : Math.min(100, Math.round(((bytesListos + bytesEnVuelo) / bytesTotal) * 100));

  // Lo que falta, estimado con la velocidad REAL de esta corrida (no con el
  // promedio de archivos: pesan distinto). Recién con algo subido; antes de eso
  // cualquier número es inventado.
  const velocidad = segundos > 0 && bytesListos > 0 ? bytesListos / segundos : 0;
  const restante = velocidad > 0 && bytesTotal > bytesListos ? (bytesTotal - bytesListos) / velocidad : null;

  // Seguir al primero que todavía no terminó: en 300 archivos, la fila viva
  // queda fuera de pantalla a los 5 segundos.
  const listaRef = useRef<HTMLUListElement>(null);
  const activoRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const cont = listaRef.current;
    const fila = activoRef.current;
    if (!cont || !fila || terminado) return;
    const arriba = fila.offsetTop - cont.offsetTop;
    if (arriba < cont.scrollTop || arriba > cont.scrollTop + cont.clientHeight - fila.clientHeight * 2) {
      cont.scrollTo({ top: Math.max(0, arriba - cont.clientHeight / 2), behavior: "smooth" });
    }
  }, [archivosListos, terminado]);

  const conError = archivos.filter((a) => estados[a.ruta] === "error").length;
  let activoMarcado = false;

  // Si nunca arrancó, una barra en 0% y 300 filas "en cola" sólo confunden: el
  // error de más abajo es toda la información que hay.
  if (abortado) {
    return (
      <p className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" />
        No se subió nada — el drive quedó como estaba.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cabecera: el número grande es lo que se mira de reojo desde lejos. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--text-primary)]">
            {terminado ? "Importación terminada" : paso || "Subiendo archivos…"}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-[var(--text-tertiary)]">
            {archivosListos} de {total} archivos · {bytesLegibles(bytesListos)} de {bytesLegibles(bytesTotal)}
          </p>
        </div>
        <p className="shrink-0 text-3xl font-extrabold leading-none tabular-nums text-[var(--text-primary)]">
          {pct}<span className="text-lg text-[var(--text-tertiary)]">%</span>
        </p>
      </div>

      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        {/* Franja tenue = lo que está viajando; la sólida = lo confirmado. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]/30 transition-[width] duration-[var(--dur-base)]"
          style={{ width: `${pctEnVuelo}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-[var(--accent)] to-[var(--accent-dark)] transition-[width] duration-[var(--dur-base)]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-tertiary)]">
        <span className="tabular-nums">{carpetasListas}/{carpetasTotal} carpetas</span>
        {segundos > 0 && <span className="tabular-nums">{tiempoLegible(segundos)} transcurridos</span>}
        {!terminado && restante !== null && <span className="tabular-nums">falta ~{tiempoLegible(restante)}</span>}
        {velocidad > 0 && !terminado && <span className="tabular-nums">{bytesLegibles(velocidad)}/s</span>}
        {conError > 0 && (
          <span className="font-bold text-[var(--data-error-500)]">{conError} con error</span>
        )}
      </div>

      {/* Archivo por archivo: la parte que la gente mira cuando algo tarda. */}
      <ul
        ref={listaRef}
        className="max-h-56 overflow-auto rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2 text-sm"
      >
        {archivos.map((a) => {
          const estado = estados[a.ruta] ?? "en-cola";
          const meta = META[estado];
          const esActivo = !activoMarcado && estado !== "listo" && estado !== "error";
          if (esActivo) activoMarcado = true;
          return (
            <li
              key={a.ruta}
              ref={esActivo ? activoRef : undefined}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                estado === "subiendo" || estado === "comprimiendo" ? "bg-[var(--surface-raised)]" : ""
              }`}
            >
              <Icono estado={estado} />
              <span className="flex min-w-0 flex-1 items-center gap-1" title={a.ruta}>
                {a.carpeta && (
                  // Sólo la carpeta que lo contiene: la ruta entera es la misma
                  // para todos y se comía el ancho del nombre, que es lo que
                  // uno busca cuando algo falla.
                  <span className="hidden max-w-[35%] shrink-0 items-center truncate text-xs text-[var(--text-tertiary)] sm:inline-flex">
                    {a.carpeta.split("/").pop()}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                )}
                <span className={`truncate ${estado === "listo" ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                  {a.nombre}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                {bytesLegibles(a.size)}
              </span>
              <span className={`w-24 shrink-0 text-right text-xs font-bold ${meta.clase}`}>
                {estado === "error" && motivos[a.ruta] ? motivos[a.ruta] : meta.texto}
              </span>
            </li>
          );
        })}
      </ul>

      {!terminado && (
        <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          No cierres esta ventana hasta que termine.
        </p>
      )}
    </div>
  );
}
