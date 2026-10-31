"use client";

import { Package, ScanBarcode, Search } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { CompraCatalogo } from "./use-compra-catalogo";
import type { CompraCarrito } from "./use-compra-carrito";

interface Props {
  catalogo: CompraCatalogo;
  carrito: CompraCarrito;
  processing: boolean;
  showScanner: boolean;
  onAlternarEscaner: () => void;
  onNuevoProveedor: () => void;
}

/** Valor del desplegable de proveedores que abre «Nuevo proveedor» en vez de elegir uno. */
const NUEVO_PROVEEDOR = "__nuevo__";

/** Control de la fila a 48 px y 14 px (el de Productos y stock). */
const CONTROL = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50";

/** Chip de filtro: botón secundario del DS (48 px) a 14 px; encendido toma el tono de acento. */
const chip = (activo: boolean) =>
  button({
    variant: "secondary",
    className: cn(
      "shrink-0 gap-1.5 rounded-xl px-3 text-sm",
      activo ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)]",
    ),
  });

/**
 * La fila de filtros de Comprar, pegada a los productos (10-10): proveedor,
 * buscar (con el lector de códigos adentro), categoría, «A reponer» (con su
 * cuenta) y «Mi inventario»; el orden va al «⋯» de la cabecera. Antes eran 9
 * controles de 28-36 px y 12 px, la
 * categoría era otra fila de pastillas y el interruptor del inventario, una
 * tarjeta propia. «Nuevo proveedor» sigue a un clic: es la última opción del
 * desplegable de proveedores (y está en el «⋯» de la cabecera).
 */
export default function CompraBarraControles({ catalogo, carrito, processing, showScanner, onAlternarEscaner, onNuevoProveedor }: Props) {
  const {
    needsReorderCount, setSoloReponer, setPage, soloReponer, suppliers, search, setSearch,
    showInventario, setShowInventario, categories, categoryCounts, category, setCategory,
  } = catalogo;
  const { selectedSupplier, setSelectedSupplier } = carrito;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <select
        value={selectedSupplier?.id ?? ""}
        onChange={(e) => {
          if (e.target.value === NUEVO_PROVEEDOR) {
            onNuevoProveedor();
            return;
          }
          setSelectedSupplier(suppliers.find((s) => s.id === e.target.value) ?? null);
        }}
        disabled={processing}
        aria-label="Proveedor de la compra"
        className={cn(CONTROL, "min-w-0 basis-full sm:max-w-48 sm:basis-auto sm:shrink-0")}
      >
        <option value="">Todos los proveedores</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NUEVO_PROVEEDOR}>+ Nuevo proveedor…</option>
      </select>

      {/* En celular el buscador va en su propia fila; desde sm pide 14 rem y crece. */}
      <div className="relative h-12 min-w-0 grow basis-full sm:basis-48">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // Buscar algo con el inventario apagado no mostraba nada: se enciende.
            if (e.target.value && !showInventario) setShowInventario(true);
          }}
          placeholder="Buscar producto…"
          aria-label="Buscar producto por nombre o código"
          className={cn(CONTROL, "w-full pl-10 pr-12 placeholder:text-[var(--text-tertiary)]")}
        />
        <button
          type="button"
          onClick={onAlternarEscaner}
          aria-pressed={showScanner}
          aria-label="Buscar por código de barras (F2)"
          title="Buscar por código de barras (F2)"
          className={cn(
            "absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            showScanner ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]",
          )}
        >
          <ScanBarcode className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {showInventario && categories.length > 2 && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Categoría"
          className={cn(CONTROL, "min-w-0 grow sm:max-w-48 sm:grow-0 sm:shrink-0")}
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat === "Todos" ? "Todas las categorías" : cat} ({categoryCounts[cat] ?? 0})
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={() => {
          const encender = !soloReponer;
          setSoloReponer(encender);
          if (encender) setShowInventario(true);
          setPage(1);
        }}
        aria-pressed={soloReponer}
        title="Productos en o bajo el stock mínimo que fijaste"
        className={chip(soloReponer)}
      >
        {needsReorderCount > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--data-error-500)]" aria-hidden />}
        A reponer <span className="tabular-nums font-bold">{needsReorderCount}</span>
      </button>

      {/* El interruptor del inventario era una tarjeta propia de 50 px encima de los productos. */}
      <button
        type="button"
        role="switch"
        aria-checked={showInventario}
        onClick={() => setShowInventario(!showInventario)}
        title={showInventario ? "Apágalo para dejar sólo la canasta y la factura" : "Muestra los productos de tu inventario para armar la compra"}
        className={chip(showInventario)}
      >
        <Package className="h-4 w-4" aria-hidden />
        Mi inventario
        <span
          aria-hidden
          className={cn("relative ml-1 inline-block h-5 w-9 rounded-full transition-colors", showInventario ? "bg-primary" : "bg-[var(--rule-base)]")}
        >
          <span
            className={cn(
              "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--surface-raised)] transition-transform",
              showInventario ? "translate-x-4" : "translate-x-0",
            )}
          />
        </span>
      </button>

    </div>
  );
}
