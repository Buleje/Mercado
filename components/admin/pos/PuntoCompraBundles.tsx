"use client";

/**
 * Pestaña «Paquetes» de la canasta de Comprar (C61): los combos que vendes,
 * para reponer todos sus productos de una vez. Los nombres salen de tu
 * catálogo y el costo de cada línea es el de tu última compra (nunca el del
 * paquete); lo que ya no está en el catálogo se avisa antes de agregar.
 * Sin paquetes, el paso útil es la plantilla de compra de abajo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Package, Plus, RefreshCw } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { PurchaseProduct } from "@/lib/types/purchases";

interface BundleItemData {
  productId: number;
  name?: string;
  quantity: number;
}

interface BundleData {
  id: string;
  name: string;
  description?: string;
  price: number;
  active?: boolean;
  items: BundleItemData[];
}

export type LineaDePaquete = { product: PurchaseProduct; quantity: number };

interface Props {
  products: PurchaseProduct[];
  /** Agrega lo que sí está en el catálogo (el costo lo pone la canasta). */
  onAddBundle: (lineas: LineaDePaquete[]) => void;
  /** Vuelve a la canasta, donde están las plantillas de compra. */
  onIrALaCanasta: () => void;
}

type Estado = { tipo: "cargando" } | { tipo: "error"; mensaje: string } | { tipo: "listo"; paquetes: BundleData[] };

const ERROR_SIN_PERMISO = "Tu rol no ve los paquetes. Para repetir una compra, usa las plantillas de la canasta.";
const ERROR_RED = "No pudimos traer los paquetes. Revisa tu conexión y prueba de nuevo.";

export default function PuntoCompraBundles({ products, onAddBundle, onIrALaCanasta }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [vez, setVez] = useState(0);
  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/bundles?active=true", { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) return setEstado({ tipo: "error", mensaje: ERROR_SIN_PERMISO });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        const lista = (Array.isArray(data) ? data : ((data as { bundles?: unknown })?.bundles ?? [])) as BundleData[];
        setEstado({ tipo: "listo", paquetes: lista.filter((b) => b.active !== false && Array.isArray(b.items)) });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[PuntoCompraBundles] cargar paquetes failed", { error: String(err) });
        setEstado({ tipo: "error", mensaje: ERROR_RED });
      });
    return () => ctrl.abort();
  }, [vez]);

  const reintentar = useCallback(() => {
    setEstado({ tipo: "cargando" });
    setVez((v) => v + 1);
  }, []);

  if (estado.tipo === "cargando") {
    return (
      <div className="space-y-2 p-3" aria-busy="true" aria-label="Cargando paquetes">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
        ))}
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div role="alert" className="space-y-3 p-4 text-center text-sm text-[var(--text-secondary)]">
        <p>{estado.mensaje}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {estado.mensaje === ERROR_RED && (
            <button type="button" onClick={reintentar} className={button({ variant: "secondary", className: "rounded-xl" })}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Reintentar
            </button>
          )}
          <button type="button" onClick={onIrALaCanasta} className={button({ variant: "ghost", className: "rounded-xl" })}>
            Ir a la canasta
          </button>
        </div>
      </div>
    );
  }

  if (estado.paquetes.length === 0) {
    return (
      <div className="space-y-3 p-4 text-center">
        <Boxes className="mx-auto h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm font-semibold text-[var(--text-primary)]">No tienes paquetes activos</p>
        <p className="text-sm text-[var(--text-secondary)]">
          Para repetir una compra, arma la canasta y guárdala como plantilla: queda abajo, lista para la próxima.
        </p>
        <button type="button" onClick={onIrALaCanasta} className={button({ variant: "secondary", className: "rounded-xl" })}>
          Armar la canasta
        </button>
      </div>
    );
  }

  return (
    <div className="max-h-72 space-y-2 overflow-y-auto p-3">
      <p className="text-xs font-semibold text-[var(--text-tertiary)]">
        {estado.paquetes.length === 1 ? "1 paquete" : `${estado.paquetes.length} paquetes`} · el costo es el de tu última compra
      </p>
      {estado.paquetes.map((b) => (
        <TarjetaPaquete key={b.id} paquete={b} porId={porId} onAgregar={onAddBundle} />
      ))}
    </div>
  );
}

function TarjetaPaquete({
  paquete,
  porId,
  onAgregar,
}: {
  paquete: BundleData;
  porId: Map<number, PurchaseProduct>;
  onAgregar: (lineas: LineaDePaquete[]) => void;
}) {
  const lineas: LineaDePaquete[] = [];
  const faltan: string[] = [];
  for (const it of paquete.items) {
    const product = porId.get(it.productId);
    if (product) lineas.push({ product, quantity: it.quantity });
    else faltan.push(it.name?.trim() || "un producto");
  }
  const etiqueta = lineas.length === 1 ? "Agregar 1 producto" : `Agregar ${lineas.length} productos`;

  return (
    <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{paquete.name}</p>
          {paquete.description && <p className="truncate text-xs text-[var(--text-tertiary)]">{paquete.description}</p>}
        </div>
        {Number(paquete.price) > 0 && (
          <span className="shrink-0 text-xs text-[var(--text-tertiary)]" title="Precio de venta del paquete, no lo que te cuesta">
            Se vende a {formatCurrency(Number(paquete.price))}
          </span>
        )}
      </div>

      <ul className="flex flex-wrap gap-1" aria-label={`Productos de ${paquete.name}`}>
        {lineas.map((l) => (
          <li
            key={l.product.id}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
          >
            <Package className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            {l.product.name}
            {l.quantity !== 1 && <span className="font-bold text-[var(--text-primary)]">×{l.quantity}</span>}
          </li>
        ))}
      </ul>

      {faltan.length > 0 && (
        <p className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {faltan.length === 1 ? `${faltan[0]} ya no está en tu catálogo: no se agrega.` : `${faltan.length} productos ya no están en tu catálogo: no se agregan.`}
        </p>
      )}

      <button
        type="button"
        disabled={lineas.length === 0}
        onClick={() => onAgregar(lineas)}
        className={button({ variant: "secondary", className: "w-full rounded-xl" })}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {lineas.length === 0 ? "Ninguno está en tu catálogo" : etiqueta}
      </button>
    </div>
  );
}
