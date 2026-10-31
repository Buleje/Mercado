/**
 * Lo que dice la canasta al cargar una plantilla de compra (C61): «reutilizar
 * no copia proveedor o precio vencido sin aviso». Puro, para probarlo sin DOM.
 */
import { diaCorto, diasEntre } from "@/lib/compras/ciclo-oc";

/** A partir de cuántos días un costo guardado en la plantilla se nombra como viejo. */
export const DIAS_COSTO_VIEJO = 30;

export type CargaDePlantilla = {
  nombre: string;
  /** Productos de la plantilla que ya no están en el catálogo. */
  faltan: number;
  /** Líneas cuyo costo salió de la plantilla (nunca se compraron y el producto no tiene costo). */
  costosDeLaPlantilla: number;
  /** Líneas que quedaron sin costo. */
  sinCosto: number;
  /** YYYY-MM-DD de la última vez que se guardó la plantilla. */
  guardadaEl: string | null;
  hoy: string;
  /** Proveedor que estaba elegido antes de cargarla. */
  proveedorAntes: string | null;
  /** La plantilla trae proveedor. */
  traeProveedor: boolean;
  /** Ese proveedor sigue en tu lista: su nombre; si no, null. */
  proveedorDeLaPlantilla: string | null;
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function avisoDePlantilla(c: CargaDePlantilla): { texto: string; revisar: boolean } {
  const partes = [`Plantilla «${c.nombre}» cargada`];
  let revisar = false;

  if (c.faltan > 0) partes.push(`${c.faltan} ${plural(c.faltan, "producto ya no está", "productos ya no están")} en tu catálogo`);

  if (c.traeProveedor && !c.proveedorDeLaPlantilla) {
    partes.push("su proveedor ya no está en tu lista: elige uno arriba");
    revisar = true;
  } else if (c.proveedorDeLaPlantilla && c.proveedorAntes && c.proveedorAntes !== c.proveedorDeLaPlantilla) {
    partes.push(`el proveedor pasó a ${c.proveedorDeLaPlantilla} (antes ${c.proveedorAntes})`);
    revisar = true;
  } else if (c.proveedorDeLaPlantilla && !c.proveedorAntes) {
    partes.push(`proveedor: ${c.proveedorDeLaPlantilla}`);
  }

  if (c.costosDeLaPlantilla > 0) {
    const n = c.costosDeLaPlantilla;
    const dias = c.guardadaEl ? diasEntre(c.guardadaEl, c.hoy) : null;
    const cuando = c.guardadaEl ? ` del ${diaCorto(c.guardadaEl)}${dias != null && dias > DIAS_COSTO_VIEJO ? ` (hace ${dias} días)` : ""}` : "";
    partes.push(`${n} ${plural(n, "costo sale", "costos salen")} de la plantilla${cuando}: ${plural(n, "revísalo", "revísalos")}`);
    revisar = true;
  }

  if (c.sinCosto > 0) {
    partes.push(`${c.sinCosto} sin costo: ${plural(c.sinCosto, "anótalo", "anótalos")}`);
    revisar = true;
  }

  return { texto: partes.join(" · "), revisar };
}
