"use client";

/**
 * Lo que se pinta ENCIMA del video de la nube (ADR-471) según su estado —
 * pidiendo, despertando la cámara, error con «Reintentar», cortado por
 * inactividad— y el chip de estado de cada cuadro del mosaico. Lo comparten el
 * visor de una cámara y el mosaico, para que digan lo mismo.
 */

import { AlertTriangle, Battery, Loader2, Pause, Play, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BTN, CHIP_BASE, CHIP_TONO } from "./camaras-ui";
import { MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import type { EstadoVisor, VisorNubeEstado } from "./use-visor-nube";

const CAPA =
  "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--surface-canvas)]/90 px-4 text-center text-sm text-[var(--text-primary)]";

interface Props {
  v: VisorNubeEstado;
  /** ¿Hay código de verificación cargado? Sin él, una cámara cifrada no se ve. */
  conCodigo: boolean;
  /** En el mosaico el cuadro es chico: sin la línea de ayuda larga. */
  compacto?: boolean;
}

export default function VisorNubeCapas({ v, conCodigo, compacto = false }: Props) {
  if (v.estado === "pidiendo" || v.estado === "cargando") {
    return (
      <div className={CAPA} role="status">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-ink)]" aria-hidden />
        {v.estado === "pidiendo"
          ? "Pidiendo el video a Hikvision…"
          : compacto
            ? "Despertando la cámara…"
            : "Despertando la cámara… (puede tardar 10-20 s por 4G)"}
      </div>
    );
  }
  if (v.estado === "error") {
    return (
      <div className={CAPA} role="alert">
        <AlertTriangle className="h-6 w-6 text-[var(--data-error-ink)]" aria-hidden />
        <span className={cn("max-w-sm", compacto && "line-clamp-3")}>{v.error}</span>
        {!conCodigo && !compacto && (
          <span className="max-w-sm text-xs text-[var(--text-tertiary)]">
            Si la cámara tiene el video cifrado, carga su código de verificación en Cámaras →
            Hik-Connect.
          </span>
        )}
        <button type="button" onClick={v.reintentar} className={BTN}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </div>
    );
  }
  if (v.estado === "cortado") {
    return (
      <div className={CAPA} role="status">
        <Battery className="h-6 w-6 text-[var(--data-warning-ink)]" aria-hidden />
        Se cortó tras {MINUTOS_SIN_TOCAR} min sin tocar, para cuidar la batería.
        <button type="button" onClick={v.reintentar} className={BTN}>
          <Play className="h-4 w-4" aria-hidden /> Seguir viendo
        </button>
      </div>
    );
  }
  if (v.estado === "detenido") {
    return (
      <div className={CAPA} role="status">
        <Pause className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
        Pausado
      </div>
    );
  }
  return null;
}

const CHIP: Record<EstadoVisor, { texto: string; tono: keyof typeof CHIP_TONO }> = {
  pidiendo: { texto: "Cargando", tono: "neutro" },
  cargando: { texto: "Cargando", tono: "neutro" },
  viendo: { texto: "En vivo", tono: "ok" },
  error: { texto: "Error", tono: "alerta" },
  cortado: { texto: "Pausado", tono: "neutro" },
  detenido: { texto: "Pausado", tono: "neutro" },
};

/** «Cargando / En vivo / Error / Pausado» al lado del nombre de la cámara. */
export function ChipEstadoVivo({ estado }: { estado: EstadoVisor }) {
  const c = CHIP[estado];
  return (
    <span className={cn(CHIP_BASE, CHIP_TONO[c.tono], "shrink-0")} data-estado-vivo={estado}>
      {estado === "viendo" ? (
        <span className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" aria-hidden />
      ) : estado === "pidiendo" || estado === "cargando" ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : null}
      {c.texto}
    </span>
  );
}
