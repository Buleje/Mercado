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

/** Lo que identifica a un producto por código: el de barras o el SKU. */
interface ConCodigo {
  barcode?: string | null;
  sku?: string | null;
}

/**
 * El producto cuyo código de barras o SKU es EXACTAMENTE lo leído, sin importar mayúsculas (10-10).
 * Antes el buscador pasaba a minúsculas sólo lo leído y lo comparaba con el código tal cual estaba
 * guardado: un Code 128 «ABC123» no se encontraba nunca. Lo usan el Enter, la cámara y el modo Express.
 */
export function buscarPorCodigo<T>(products: readonly T[], codigo: string): T | null {
  const q = codigo.trim().toLowerCase();
  if (!q) return null;
  // El Product del POS viene de un tipo con índice (`[key: string]: any`): `barcode`/`sku` se leen así.
  const igual = (c: unknown) => typeof c === "string" && c.trim().toLowerCase() === q;
  return products.find((p) => igual((p as ConCodigo).barcode)) ?? products.find((p) => igual((p as ConCodigo).sku)) ?? null;
}

export type ResultadoEnter =
  | { tipo: "codigo"; codigo: string; producto: Product | null }
  | { tipo: "nombre"; producto: Product | null };

/** El primero vendible cuyo nombre o código contiene lo escrito (la búsqueda de siempre).
 *  El código va tal cual, sin pasar a minúsculas: con minúsculas, leer «MU013» agregaba el
 *  «MU013-2» (paquete de 2) si el MU013 no estaba en la lista (revisión 10-10). */
function primerVendible(products: Product[], q: string): Product | null {
  return products.find((p) => !estaAgotado(p) && (p.name.toLowerCase().includes(q) || !!p.barcode?.includes(q))) ?? null;
}

/**
 * Qué hacer con el Enter del buscador.
 *  · Un código del inventario (de barras o SKU, con o sin mayúsculas) entra exacto, sea cual sea su largo.
 *  · Un número de 6 dígitos o más que no está exacto prueba la búsqueda de siempre antes de avisar: un
 *    código a medias escrito a mano («1009999») encontraba el producto antes de partir el POS y tiene que
 *    seguir haciéndolo. Dos lecturas pegadas (26 dígitos) no las contiene ningún código: terminan en aviso.
 *  · Un número CORTO (menos de 6 dígitos) sólo vale exacto (10-10): «123» buscado como «contiene» agregaba
 *    el primer producto con «123» en cualquier parte del código o del nombre — OTRO producto.
 *  · Un nombre agrega el primero vendible que lo contiene.
 */
export function resolverEnter(products: Product[], texto: string): ResultadoEnter | null {
  const leido = texto.trim();
  const q = leido.toLowerCase();
  if (!q) return null;
  const exacto = buscarPorCodigo(products, leido);
  const soloDigitos = /^\d+$/.test(q);
  if (soloDigitos) {
    const parcial = esCodigoDeBarras(q) ? primerVendible(products, q) : null;
    return { tipo: "codigo", codigo: leido, producto: exacto ?? parcial };
  }
  if (exacto) return { tipo: "codigo", codigo: leido, producto: exacto };
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
    const local = buscarPorCodigo(products, code);
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
