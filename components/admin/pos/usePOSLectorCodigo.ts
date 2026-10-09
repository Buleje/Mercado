import { useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { estaAgotado } from "@/lib/pos/stock-vendible";
import type { Product } from "@/components/admin/pos/pos-shared";

/**
 * Lector de código de barras (USB/Bluetooth) en el mostrador (08-10).
 *
 * El lector escribe como un teclado: dígitos + Enter. POSSearchBar ya manda cualquier tecla
 * al buscador, así que la lectura termina como «Enter en el buscador». Dos fallas del código
 * de antes:
 *  1. El código quedaba escrito en el buscador: la 2.ª lectura se pegaba detrás de la 1.ª
 *     («7751…0017751…001») y ya no encontraba nada — había que borrar a mano entre producto y producto.
 *  2. Un código que no está en el inventario no hacía nada: ni sonido ni aviso.
 */
export const LARGO_MINIMO_CODIGO = 6;

/** Sólo dígitos y largo de EAN-8 para arriba: lo que manda un lector, no un nombre. */
export function esCodigoDeBarras(q: string): boolean {
  return new RegExp(`^\\d{${LARGO_MINIMO_CODIGO},}$`).test(q.trim());
}

export type ResultadoEnter =
  | { tipo: "codigo"; codigo: string; producto: Product | null }
  | { tipo: "nombre"; producto: Product | null };

/** El primero vendible cuyo nombre o código contiene lo escrito (la búsqueda de siempre). */
function primerVendible(products: Product[], q: string): Product | null {
  return products.find((p) => !estaAgotado(p) && (p.name.toLowerCase().includes(q) || !!p.barcode?.includes(q))) ?? null;
}

/**
 * Qué hacer con el Enter del buscador: un código busca exacto; un nombre, el primero vendible.
 * Si un código no está exacto se prueba la búsqueda de siempre antes de avisar: un código a medias
 * escrito a mano («1009999») encontraba el producto antes de partir el POS y tiene que seguir haciéndolo.
 * Dos lecturas pegadas (26 dígitos) no las contiene ningún código, así que igual terminan en aviso.
 */
export function resolverEnter(products: Product[], texto: string): ResultadoEnter | null {
  const q = texto.trim().toLowerCase();
  if (!q) return null;
  if (esCodigoDeBarras(q)) {
    const exacto = products.find((p) => p.barcode === q);
    return { tipo: "codigo", codigo: q, producto: exacto ?? primerVendible(products, q) };
  }
  return { tipo: "nombre", producto: primerVendible(products, q) };
}

/** Vacía el buscador avisándole a React (POSSearchBar es controlado). */
function vaciarBuscador(input: HTMLInputElement) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

interface Opciones {
  products: Product[];
  addToCart: (product: Product) => void;
  playError: () => void;
}

export function usePOSLectorCodigo({ products, addToCart, playError }: Opciones) {
  const avisarNoEsta = useCallback((code: string) => {
    playError();
    const id = `pos-codigo-${code}`;
    const titulo = `El código ${code} no está en tu inventario`;
    toast.error(titulo, { id, description: "Búscalo por nombre o regístralo en Productos con ese código." });
    // /api/barcode-lookup consulta Open Food Facts (no tu inventario): sólo aporta el nombre, sin frenar el aviso.
    fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { found?: boolean; name?: string } | null) => {
        if (d?.found && d.name) toast.error(titulo, { id, description: `Es «${d.name}». Regístralo en Productos con ese código para venderlo.` });
      })
      .catch((err) => logger.warn("[pos] barcode-lookup sin respuesta", { error: String(err) }));
  }, [playError]);

  /** Cámara o foto: el código llega entero. */
  const handleBarcode = useCallback(async (code: string) => {
    const local = products.find((p) => p.barcode === code);
    if (local) { addToCart(local); return; }
    avisarNoEsta(code);
  }, [products, addToCart, avisarNoEsta]);

  /** Enter en el buscador (teclado o lector). */
  const handleAddTopResult = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>("[data-pos-search]");
    const r = resolverEnter(products, input?.value ?? "");
    if (!r) return;
    if (r.producto) addToCart(r.producto);
    if (r.tipo === "codigo") {
      if (!r.producto) avisarNoEsta(r.codigo);
      if (input) vaciarBuscador(input); // la próxima lectura empieza limpia
    }
  }, [products, addToCart, avisarNoEsta]);

  return { handleBarcode, handleAddTopResult };
}
