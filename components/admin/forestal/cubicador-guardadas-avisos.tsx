"use client";

/**
 * Los avisos de Guardadas en UNA sola línea (Cubicador, 24-10): las guardadas
 * sin comprador del Directorio y las que no tienen GTF. Cada dato con su acción;
 * el de la GTF además filtra las tarjetas a esas cubicaciones (chip con X
 * para quitar el filtro, como el de comunidad). Desde que hay viajes (28-10),
 * también «en patio»: las que todavía tienen madera sin salir.
 */
import { FileText, Truck, UserCheck, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";

export function AvisosDeGuardadas({ sinComprador, sinGuia, filtrandoSinGuia, onCompletarComprador, onCompletarGuia, onFiltrarSinGuia, enPatio, filtrandoEnPatio, onFiltrarEnPatio }: {
  sinComprador: number;
  sinGuia: { cantidad: number; pieTablar: number };
  filtrandoSinGuia: boolean;
  onCompletarComprador: () => void;
  onCompletarGuia: () => void;
  onFiltrarSinGuia: () => void;
  /** Las que tienen madera sin salir; sólo se ofrece si alguna ya tiene un viaje. */
  enPatio: { cantidad: number; conViajes: number; m3: number };
  filtrandoEnPatio: boolean;
  onFiltrarEnPatio: () => void;
}) {
  const conPatio = enPatio.conViajes > 0;
  if (sinComprador === 0 && sinGuia.cantidad === 0 && !conPatio) return null;
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
      {conPatio && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-aviso="guardadas-en-patio">
          <Truck className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <button
            type="button"
            onClick={onFiltrarEnPatio}
            aria-pressed={filtrandoEnPatio}
            title={filtrandoEnPatio ? "Quitar el filtro" : "Ver sólo las que tienen madera sin salir"}
            className={button({ variant: filtrandoEnPatio ? "accent" : "secondary", className: "gap-1.5 px-4" })}
            data-accion="filtrar-en-patio"
          >
            <span>{enPatio.cantidad} con saldo en patio · <span className="font-mono tabular-nums">{fmtM3(enPatio.m3)} m³</span></span>
            {filtrandoEnPatio && <X className="h-4 w-4 shrink-0" aria-hidden />}
          </button>
          <InfoTip
            what="Las cubicaciones que todavía tienen madera sin salir: las que no anotaron ningún viaje y las que se llevaron sólo una parte."
            affects="Tocarlo deja abajo sólo esas. Los viajes se anotan en «Salidas» de cada tarjeta o al guardar."
            example="4 con saldo en patio · 12,480 m³: lo que falta despachar de esos lotes."
          />
        </div>
      )}
    </div>
  );
}
