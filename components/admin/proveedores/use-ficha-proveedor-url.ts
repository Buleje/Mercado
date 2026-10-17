"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { DbSupplier } from "@/lib/jsondb";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { useAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";

interface OpcionesFichaProveedor {
  suppliers: readonly DbSupplier[];
  loading: boolean;
  editingSupplier: DbSupplier | null;
  showProveedorModal: boolean;
  setEditingSupplier: (s: DbSupplier | null) => void;
  setShowProveedorModal: (abierta: boolean) => void;
}

/**
 * La ficha del proveedor (`ProveedorFormModal`) en la URL: `?proveedor=<id>`
 * (lib/admin/enlaces-panel). Llegar por enlace la abre, el «atrás» la cierra y
 * abrirla a mano la escribe. «Nuevo proveedor» no lleva id: no toca la URL.
 */
export function useFichaProveedorUrl(o: OpcionesFichaProveedor) {
  const { id: idEnUrl, abrir: abrirEnUrl, cerrar: cerrarEnUrl } = useFichaEnUrl("proveedor");
  const { setEditingSupplier, setShowProveedorModal } = o;

  const abrirFicha = useCallback((s: DbSupplier) => {
    setEditingSupplier(s);
    setShowProveedorModal(true);
    abrirEnUrl(s.id);
  }, [abrirEnUrl, setEditingSupplier, setShowProveedorModal]);

  const cerrarFicha = useCallback(() => {
    setShowProveedorModal(false);
    setEditingSupplier(null);
    cerrarEnUrl();
  }, [cerrarEnUrl, setEditingSupplier, setShowProveedorModal]);

  useAbrirFichaAlLlegar<DbSupplier>({
    idEnUrl,
    idAbierto: o.showProveedorModal ? o.editingSupplier?.id ?? null : null,
    listo: !o.loading,
    buscar: (id) => o.suppliers.find((s) => s.id === id),
    abrir: (s) => { setEditingSupplier(s); setShowProveedorModal(true); },
    cerrar: () => { setShowProveedorModal(false); setEditingSupplier(null); },
    noEsta: () => {
      toast.error("No encontramos ese proveedor.");
      cerrarEnUrl();
    },
  });

  return { abrirFicha, cerrarFicha };
}
