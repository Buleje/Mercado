"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { FIELD_INPUT } from "@/components/admin/inventario/inventario-compartido";
import { PrecioConIgv } from "@/components/admin/inventario/PrecioConIgv";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerMonto } from "@/lib/precio-igv";

export interface CategoriaOpcion { id: string; label: string }

/** Lo que se escribió, para seguir en el formulario completo sin perderlo. */
export interface DatosAltaRapida {
  name: string; price: string; stock: string; category: string; barcode: string; taxType: string;
}

/** El producto que devolvió el alta (`POST /api/products`). */
export type ProductoCreado = { id: number; name: string; price: number; category: string } & Record<string, unknown>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lo que se buscó y no existe: un código (6+ dígitos) cae en «Código de barras», lo demás en el nombre. */
  textoBuscado?: string;
  categorias: CategoriaOpcion[];
  onCreado: (producto: ProductoCreado) => void | Promise<void>;
  /** «Ir al formulario completo»: recibe lo escrito. */
  onFormularioCompleto: (datos: DatosAltaRapida) => void;
}

const VACIO: DatosAltaRapida = { name: "", price: "", stock: "", category: "", barcode: "", taxType: "gravado" };

/**
 * Alta rápida (18-10, copiada de Alegra): nombre, precio, stock inicial, categoría y código de barras.
 * Usa el mismo `POST /api/products` del formulario completo; lo demás (foto, costo, variantes) se completa
 * después. El precio se guarda CON IGV, igual que en el formulario completo.
 */
export default function AltaRapidaProducto({ open, onClose, textoBuscado, categorias, onCreado, onFormularioCompleto }: Props) {
  const [f, setF] = useState<DatosAltaRapida>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre arranca con lo buscado (derivado al abrir, no en cada tecla).
  useEffect(() => {
    if (!open) return;
    const t = (textoBuscado ?? "").trim();
    const esCodigo = /^\d{6,}$/.test(t);
    setF({ ...VACIO, name: esCodigo ? "" : t, barcode: esCodigo ? t : "", category: categorias[0]?.id ?? "" });
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (parte: Partial<DatosAltaRapida>) => setF((x) => ({ ...x, ...parte }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    const precio = leerMonto(f.price);
    if (!f.name.trim()) return setError("Escribe el nombre del producto.");
    if (precio <= 0) return setError("Escribe un precio mayor a cero.");
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: f.name.trim(),
          category: f.category || categorias[0]?.id || "General",
          price: precio,
          taxType: f.taxType,
          barcode: f.barcode.trim() || undefined,
          stock: f.stock.trim() !== "" ? Math.max(0, leerMonto(f.stock)) : undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d?.error || `No se pudo crear el producto (HTTP ${res.status})`);
        return;
      }
      const creado = (await res.json()) as ProductoCreado;
      toast.success(`«${creado.name}» creado`);
      await onCreado(creado);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el producto.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Producto nuevo"
      description="Lo básico para venderlo ahora"
      size="md"
      claveVentana="inventario-alta-rapida"
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={() => onFormularioCompleto(f)} className={button({ variant: "ghost" })}>
            Ir al formulario completo
          </button>
          <button type="submit" form="alta-rapida-producto" disabled={guardando} className={button({ variant: "primary", className: "gap-2" })}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
            {guardando ? "Guardando…" : "Crear producto"}
          </button>
        </ModalFooter>
      }
    >
      <form id="alta-rapida-producto" onSubmit={guardar} className={`grid grid-cols-2 gap-3 ${MODAL_BODY}`}>
        <Field label="Nombre *" className="col-span-2">
          <input autoFocus required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej: Arroz Costeño 1 kg" className={FIELD_INPUT} />
        </Field>
        <PrecioConIgv className="col-span-2" required valor={f.price} onCambio={(v) => set({ price: v })} taxType={f.taxType} />
        <Field label="Afecto a IGV" className="col-span-2 sm:col-span-1">
          <select value={f.taxType} onChange={(e) => set({ taxType: e.target.value })} className={FIELD_INPUT}>
            <option value="gravado">Gravado</option>
            <option value="exonerado">Exonerado</option>
            <option value="inafecto">Inafecto</option>
          </select>
        </Field>
        <Field label="Stock inicial" className="col-span-2 sm:col-span-1">
          <input type="number" min="0" step="1" inputMode="numeric" value={f.stock} onChange={(e) => set({ stock: e.target.value })} placeholder="Vacío = sin controlar" className={FIELD_INPUT} />
        </Field>
        <Field label="Categoría" className="col-span-2 sm:col-span-1">
          <select value={f.category} onChange={(e) => set({ category: e.target.value })} className={FIELD_INPUT}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Código de barras" className="col-span-2 sm:col-span-1">
          <input value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} inputMode="numeric" placeholder="Opcional" className={FIELD_INPUT} />
        </Field>
      </form>
    </AdminModal>
  );
}
