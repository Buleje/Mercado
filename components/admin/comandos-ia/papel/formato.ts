/**
 * Formatos y botones de TODA la pestaña Comandos IA (papel, precios, mensajes,
 * historial): un solo canon para que las cuatro secciones se vean iguales
 * (pasada final 2026-10-09: había 4 formatos de «$ de IA» y 4 juegos de botones
 * con 40 y 44 px de alto).
 */

import { formatCurrency } from "@/lib/format";
import { puedeGuardar, type DestinoPapel, type TipoPapel } from "@/lib/admin/comandos-ia/papel";

/**
 * ¿Mostrar el botón que guarda? Mientras el rol carga (null) se muestra: el que
 * decide es `requireAdmin` en el endpoint, y esconderlo daba un «tu rol no…» falso.
 */
export function permite(rol: string | null, destino: DestinoPapel): boolean {
  return rol === null || puedeGuardar(rol, destino);
}

/** «S/ 1,234.50» — el canon del panel. */
export const soles = (n: number): string => formatCurrency(n);

/**
 * Dólares de IA con punto decimal (como `soles`): «$0.25», «$0.012», «$0.0012».
 * Menos de una diezmilésima no se redondea a «$0.0000» (parecía gratis).
 */
export function usd(n: number): string {
  if (!(n > 0)) return "$0";
  if (n < 0.0001) return "menos de $0.0001";
  const decimales = n >= 0.01 ? 2 : n >= 0.001 ? 3 : 4;
  return `$${n.toLocaleString("es-PE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
}

/** Lo que gastó la IA, siempre a la vista antes del botón: «IA $0 · solo reglas» o «IA $0.0012». */
export function costoIa(n: number): string {
  return n > 0 ? `IA ${usd(n)}` : "IA $0 · solo reglas";
}

export const NOMBRE_TIPO: Record<TipoPapel, string> = {
  factura: "factura",
  yape: "pago por Yape/Plin",
  "lista-precios": "lista de precios",
  otro: "papel",
};

export const ACCION_DESTINO: Record<DestinoPapel, string> = {
  compra: "registrar la compra",
  cobro: "cobrar el fiado",
  precios: "comparar con tus precios",
  documento: "guardarlo en Documentos",
};

export const SIN_PERMISO: Record<DestinoPapel, string> = {
  compra: "Tu rol no registra compras: pásaselo a quien las carga.",
  cobro: "Tu rol no cobra fiados: pásaselo a caja.",
  precios: "Solo el administrador cambia precios.",
  documento: "Tu rol no guarda en Documentos.",
};

/** Primario sobre `--accent-dark`: con blanco da 4,8:1 en claro y oscuro (`bg-primary` daba 3,2:1). */
export const BOTON_PRIMARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-50";
export const BOTON_SECUNDARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-50";
export const CAMPO =
  "min-h-11 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
/**
 * Campo que falta (fila sin producto): borde ámbar. Sin `border-[var(--rule-base)]` y con un
 * `dark:bg-`: en oscuro globals.css pisa el borde de esa clase y el de todo select del panel
 * que no traiga `dark:bg-` (el ámbar quedaba gris).
 */
export const CAMPO_FALTA = `${CAMPO.replace("border-[var(--rule-base)]", "border-[var(--data-warning-500)]")} dark:bg-[var(--surface-sunken)]`;
