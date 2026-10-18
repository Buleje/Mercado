"use client";

import { useEffect } from "react";
import type { DatosAltaRapida } from "@/components/admin/inventario/AltaRapidaProducto";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

const CLAVE = "inventario:alta-pendiente";

/** Desde el mostrador: deja lo escrito en el alta rápida para que Productos abra el formulario completo con eso. */
export function guardarAltaPendiente(d: DatosAltaRapida) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* sin sessionStorage: se abre vacío */ }
}

/** Al abrir Productos: si el mostrador dejó un alta a medias, abre «Nuevo producto» con esos datos. */
export function useAltaPendiente(inv: Pick<Inventario, "setAddForm" | "setShowAdd">) {
  const { setAddForm, setShowAdd } = inv;
  useEffect(() => {
    let crudo: string | null = null;
    try { crudo = sessionStorage.getItem(CLAVE); sessionStorage.removeItem(CLAVE); } catch { return; }
    if (!crudo) return;
    try {
      const d = JSON.parse(crudo) as DatosAltaRapida;
      setAddForm((f) => ({ ...f, name: d.name, price: d.price, stock: d.stock, category: d.category || f.category, barcode: d.barcode, taxType: d.taxType || f.taxType }));
      setShowAdd(true);
    } catch { /* dato viejo o roto: se ignora */ }
  }, [setAddForm, setShowAdd]);
}
