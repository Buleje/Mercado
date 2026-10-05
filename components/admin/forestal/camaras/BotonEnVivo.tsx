"use client";

/**
 * «En vivo» de una cámara (2026-10-05).
 *
 * La DS-2CFSP4/4G sólo se ve en vivo por Hik-Connect (sin RTSP ni ONVIF, 4G
 * detrás de CGNAT): el botón abre ESA app y lo dice — el video se ve allá, no
 * en esta página. Si la cámara tiene conexión directa o puente desde la PC, el
 * panel tiene visor propio y el botón lleva a él en vez de a la app.
 *
 * Abre la app, no una cámara en particular: Hikvision no publica un enlace a
 * un dispositivo (ver fuentes en `hik-connect.ts`).
 */

import { Video } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BTN } from "./camaras-ui";
import { estadoDeConexion, type CamaraConConexion } from "./conexion-camara";
import { enlaceEnVivo } from "./hik-connect";
import { camposPuente } from "./puente-pc";
import { usePlataforma } from "./use-plataforma";

/** ¿El panel la puede mostrar él mismo (ISAPI/HLS o el puente de la PC)? */
export function tieneVisorPropio(c: CamaraConConexion): boolean {
  return estadoDeConexion(c).tipo === "conectada" || camposPuente(c).fuente === "puente_pc";
}

const FORMA = {
  boton: cn(BTN),
  icono: cn(BTN, "w-9 justify-center px-0"),
  /* Igual que «Borrar» de la tarjeta de la foto: al lado, mismo tamaño. */
  tarjeta:
    "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)]",
} as const;

interface Props {
  nombre: string;
  /** Con visor propio: lo que lo muestra. Sin esto, abre Hik-Connect. */
  onVisorPropio?: () => void;
  forma?: keyof typeof FORMA;
}

export default function BotonEnVivo({ nombre, onVisorPropio, forma = "boton" }: Props) {
  const plataforma = usePlataforma();
  const conTexto = forma === "boton";
  const contenido = (
    <>
      <Video className="h-4 w-4" aria-hidden />
      {conTexto && "En vivo"}
    </>
  );

  if (onVisorPropio) {
    return (
      <button
        type="button"
        onClick={onVisorPropio}
        title="Verla ahora con el visor del panel"
        aria-label={`Ver ${nombre} en vivo con el visor del panel`}
        className={FORMA[forma]}
      >
        {contenido}
      </button>
    );
  }

  const e = enlaceEnVivo(plataforma);
  return (
    <a
      href={e.href}
      target={e.nuevaPestana ? "_blank" : undefined}
      rel={e.nuevaPestana ? "noopener noreferrer" : undefined}
      title={e.titulo}
      aria-label={`Ver ${nombre} en vivo en Hik-Connect`}
      data-plataforma={plataforma}
      className={FORMA[forma]}
    >
      {contenido}
    </a>
  );
}
