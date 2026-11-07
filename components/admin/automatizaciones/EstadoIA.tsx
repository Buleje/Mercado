"use client";

/**
 * EstadoIA — el estado de la IA en UNA línea, en la cabecera de
 * Automatizaciones. Si todo responde, un chip («La IA responde»); si algo
 * falla, el aviso de qué falla con su ⓘ. El detalle (cada modelo, las
 * herramientas cableadas) está en el panel de Indicadores.
 *
 * Va arriba a propósito: antes de preguntarse por qué el bot de WhatsApp no
 * entendió algo, conviene saber si el modelo existe.
 */

import { Loader2 } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { COLOR_SALUD, ICONO_SALUD } from "./IASaludPanel";
import type { Diagnostico, EstadoSalud } from "./tipos";

const LEE_UN_PAPEL = "/admin?tab=asistente-ia&vista=comandos&sub=papel";

const TINTE: Record<EstadoSalud | "aviso", string> = {
  ok: "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10",
  aviso: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10",
  roto: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10",
  "sin-verificar": "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
};

function Chip({
  estado,
  aviso,
  texto,
  corto,
  ayuda,
}: {
  estado: EstadoSalud;
  aviso?: boolean;
  texto: string;
  /** Lo que entra a 400 px; el texto entero sigue en el `title` y en el ⓘ. */
  corto?: string;
  ayuda: string;
}) {
  const Icono = ICONO_SALUD[aviso ? "roto" : estado];
  return (
    <span
      title={texto}
      className={cn(
        "inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-full border pl-3 pr-1 text-sm font-semibold text-[var(--text-primary)]",
        TINTE[aviso ? "aviso" : estado],
      )}
    >
      <Icono
        aria-hidden="true"
        className={cn("h-4 w-4 shrink-0", aviso ? "text-[var(--data-warning-ink)]" : COLOR_SALUD[estado])}
      />
      <span className={cn("min-w-0 truncate", corto && "max-sm:hidden")}>{texto}</span>
      {corto && <span className="min-w-0 truncate sm:hidden">{corto}</span>}
      <InfoTip title="Estado de la IA" what={ayuda} affects="El detalle de cada modelo está en Indicadores." side="bottom" />
    </span>
  );
}

export default function EstadoIA({
  dato,
  cargando,
  error,
}: {
  dato: Diagnostico | null;
  cargando: boolean;
  error: string | null;
}) {
  if (cargando) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Preguntando a la IA…
      </span>
    );
  }
  if (!dato) {
    return <Chip estado="roto" texto="No se pudo leer la IA" ayuda={error ?? "El servidor no contestó el estado de la IA."} />;
  }

  const caidos = dato.modelos.filter((m) => m.estado === "roto");
  if (dato.estado === "roto" || caidos.length > 0) {
    const texto = caidos.length > 0 ? `${caidos[0].para}: no responde${caidos.length > 1 ? ` (+${caidos.length - 1})` : ""}` : "Hay algo caído";
    return <Chip estado="roto" texto={texto} ayuda={dato.resumen} />;
  }
  if (dato.estado === "sin-verificar") {
    return <Chip estado="sin-verificar" texto="IA sin verificar" ayuda={dato.proveedor.error ?? dato.resumen} />;
  }
  if (!dato.vision.disponible) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Chip estado="ok" aviso texto="Leer fotos: sin modelo de visión" corto="Sin modelo de visión" ayuda={dato.vision.nota} />
        <EnlacePanel href={LEE_UN_PAPEL} className="shrink-0 text-sm" title="Comandos IA › Lee un papel: ahí se leen las fotos">
          Lee un papel
        </EnlacePanel>
      </span>
    );
  }
  return <Chip estado="ok" texto="La IA responde" ayuda={dato.resumen} />;
}
