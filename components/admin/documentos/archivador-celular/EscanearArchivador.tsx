"use client";

import { useId, useState, type SyntheticEvent } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { textoDestino } from "@/lib/documentos/archivador-celular";
import CamaraSticker from "./CamaraSticker";
import { LecturasAnteriores, UltimaLectura } from "./LecturasDeLaVuelta";
import { useCamaraSticker } from "./use-camara-sticker";
import type { ModoArchivador } from "./use-modo-archivador";

const CAMPO =
  "h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Paso 2: el avance del archivador, la cámara, la última lectura y lo leído en esta vuelta. */
export default function EscanearArchivador({ m, onCambiar }: { m: ModoArchivador; onCambiar: () => void }) {
  const cam = useCamaraSticker(m.procesar);
  const campoId = useId();
  const [numero, setNumero] = useState("");
  const [verFaltan, setVerFaltan] = useState(false);
  const { destino, progreso, lecturas } = m;
  if (!destino || !progreso) return null;
  const pct = progreso.total ? Math.round((progreso.registrados / progreso.total) * 100) : 0;
  const faltan = progreso.faltan.length;

  const anotar = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!numero.trim()) return;
    m.procesar(numero, true);
    setNumero("");
  };

  return (
    <div className="space-y-3" data-qa="escanear-archivador">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--text-secondary)]">Guardando en</p>
          <p className="line-clamp-2 font-bold text-[var(--text-primary)]" data-qa="destino">{textoDestino(destino)}</p>
        </div>
        <button type="button" onClick={onCambiar} className={button({ variant: "secondary", className: "shrink-0" })}>
          Cambiar
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]" data-qa="progreso">
            {progreso.registrados} de {progreso.total} en su sitio
          </span>
          {faltan > 0 && (
            <button
              type="button"
              onClick={() => setVerFaltan((v) => !v)}
              aria-expanded={verFaltan}
              className={button({ variant: "ghost", className: "gap-1 px-2 text-sm" })}
              data-qa="ver-faltan"
            >
              Faltan {faltan} <ChevronDown className={cn("h-4 w-4 transition-transform", verFaltan && "rotate-180")} aria-hidden />
            </button>
          )}
        </div>
        <div
          className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance del archivador"
        >
          <div className="h-full rounded-full bg-[var(--data-success-500)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {verFaltan && faltan > 0 && (
          <ul className="mt-2 max-h-48 divide-y divide-[var(--rule-base)] overflow-y-auto rounded-xl border border-[var(--rule-base)]" data-qa="lista-faltan">
            {progreso.faltan.map((p) => (
              <li key={p.id} className="truncate px-3 py-2 text-sm text-[var(--text-primary)]">
                <span className="font-mono font-bold tabular-nums">{formatoCodigoDocumento(p.codigo)}</span> · {p.nombre}
              </li>
            ))}
          </ul>
        )}
      </div>

      <CamaraSticker cam={cam} />
      {lecturas[0] && <UltimaLectura l={lecturas[0]} m={m} />}

      <form onSubmit={anotar} className="flex gap-2">
        <label htmlFor={campoId} className="sr-only">Número del sticker</label>
        <input
          id={campoId}
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          placeholder="¿No lee? Escribe el número"
          className={CAMPO}
          data-qa="numero-sticker"
        />
        <button type="submit" className={button({ variant: "secondary", className: "shrink-0" })}>
          Anotar
        </button>
      </form>

      <LecturasAnteriores lecturas={lecturas.slice(1)} m={m} />
    </div>
  );
}
