import "server-only";
import { cache } from "react";
import { ENCHUFE_PAGINA, type PiezaPagina } from "@/extensiones/_contrato";
import { leerPlantilla } from "@/extensiones/pagina-tienda/config";
import { PLANTILLA_TIENDA } from "@/extensiones/registro.servidor";
import { SettingsDB } from "@/lib/db/settings.db";
import { resolverPiezas, type PiezaResuelta } from "./resolver";
import { reportarFalloPieza } from "./tope";

/**
 * ADR-511 · QUÉ página ve la tienda de un negocio. Un solo punto: lo usan la
 * portada (`/t/<negocio>` + `EnchufePagina`) y, por `paginaPropiaDeLaTienda`,
 * el marco del layout, el catálogo, la ficha y los metadatos.
 *
 * El orden:
 * 1. **La página propia prendida** del negocio (ADR-458, tabla `TenantPieza`):
 *    es de UN negocio (Musa = `pagina-musa`, main = Buleje Beauty).
 * 2. **La plantilla `pagina-tienda`** (nacida de Musa), salvo que el dueño
 *    eligió «Clásico» (`storeTheme.tiendaPlantilla.formato`). NO se asigna
 *    negocio por negocio: es el defecto de todos los que no tienen propia.
 * 3. `null` = **la página general de siempre** — también si el negocio tiene
 *    prendida una pieza de `tienda.portada`, que sólo la general dibuja.
 *
 * El respaldo de la general sigue en pie: `?sinPiezas=1` lo resuelve cada
 * ruta ANTES de llamar acá; si el código de lo elegido tira o pasa el tope de
 * 2 s, quien lo carga (`EnchufePagina`, `paginaPropiaDeLaTienda`) vuelve a la
 * general. Acá no se carga código: sólo se elige.
 *
 * Nunca tira: si no se pueden leer los ajustes, `null` (la general) — sin
 * saber si el dueño eligió «Clásico», no se le cambia la tienda.
 */
export type OrigenPagina = "propia" | "plantilla";

export interface PaginaElegida {
  piezaId: string;
  origen: OrigenPagina;
  /** Ya pasaron el Zod `.strict()` del manifiesto. */
  opciones: Record<string, unknown>;
  /** Carga perezosa (`import()`): el tope y el try/catch los pone quien la llama. */
  cargar: () => Promise<PiezaPagina>;
}

/** La página propia PRENDIDA del negocio (paso 1), o `undefined`. Nunca tira. */
const propiaPrendida = cache(async (tenantId: string): Promise<PiezaResuelta | undefined> =>
  (await resolverPiezas(tenantId, ENCHUFE_PAGINA)).find((p) => p.entrada.pagina),
);

/**
 * Para el editor del panel (Apariencia › Formato de tu tienda): si el negocio
 * tiene página propia prendida, el formato elegido no se ve hasta apagarla.
 * Misma regla que `elegirPaginaDeLaTienda`, sin cargar código de la pieza.
 */
export async function paginaPropiaDelNegocio(tenantId: string): Promise<{ id: string; nombre: string } | null> {
  const propia = await propiaPrendida(tenantId);
  return propia ? { id: propia.piezaId, nombre: propia.entrada.manifiesto.nombre } : null;
}

export const elegirPaginaDeLaTienda = cache(async (tenantId: string): Promise<PaginaElegida | null> => {
  const propia = await propiaPrendida(tenantId);
  if (propia?.entrada.pagina) {
    return { piezaId: propia.piezaId, origen: "propia", opciones: propia.opciones, cargar: propia.entrada.pagina };
  }
  return plantillaDelNegocio(tenantId);
});

async function plantillaDelNegocio(tenantId: string): Promise<PaginaElegida | null> {
  // `null` = plantilla sin registrar (p. ej. mientras se construye): todos a la general.
  const plantilla = PLANTILLA_TIENDA;
  const cargar = plantilla?.pagina;
  if (!plantilla || !cargar) return null;
  const id = plantilla.manifiesto.id;

  let storeTheme: unknown;
  try {
    storeTheme = (await SettingsDB.get(tenantId))?.storeTheme;
  } catch (err) {
    reportarFalloPieza(err, { piezaId: id, enchufe: ENCHUFE_PAGINA, tenantId, etapa: "plantilla-ajustes" });
    return null;
  }
  if (leerPlantilla(storeTheme).formato === "clasico") return null;
  // Las piezas de `tienda.portada` (madera disponible, por bloques…) sólo las
  // dibuja la página general: si el negocio tiene una prendida, la plantilla
  // la escondería sin aviso. Se queda con la general hasta que la apague.
  if ((await resolverPiezas(tenantId, "tienda.portada")).some((p) => p.entrada.portada)) return null;

  const op = plantilla.manifiesto.opciones.safeParse({});
  if (!op.success || op.data === null || typeof op.data !== "object") return null;
  return { piezaId: id, origen: "plantilla", opciones: op.data as Record<string, unknown>, cargar };
}
