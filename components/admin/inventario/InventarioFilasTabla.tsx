"use client";

import { Package, ArrowUp, ArrowDown, RefreshCw, ClipboardList, Pencil, Trash2, ScanBarcode, TrendingUp, EyeOff, Sliders } from "@buleje/design-system/icons";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { StockLevelBar } from "@/components/admin/inventario/StockLevelBar";
import { getRotationInfo, computeStockChange, computeSalesPerWeek } from "@/components/admin/inventario/inventory-helpers";
import PriceSparkline from "@/components/admin/inventario/PriceSparkline";
import ImageWarningBadge from "@/components/admin/inventario/ImageWarningBadge";
import { formatCurrency, formatDateNumeric } from "@/lib/format";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import CostoEnFila from "@/components/admin/inventario/CostoEnFila";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Filas de la tabla de productos. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioFilasTabla({ inv }: { inv: Inventario }) {
  const {
    movements, setShowAdd, EMPTY_ADD, setAddForm, selectedIds, autoReorderConfigs, setShowAutoReorder,
    setArThreshold, setArQty, setShowQRProduct, showExtendedCols, orden, setModifiersProduct,
    setCtxMenu, openEditModal, toggleActive, deleteProduct, toggleSelect, removeAutoReorder,
    isLowStock, isExpiringSoon, topRentables, catLabelOf, expiryOf, pgProducts, guardarCosto, verColumnaCosto,
  } = inv;
  return (
    <>
      {pgProducts.items.map(p => {
        const lowStock = isLowStock(p);
        return (
          <tr
            key={p.id}
            className={cn("hover:bg-[var(--surface-alt)] transition-colors", !p.active && "opacity-50 bg-[var(--surface-canvas)]/30", lowStock && "bg-[var(--data-warning-50)]/40", selectedIds.has(p.id) && "bg-primary/5")}
            onContextMenu={(e) => {
              e.preventDefault();
              let x = e.clientX;
              let y = e.clientY;
              if (x + 200 > window.innerWidth) x = window.innerWidth - 208;
              if (y + 200 > window.innerHeight) y = window.innerHeight - 208;
              setCtxMenu({ product: p, x, y });
            }}
          >
            <td>
              <input type="checkbox" aria-label={`Seleccionar ${p.name}`} checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
            </td>
            <EnOrden
              orden={orden.orden}
              celdas={{
                img: (
                  <td>
                    {p.image ? (
                      /* El `overflow-hidden` va en un envoltorio INTERNO,
                         no en el span de afuera: cuando la URL de la foto
                         no carga (el catálogo trae enlaces externos que
                         se caen), el navegador dibuja el texto alternativo
                         —el nombre completo del producto— y sin recorte
                         estiraba la fila de 70 a 161px. Medido en el
                         inventario real: filas de 70, 70, 121, 141 y 161px
                         en la misma tabla. Afuera queda el badge de aviso,
                         que se posiciona sobre el borde y sí tiene que
                         poder salirse. */
                      <span className="relative inline-block shrink-0 h-10 w-10">
                        <span className="block h-10 w-10 overflow-hidden rounded-md">
                          <Image src={p.image} alt={p.name} width={40} height={40} className="h-10 w-10 object-cover" />
                        </span>
                        <ImageWarningBadge image={p.image} />
                      </span>
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-[var(--surface-sunken)] flex items-center justify-center">
                        <Package className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
                      </div>
                    )}
                  </td>
                ),
                producto: (
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Mejora 5R2: Semaforo de stock */}
                      {(() => {
                        const stockMin = p.stockMin ?? 5;
                        // Brandon 2026-06-01: distinguir "no gestiona stock"
                        // (undefined → restaurante que no controla inventario)
                        // de "agotado" (stock 0). Antes `?? 0` pintaba ambos
                        // como agotado.
                        if (p.stock === undefined || p.stock === null) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--rule-base)] inline-block shrink-0" title="Sin control de stock" />;
                        const stock = p.stock;
                        if (stock === 0) return <span className="w-2.5 h-2.5 rounded-full bg-black inline-block shrink-0" title="Agotado" />;
                        if (stock <= stockMin) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-error-500)] inline-block shrink-0" title="Critico" />;
                        if (stock <= stockMin * 2) return <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-warning-500)] inline-block shrink-0" title="Bajo" />;
                        return <span className="w-2.5 h-2.5 rounded-full bg-primary/10 inline-block shrink-0" title="OK" />;
                      })()}
                      <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate-25">{p.name}</span>
                      {/* Mejora QW-10i: Badge alta rentabilidad */}
                      {topRentables.includes(p.id) && (
                        <StatusBadge variant="success" label="Alta rentabilidad" size="sm" />
                      )}
                      {!p.active && (
                        <StatusBadge variant="neutral" label="Inactivo" icon={EyeOff} size="sm" />
                      )}
                    </div>
                  </td>
                ),
                categoria: (
                  <td className="text-[var(--text-secondary)] dark:text-muted">
                    {catLabelOf(p.category)}
                  </td>
                ),
                precio: <td className="font-bold text-primary">{formatCurrency(Number(p.price))}</td>,
                historial: (
                  <td className={cn(!showExtendedCols && "hidden")}>
                    <PriceSparkline productId={p.id} />
                  </td>
                ),
                badge: (
                  <td className={cn(!showExtendedCols && "hidden")}>
                    {p.badge ? <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-semibold">{p.badge}</span> : <span className="text-[var(--text-tertiary)] dark:text-muted">—</span>}
                  </td>
                ),
                stock: (
                  <td>
                    {/* Brandon 2026-06-06: barra visual de nivel de stock
                        (estado por color + marcador del mínimo) en vez del
                        número plano. Ver StockLevelBar. */}
                    <StockLevelBar
                      stock={p.stock}
                      stockMin={p.stockMin}
                      stockMax={p.stockMax}
                      unit={p.unit}
                    />
                  </td>
                ),
                /* Costo editable en la fila (FAC-2): sin costo = casilla; con
                   costo = la cifra, un toque la corrige. Los servicios no
                   llevan costo (el filtro «Sin costo» tampoco los cuenta). */
                costoProm: (
                  <td className={cn(!verColumnaCosto && "hidden")}>
                    {p.type === "service"
                      ? <span className="text-[var(--text-tertiary)] dark:text-muted">—</span>
                      : <CostoEnFila productId={p.id} nombre={p.name} costPrice={p.costPrice} guardar={guardarCosto} />}
                  </td>
                ),
                /* Mejora 6: Rotation indicator */
                rotacion: (
                  <td className={cn(!showExtendedCols && "hidden")}>
                    {(() => {
                      const spw = computeSalesPerWeek(p.id, movements);
                      const info = getRotationInfo(spw, p.stock ?? 0);
                      if (!info) return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">Normal</span>;
                      return (
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold", info.className)}>
                          {info.level === "rápido" && <TrendingUp className="h-2.5 w-2.5" />}
                          {info.label}
                        </span>
                      );
                    })()}
                  </td>
                ),
                /* Mejora 7: Stock change last 30 days */
                cambio30d: (
                  <td className={cn(!showExtendedCols && "hidden")}>
                    {(() => {
                      const delta = computeStockChange(p.id, movements);
                      if (delta > 0) return <span className="text-xs font-bold text-[var(--data-success-500)]"><ArrowUp className="h-3 w-3 inline" /> +{delta}</span>;
                      if (delta < 0) return <span className="text-xs font-bold text-[var(--data-error-500)]"><ArrowDown className="h-3 w-3 inline" /> {delta}</span>;
                      return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">&#8594; 0</span>;
                    })()}
                  </td>
                ),
                /* Vencimiento (2026-09-22): antes sólo un conteo en el
                   KPI, sin columna ni forma de acotar la tabla. */
                vence: (
                  <td className={cn(!showExtendedCols && "hidden")}>
                    {(() => {
                      const v = expiryOf(p);
                      if (!v) return <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">—</span>;
                      return (
                        <span className={cn("text-xs tabular-nums", isExpiringSoon(p) && "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>
                          {formatDateNumeric(`${v}T00:00:00Z`, { soloFecha: true })}
                        </span>
                      );
                    })()}
                  </td>
                ),
                estado: (
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.active}
                      aria-label={`${p.name}: ${p.active ? "activo, toca para desactivar" : "inactivo, toca para activar"}`}
                      title={p.active ? "Activo — toca para desactivar" : "Inactivo — toca para activar"}
                      onClick={() => toggleActive(p)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                        p.active ? "bg-[var(--data-success-500)]" : "bg-[var(--rule-strong)]"
                      )}
                    >
                      <span className={cn("absolute h-4 w-4 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-all", p.active ? "left-[1.1rem]" : "left-0.5")} />
                    </button>
                  </td>
                ),
              }}
            />
            <td>
              <div className="flex items-center gap-1">
                <button onClick={() => openEditModal(p)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-primary hover:bg-primary/8 transition-colors" title="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                {/* Mejora 7R2: Duplicar producto */}
                <button
                  onClick={() => {
                    setAddForm({
                      ...EMPTY_ADD,
                      type: p.type ?? "product",
                      brand: p.brand ?? "",
                      taxType: p.taxType ?? "gravado",
                      weightKg: p.weightKg != null ? String(p.weightKg) : "",
                      dimensions: p.dimensions ?? "",
                      durationLabel: p.durationLabel ?? "",
                      pricingUnit: p.pricingUnit ?? "fijo",
                      notes: p.notes ?? "",
                      description: p.description ?? "",
                      name: `${p.name} (Copia)`,
                      category: p.category,
                      price: String(p.price),
                      unit: p.unit,
                      badge: p.badge ?? "",
                      image: p.image ?? "",
                      barcode: "",
                      costPrice: p.costPrice != null ? String(p.costPrice) : "",
                      stock: "0",
                      stockMin: p.stockMin != null ? String(p.stockMin) : "",
                      stockMax: p.stockMax != null ? String(p.stockMax) : "",
                      expiryDate: "",
                      isVariant: false,
                      variantOf: "",
                      variantAttr: "",
                    });
                    setShowAdd(true);
                  }}
                  className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-primary/10 transition-colors"
                  title="Duplicar"
                >
                  <ClipboardList className="h-4 w-4" />
                </button>
                <button onClick={() => deleteProduct(p.id)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
                {/* Adicionales / modificadores (cremas, sabores, extras) */}
                <button onClick={() => setModifiersProduct({ id: p.id, name: p.name })} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--accent)] hover:bg-primary/10 transition-colors" title="Adicionales y modificadores (cremas, salsas, extras)">
                  <Sliders className="h-4 w-4" />
                </button>
                {/* Mejora 6 nueva: QR */}
                <button onClick={() => setShowQRProduct(p)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors" title="QR">
                  <ScanBarcode className="h-4 w-4" />
                </button>
                {/* Mejora 5 nueva: Auto-reorden toggle */}
                <button
                  onClick={() => {
                    if (autoReorderConfigs[p.id]) {
                      removeAutoReorder(p.id);
                    } else {
                      setArThreshold(String(p.stockMin ?? 5));
                      setArQty(String((p.stockMax ?? (p.stockMin ?? 5) * 2) - (p.stock ?? 0)));
                      setShowAutoReorder(p.id);
                    }
                  }}
                  className={cn(
                    "p-1.5 rounded-xl transition-colors",
                    autoReorderConfigs[p.id]
                      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10"
                      : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-primary/10"
                  )}
                  title={autoReorderConfigs[p.id] ? "Auto-reorden activo (click para desactivar)" : "Configurar auto-reorden"}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
