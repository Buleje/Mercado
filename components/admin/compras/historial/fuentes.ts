/**
 * fuentes — qué es cada movimiento del historial y dónde vive de verdad.
 *
 * El historial junta plata de cinco lugares distintos, y cada uno tiene su
 * propio módulo. Antes esta tabla vivía a medias en la tabla (icono y tono) y a
 * medias en el modal, que ni siquiera la usaba: preguntaba `source === "expense"
 * ? "Gasto operativo" : "Compra a proveedor"` y por eso la ficha de un adelanto
 * al personal decía, en grande, «Compra a proveedor».
 *
 * Va aparte de `shared.ts` porque trae iconos: `shared.ts` es puro y lo importan
 * el hook y los tests, que no deberían arrastrar `lucide` para formatear un CSV.
 */

import {
  Banknote, HandCoins, Receipt, Route, Truck, type LucideIcon,
} from "@buleje/design-system/icons";
import type { FuenteHistorial } from "./shared";

export type MetaFuente = {
  /** Corto, para la columna Origen. */
  label: string;
  icon: LucideIcon;
  tone: string;
  /**
   * Cómo se llama quien está del otro lado. Un adelanto no tiene «proveedor»:
   * tiene beneficiario, que es la persona que se llevó la plata.
   */
  contraparte: string;
  /** El módulo donde el movimiento se puede tocar, no sólo mirar. */
  destino: { href: string; label: string } | null;
};

export const SOURCE_META: Record<FuenteHistorial, MetaFuente> = {
  expense: {
    label: "Gasto operativo",
    icon: Receipt,
    tone: "var(--data-warning-ink)",
    contraparte: "Proveedor",
    destino: { href: "?tab=compras&vista=punto-compra", label: "Ver en Punto de Compra" },
  },
  purchase: {
    label: "Compra proveedor",
    icon: Truck,
    tone: "var(--data-info-ink)",
    contraparte: "Proveedor",
    destino: { href: "?tab=compras&vista=ordenes-compra", label: "Ver en Órdenes" },
  },
  flete: {
    // Ícono propio: con el mismo camión que las compras, dos orígenes que se
    // pagan distinto se leían como el mismo renglón.
    label: "Flete",
    icon: Route,
    tone: "var(--data-info-ink)",
    contraparte: "Transportista",
    destino: { href: "?tab=ctp-libro-operaciones&vista=fletes", label: "Ver en Fletes" },
  },
  adelanto: {
    label: "Adelanto",
    icon: HandCoins,
    tone: "var(--text-secondary)",
    contraparte: "Beneficiario",
    destino: { href: "?tab=plata&vista=adelantos", label: "Ver en Adelantos" },
  },
  caja: {
    label: "Retiro de caja",
    icon: Banknote,
    tone: "var(--text-secondary)",
    contraparte: "Registrado por",
    destino: { href: "?tab=ventas-caja&vista=caja-registradora", label: "Ver en Caja" },
  },
};
