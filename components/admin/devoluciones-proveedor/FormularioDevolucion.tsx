"use client";

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, Plus, X } from "@buleje/design-system/icons";
import ProductCombobox, { type ProductOption } from "@/components/admin/shared/ProductCombobox";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { OrigenDevolucionCampo } from "./OrigenDevolucionCampo";
import { costoSugerido, revisarContraOrigen, type LineaOrigen } from "./origen-devolucion";
import { MOTIVOS, UNIDADES, soles, valorDevolucion, valorItem, type ItemDevuelto, type Proveedor } from "./tipos";
import type { DatosNuevaDevolucion } from "./use-devoluciones";
import { useOrigenesDevolucion } from "./use-origenes-devolucion";

const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40";
const ROTULO = "text-sm font-medium text-[var(--text-secondary)]";
const ITEM_VACIO: ItemDevuelto = { nombre: "", cantidad: 1, unidad: "und" };

interface Props {
  proveedores: Proveedor[];
  loadingProveedores: boolean;
  products: ProductOption[];
  guardando: boolean;
  onGuardar: (datos: DatosNuevaDevolucion) => Promise<boolean>;
  onCerrar: () => void;
}

/** Montarlo = formulario limpio; desmontarlo lo descarta (no hay reset a mano). */
export function FormularioDevolucion({ proveedores, loadingProveedores, products, guardando, onGuardar, onCerrar }: Props) {
  const [proveedorId, setProveedorId] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<ItemDevuelto[]>([{ ...ITEM_VACIO }]);
  const [origenOrdenId, setOrigenOrdenId] = useState("");
  const [sinOrigenMotivo, setSinOrigenMotivo] = useState("");
  const origen = useOrigenesDevolucion(proveedorId);
  const orden = origen.ordenes.find((o) => o.ordenId === origenOrdenId);
  const revision = revisarContraOrigen(items, origen.porProducto, orden);
  /** El costo que pondrá el servidor (orden → última compra → ficha), para que el total no engañe. */
  const conCosto = items.map((i) => ({ ...i, precioUnitario: costoSugerido(i, origen.porProducto, orden) }));

  /** Una línea de la orden de origen entra con su costo y su producto; cantidad 1 para empezar. */
  const agregarDeOrden = (l: LineaOrigen) =>
    setItems((prev) => {
      const nuevo: ItemDevuelto = { nombre: l.nombre, cantidad: Math.min(1, l.puedesDevolver), unidad: l.unidad, productId: l.productId, precioUnitario: l.costo };
      const vacio = prev.findIndex((i) => !i.nombre.trim());
      return vacio >= 0 ? prev.map((i, k) => (k === vacio ? nuevo : i)) : [...prev, nuevo];
    });

  const actualizarItem = (index: number, campo: keyof ItemDevuelto, valor: string | number) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)));

  /** Al elegir del inventario se guarda TODO lo que el buscador ya sabía: id (mueve stock) y costo (ADR-379). */
  const seleccionarProducto = (index: number, p: ProductOption) =>
    setItems((prev) => prev.map((item, i) => (i === index ? {
      ...item,
      nombre: p.name,
      productId: typeof p.id === "number" ? p.id : undefined,
      precioUnitario: p.costPrice ?? undefined,
      unidad: p.unit || item.unidad,
    } : item)));

  /** Si el texto deja de coincidir con el producto elegido, el vínculo se corta: descontaría stock de otro. */
  const escribirNombreItem = (index: number, texto: string) =>
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      if (item.productId != null && texto !== item.nombre) {
        return { ...item, nombre: texto, productId: undefined, precioUnitario: undefined };
      }
      return { ...item, nombre: texto };
    }));

  const { total, sinPrecio } = valorDevolucion(conCosto.filter((i) => i.nombre.trim() !== ""));
  const sinNada = items.every((i) => !i.nombre.trim());
  // El servidor vuelve a juzgar las dos cosas; acá se avisa antes de guardar.
  const bloqueado = revision.excede.length > 0 || (revision.sinRecepcion.length > 0 && !sinOrigenMotivo.trim());

  return (
    <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Nueva devolución</CardTitle>
        <button type="button" aria-label="Cerrar" onClick={onCerrar} className="flex h-12 w-12 items-center justify-center rounded-xl transition-colors hover:bg-[var(--surface-sunken)]">
          <X className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Proveedor *" labelClassName={ROTULO} className="space-y-1">
          {(id) => loadingProveedores ? (
            <div className="h-12 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
          ) : (
            <select id={id} value={proveedorId} onChange={(e) => { setProveedorId(e.target.value); setOrigenOrdenId(""); }} className={CAMPO}>
              <option value="">Selecciona un proveedor…</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Motivo *" labelClassName={ROTULO} className="space-y-1">
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CAMPO}>
            {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>

      {proveedorId && (
        <OrigenDevolucionCampo
          ordenes={origen.ordenes}
          cargando={origen.cargando}
          error={origen.error}
          ordenId={origenOrdenId}
          onOrden={setOrigenOrdenId}
          revision={revision}
          sinMotivo={sinOrigenMotivo}
          onSinMotivo={setSinOrigenMotivo}
          agregados={new Set(items.flatMap((i) => (i.productId != null ? [i.productId] : [])))}
          onAgregar={agregarDeOrden}
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={ROTULO}>Items a devolver *</span>
          <button type="button" onClick={() => setItems((prev) => [...prev, { ...ITEM_VACIO }])} className="flex h-12 items-center gap-1 px-2 text-sm font-medium text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            <Plus className="h-4 w-4" aria-hidden /> Agregar
          </button>
        </div>
        {items.map((item, index) => {
          const valor = valorItem(conCosto[index]);
          const tope = item.productId != null ? revision.tope.get(item.productId) : undefined;
          return (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <div className="flex w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1">
                <ProductCombobox
                  id={`devol-prod-${index}`}
                  products={products}
                  value={item.nombre}
                  placeholder="Nombre del producto"
                  inputClassName="h-12 text-sm"
                  onChange={(text) => escribirNombreItem(index, text)}
                  onSelect={(p) => seleccionarProducto(index, p)}
                />
              </div>
              <input
                type="number"
                min={1}
                aria-label={`Cantidad del ítem ${index + 1}`}
                value={item.cantidad}
                onChange={(e) => actualizarItem(index, "cantidad", Number(e.target.value))}
                className={cn(CAMPO, "w-20 px-2 text-center")}
              />
              <select aria-label={`Unidad del ítem ${index + 1}`} value={item.unidad} onChange={(e) => actualizarItem(index, "unidad", e.target.value)} className={cn(CAMPO, "w-24 px-2")}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              {/* Sin producto elegido no hay costo que mostrar: decirlo evita que el total parezca completo. */}
              <span className={cn("w-24 shrink-0 text-right text-sm tabular-nums", valor != null ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>
                {valor != null ? soles(valor) : "sin costo"}
              </span>
              {tope != null && <span className="w-full text-sm text-[var(--text-secondary)] sm:w-auto">hasta {tope}</span>}
              {items.length > 1 && (
                <button type="button" aria-label="Quitar" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} className="flex h-12 w-12 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:text-[var(--data-error-ink)]">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}

        {(total > 0 || sinPrecio > 0) && (
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">El proveedor te debe</p>
              {sinPrecio > 0 && (
                <p className="text-sm text-[var(--text-secondary)]">
                  {sinPrecio === 1
                    ? "1 ítem queda «pendiente de valoración»: le pones costo después."
                    : `${sinPrecio} ítems quedan «pendientes de valoración»: les pones costo después.`}
                </p>
              )}
            </div>
            <span className="shrink-0 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{soles(total)}</span>
          </div>
        )}
      </div>

      <Field label="Notas adicionales" labelClassName={ROTULO} className="space-y-1">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Información adicional sobre la devolución..." className={cn(CAMPO, "h-auto resize-none py-2")} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCerrar} className={button({ variant: "ghost" })}>Cancelar</button>
        <button
          type="button"
          onClick={async () => { if (await onGuardar({ proveedorId, motivo, notas, items, origenOrdenId, sinOrigenMotivo })) onCerrar(); }}
          disabled={guardando || !proveedorId || sinNada || bloqueado}
          className={button({ variant: "primary", className: "gap-2" })}
        >
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {guardando ? "Guardando..." : "Registrar devolución"}
        </button>
      </div>
    </div>
  );
}
