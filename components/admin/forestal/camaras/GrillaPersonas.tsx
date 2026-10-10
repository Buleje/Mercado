"use client";

/**
 * Las fotos de personas del día en miniatura, de la más nueva a la más vieja,
 * con el filtro por cámara pegado arriba. Muestra de a 24: un día movido con
 * «sigue en cuadro» cada minuto son cientos.
 */

import { useState } from "react";
import { Camera, ImageOff, Users, X } from "@buleje/design-system/icons";
import { MOTIVO_FOTO_PERSONA_LABEL, type MotivoFotoPersona } from "@/lib/camaras/personas";
import type { FotoPersonaGaleria } from "@/lib/camaras/personas-galeria";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { cn } from "@/lib/utils";
import { BTN, CHIP_BASE, CHIP_TONO, type Tono } from "./camaras-ui";

const DE_A = 24;

const TONO_MOTIVO: Record<MotivoFotoPersona, Tono> = {
  aparecio: "info",
  mas_gente: "aviso",
  sigue: "neutro",
};

export interface ChipCamara {
  clave: string;
  nombre: string;
  fotos: number;
}

interface Props {
  fotos: FotoPersonaGaleria[];
  /** Cámaras para el filtro (con sus fotos del día). Con una sola no se muestra. */
  camaras: ChipCamara[];
  totalDelDia: number;
  camara: string | null;
  onCamara: (clave: string | null) => void;
  hora: number | null;
  onQuitarHora: () => void;
  onAbrir: (indice: number) => void;
}

const CHIP_FILTRO =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

export default function GrillaPersonas({
  fotos,
  camaras,
  totalDelDia,
  camara,
  onCamara,
  hora,
  onQuitarHora,
  onAbrir,
}: Props) {
  const [cuantas, setCuantas] = useState(DE_A);
  const visibles = fotos.slice(0, cuantas);
  const conNombre = !camara && camaras.length > 1;
  const chip = (activo: boolean) =>
    cn(
      CHIP_FILTRO,
      activo
        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
    );

  return (
    <div className="space-y-3">
      {(camaras.length > 1 || hora !== null) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar las fotos">
          {camaras.length > 1 && (
            <>
              <button type="button" aria-pressed={!camara} onClick={() => onCamara(null)} className={chip(!camara)}>
                Todas <span className="tabular-nums text-[var(--text-tertiary)]">{totalDelDia}</span>
              </button>
              {camaras.map((c) => (
                <button
                  key={c.clave}
                  type="button"
                  aria-pressed={camara === c.clave}
                  onClick={() => onCamara(c.clave)}
                  className={chip(camara === c.clave)}
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden />
                  <span className="max-w-[12rem] truncate">{c.nombre}</span>
                  <span className="tabular-nums text-[var(--text-tertiary)]">{c.fotos}</span>
                </button>
              ))}
            </>
          )}
          {hora !== null && (
            <button type="button" onClick={onQuitarHora} className={chip(true)} aria-label={`Quitar el filtro de las ${hora} h`}>
              Sólo {String(hora).padStart(2, "0")} h <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      {fotos.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
          Esa cámara no tomó fotos de personas ese día.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {visibles.map((f, i) => (
            <li key={f.id}>
              <Miniatura foto={f} conNombre={conNombre} onAbrir={() => onAbrir(i)} />
            </li>
          ))}
        </ul>
      )}

      {fotos.length > cuantas && (
        <button type="button" onClick={() => setCuantas((n) => n + DE_A)} className={cn(BTN, "w-full justify-center")}>
          Ver {Math.min(DE_A, fotos.length - cuantas)} más (quedan {fotos.length - cuantas})
        </button>
      )}
    </div>
  );
}

function Miniatura({ foto: f, conNombre, onAbrir }: { foto: FotoPersonaGaleria; conNombre: boolean; onAbrir: () => void }) {
  const [rota, setRota] = useState(false);
  const motivo = f.motivo ? MOTIVO_FOTO_PERSONA_LABEL[f.motivo] : null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group block w-full overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-left transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      aria-label={`${f.hora} · ${motivo ?? "Foto de personas"} · ${f.camaraNombre}. Ver en grande`}
    >
      <div className="relative aspect-video bg-[var(--surface-sunken)]">
        {rota ? (
          <span className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
            <ImageOff className="h-6 w-6" aria-hidden />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura privada del Drive, servida por nuestra API
          <img
            src={urlMiniatura(f.id)}
            alt=""
            loading="lazy"
            onError={() => setRota(true)}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        )}
      </div>
      <div className="space-y-1 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{f.hora.slice(0, 5)}</span>
          {f.personas !== null && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-[var(--text-secondary)]" title={`${f.personas} ${f.personas === 1 ? "persona" : "personas"}`}>
              <Users className="h-3.5 w-3.5" aria-hidden /> {f.personas}
            </span>
          )}
        </div>
        {motivo && f.motivo && <span className={cn(CHIP_BASE, CHIP_TONO[TONO_MOTIVO[f.motivo]])}>{motivo}</span>}
        {conNombre && <p className="truncate text-xs text-[var(--text-tertiary)]">{f.camaraNombre}</p>}
      </div>
    </button>
  );
}
