"use client";

/**
 * Los avisos de Guardadas en UNA sola línea (Cubicador, 24-10): las guardadas
 * sin comprador del Directorio y las que no tienen GTF. Cada dato con su acción;
 * el de la GTF además filtra las tarjetas a esas cubicaciones (chip con X
 * para quitar el filtro, como el de comunidad).
 */
import { FileText, UserCheck, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";

export function AvisosDeGuardadas({ sinComprador, sinGuia, filtrandoSinGuia, onCompletarComprador, onCompletarGuia, onFiltrarSinGuia }: {
  sinComprador: number;
  sinGuia: { cantidad: number; pieTablar: number };
  filtrandoSinGuia: boolean;
  onCompletarComprador: () => void;
  onCompletarGuia: () => void;
  onFiltrarSinGuia: () => void;
}) {
  if (sinComprador === 0 && sinGuia.cantidad === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]" data-aviso="guardadas-avisos">
      {sinComprador > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1" data-aviso="guardadas-sin-comprador">
          <UserCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>{sinComprador} {sinComprador === 1 ? "guardada sin comprador" : "guardadas sin comprador"} del Directorio</span>
          <button type="button" onClick={onCompletarComprador} className={button({ variant: "secondary", className: "px-4" })} data-accion="completar-guardadas">
            Completar
          </button>
        </p>
      )}
      {sinGuia.cantidad > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-aviso="guardadas-sin-gtf">
          <FileText className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <button
            type="button"
            onClick={onFiltrarSinGuia}
            aria-pressed={filtrandoSinGuia}
            title={filtrandoSinGuia ? "Quitar el filtro" : "Ver sólo estas cubicaciones"}
            className={button({ variant: filtrandoSinGuia ? "accent" : "secondary", className: "gap-1.5 px-4" })}
            data-accion="filtrar-sin-gtf"
          >
            <span>{sinGuia.cantidad} sin GTF · <span className="font-mono tabular-nums">{fmtPt(sinGuia.pieTablar)} PT</span></span>
            {filtrandoSinGuia && <X className="h-4 w-4 shrink-0" aria-hidden />}
          </button>
          <InfoTip
            what="La GTF es lo que dice de dónde salió la madera ante SERFOR. Estas guardadas no tienen el N° escrito."
            affects="Tocar el aviso deja abajo sólo esas cubicaciones. Sin guía no se puede calcular cuánto rindió la comunidad ni cruzarla con lo que declara la guía."
            example="3 sin GTF · 21 983 PT: «Completar» te deja escribir el N° o traerlo de las guías emitidas."
          />
          <button type="button" onClick={onCompletarGuia} className={button({ variant: "secondary", className: "px-4" })} data-accion="completar-sin-gtf">
            Completar
          </button>
        </div>
      )}
    </div>
  );
}
