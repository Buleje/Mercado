import { useEffect } from "react";
import { ANCHO_ESENCIAL, RESTO_TARJETAS } from "./use-ancho-panel-esencial";

/**
 * Marca de `<html>` que la barra izquierda del panel escucha (`useCamarasAcopladas`)
 * para encogerse a íconos mientras dure. Es temporal: NO toca «Compactar» guardado.
 */
export const MARCA_BARRA_COMPACTA = "data-barra-compacta-temporal";
/** Lo que gana el panel al pasar la barra de 276 px a 60 px. */
const GANA_AL_COMPACTAR = 216;

function barraYaCompacta(): boolean {
  try { return localStorage.getItem("admin-sidebar-compact") === "true"; } catch { return false; }
}

/**
 * Brandon 24-10: «Dos columnas también a 1280». Con «Más ancho» pedido y la barra
 * izquierda abierta, si el panel no llega a su ancho amplio, la barra se encoge sola
 * a íconos mientras el panel esté ancho; al angostarlo o cerrarlo, vuelve.
 * `libre` = ancho libre de la sección (ya con la barra como esté ahora).
 */
export function useBarraCompactaConPanelAncho(pedidoAmplio: boolean, panelVisible: boolean, libre: number): void {
  const yaCompacta = barraYaCompacta();
  const marcada = typeof document !== "undefined" && document.documentElement.hasAttribute(MARCA_BARRA_COMPACTA);
  // Si la marca ya encogió la barra, el libre que llega incluye esa ganancia: se descuenta.
  const libreAbierta = marcada && !yaCompacta ? libre - GANA_AL_COMPACTAR : libre;
  const noAlcanza = libreAbierta - RESTO_TARJETAS < ANCHO_ESENCIAL.amplio;
  const pedir = pedidoAmplio && panelVisible && !yaCompacta && libre > 0 && noAlcanza;
  useEffect(() => {
    const el = document.documentElement;
    if (pedir) el.setAttribute(MARCA_BARRA_COMPACTA, "");
    else el.removeAttribute(MARCA_BARRA_COMPACTA);
  }, [pedir]);
  useEffect(() => () => document.documentElement.removeAttribute(MARCA_BARRA_COMPACTA), []);
}
