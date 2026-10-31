import { useCallback } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";
import { useInventarioCarga } from "@/components/admin/inventario/hooks/use-inventario-carga";

/** Guardar y subir imágenes, y borrar un producto. Parte de `useInventario`. */
export function useInventarioImagenes(previo: ReturnType<typeof useInventarioEstado> & ReturnType<typeof useInventarioCarga>) {
  const {
    confirm, showUndo, products, setProducts, load,
  } = previo;

  // Auto-save del campo `image` cuando el usuario lo cambia en modo edit.
  // Optimistic update local — NO refetch (load() global resetea el scrollTop
  // del div overflow-y-auto del modal, dejando el preview fuera de viewport
  // ~900ms después del pick, que el usuario percibe como "no se aplicó").
  const autoSaveImage = useCallback(async (productId: number, imageUrl: string) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ image: imageUrl }),
      });
      if (!res.ok) {
        toast.error("La imagen se ve aqui pero no persistio. Reintenta o usa Guardar.", { duration: 4000 });
        return;
      }
      toast.success("Imagen guardada", { duration: 1800 });
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, image: imageUrl } : p)));
    } catch {
      toast.error("Error de red al guardar imagen. Verifica conexion.", { duration: 4000 });
    }
  }, [setProducts]);

  /**
   * Subir archivo de imagen al endpoint /api/upload (Supabase Storage + Sharp).
   * Reemplaza el flujo viejo `processImage` que devolvia dataUrl base64 inline
   * (~1-5MB en string que iba al JSON del PUT — lento y a veces fallaba).
   *
   * Retorna URL publica de la imagen subida o null si fallo.
   */
  const uploadImageFile = useCallback(async (file: File): Promise<string | null> => {
    const t = toast.loading("Subiendo imagen...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "products");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: csrfHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error("No se pudo subir la imagen", {
          id: t,
          description: err.error ?? `HTTP ${res.status}. Intenta con una imagen mas chica.`,
        });
        return null;
      }
      const data = await res.json() as { url: string };
      toast.success("Imagen subida", { id: t, duration: 1500 });
      return data.url;
    } catch (e) {
      toast.error("Error de red al subir imagen", {
        id: t,
        description: e instanceof Error ? e.message : "Verifica conexion.",
      });
      return null;
    }
  }, []);

  const deleteProduct = async (id: number) => {
    const product = products.find((p) => p.id === id);
    const name = product?.name ?? "producto";
    const ok = await confirm({
      title: "¿Eliminar producto?",
      description: `"${name}" se eliminará permanentemente. Esta acción no se puede deshacer desde la interfaz.`,
      intent: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    // Antes se anunciaba «Producto eliminado» pasara lo que pasara. Con un
    // 409 (el producto tiene ventas asociadas) o un 402 (plan vencido) el
    // aviso salía igual —incluido el «contacta soporte para restauración»—,
    // el `load()` lo traía de vuelta a la lista, y el encargado terminaba sin
    // saber si el producto estaba borrado o no.
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo eliminar "${name}" (error ${res.status})`,
        );
        return;
      }
      showUndo({
        message: `Producto "${name}" eliminado`,
        detail: "Si fue un error, contacta soporte para restauración.",
        duration: 6000,
      });
    } catch (err) {
      console.warn("[InventoryTab] eliminar producto falló", err);
      toast.error("Sin conexión — el producto NO se eliminó.");
      return;
    }
    load();
  };

  return {
    autoSaveImage, uploadImageFile, deleteProduct,
  };
}
