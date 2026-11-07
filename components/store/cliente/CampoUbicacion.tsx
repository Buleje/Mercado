"use client";

/**
 * CampoUbicacion — «Compartir mi ubicación» con el GPS del celular, en vivo.
 * Recibe el resultado de `useUbicacionEnVivo()` del padre (así el padre lee la
 * ubicación para el pedido y el campo sólo la muestra). Sin colores fijos.
 *
 *   const gps = useUbicacionEnVivo();
 *   <CampoUbicacion gps={gps} claseBoton="…" />
 *   // gps.ubicacion?.enlaceMapa → al mensaje y a la imagen
 */

import { Loader2, MapPin, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsoUbicacionEnVivo } from "./use-ubicacion-en-vivo";

export interface CampoUbicacionProps {
  gps: UsoUbicacionEnVivo;
  etiqueta?: string;
  /** Línea bajo el botón antes de compartir. */
  ayuda?: string;
  className?: string;
  claseEtiqueta?: string;
  /** Botón principal («Compartir mi ubicación»). */
  claseBoton?: string;
  /** Botones chicos («Actualizar», «Quitar», enlace al mapa). */
  claseSecundario?: string;
  claseAyuda?: string;
  claseError?: string;
}

const AVISOS: Record<"denegada" | "no-soportada" | "error", string> = {
  denegada: "No nos diste permiso. Actívalo en el candado de la barra de direcciones o escribe una referencia.",
  "no-soportada": "Este navegador no comparte la ubicación. Escribe una referencia de tu casa.",
  error: "No pudimos leer tu GPS. Prende la ubicación del celular y prueba de nuevo.",
};

export function CampoUbicacion({
  gps,
  etiqueta = "Tu ubicación",
  ayuda = "Así llegamos sin perdernos. Sólo la ve este negocio.",
  className,
  claseEtiqueta,
  claseBoton,
  claseSecundario,
  claseAyuda,
  claseError,
}: CampoUbicacionProps) {
  const { estado, ubicacion, siguiendo, pedir, detener } = gps;
  const buscando = estado === "pidiendo";
  const aviso = estado === "denegada" || estado === "no-soportada" || estado === "error" ? AVISOS[estado] : null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className={cn("text-sm font-semibold", claseEtiqueta)}>{etiqueta}</span>

      {ubicacion ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex min-h-12 items-center gap-2 text-base font-semibold">
            <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
            Ubicación lista
            <span className={cn("text-sm font-normal", claseAyuda)}>±{ubicacion.precision} m</span>
          </span>
          <a
            href={ubicacion.enlaceMapa}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("inline-flex h-12 items-center px-1 text-sm underline underline-offset-4", claseSecundario)}
          >
            Ver en el mapa
          </a>
          <button
            type="button"
            onClick={pedir}
            className={cn("inline-flex h-12 items-center gap-1.5 px-1 text-sm underline underline-offset-4", claseSecundario)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </button>
          {siguiendo && (
            <button
              type="button"
              onClick={detener}
              className={cn("inline-flex h-12 items-center px-1 text-sm underline underline-offset-4", claseSecundario)}
            >
              Dejar de seguir
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={pedir}
          disabled={buscando || estado === "no-soportada"}
          aria-busy={buscando}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border px-5 text-base font-semibold disabled:cursor-wait disabled:opacity-70",
            claseBoton,
          )}
        >
          {buscando ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <MapPin className="h-5 w-5" aria-hidden="true" />
          )}
          {buscando ? "Buscando tu ubicación…" : estado === "denegada" || estado === "error" ? "Probar de nuevo" : "Compartir mi ubicación"}
        </button>
      )}

      <p aria-live="polite" role={aviso ? "alert" : undefined} className={cn("text-sm", aviso ? (claseError ?? claseAyuda) : claseAyuda)}>
        {aviso ?? (ubicacion && siguiendo ? "Se actualiza sola mientras tengas esta página abierta." : ayuda)}
      </p>
    </div>
  );
}

export default CampoUbicacion;
