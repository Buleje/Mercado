"use client";

/**
 * <RecargarSinPiezas> — el respaldo LIVIANO de una pieza que reemplaza en
 * `/t/<negocio>` (ADR-458): la página propia o el cuerpo de la portada.
 *
 * Antes el respaldo era la versión normal ya armada en el servidor: viajaba en
 * CADA visita aunque la pieza anduviera bien (medido 01-10: 203 KB contra
 * 161 KB en /t/main). Ahora, si la pieza falla al dibujarse, el navegador
 * recarga la misma URL con `?sinPiezas=1` y la ruta entrega la general pura.
 *
 * Si la URL ya trae `sinPiezas=1` no recarga (nunca un bucle): no muestra nada.
 */
import { useEffect } from "react";
import { PARAMETRO_SIN_PIEZAS } from "@/extensiones/_contrato";

/** La URL a la que recargar, o `null` si ya es la general pura. */
export function urlSinPiezas(href: string): string | null {
  const url = new URL(href);
  if (url.searchParams.get(PARAMETRO_SIN_PIEZAS) === "1") return null;
  url.searchParams.set(PARAMETRO_SIN_PIEZAS, "1");
  return url.toString();
}

export function RecargarSinPiezas() {
  useEffect(() => {
    const destino = urlSinPiezas(window.location.href);
    if (destino) window.location.replace(destino);
  }, []);
  return null;
}
