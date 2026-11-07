"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { DbSupplier } from "@/lib/jsondb";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { useAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";
import type { SeccionFicha } from "./FichaProveedorModal";
import type { FiltroProveedor } from "./datos-proveedores";

/**
 * Lo que la lista recuerda mientras la pestaña del navegador sigue abierta
 * (C33: «volver conserva filtro y proveedor seleccionado»): ir a una orden
 * desde la ficha y volver, o pasar a Comparar y regresar, desmonta la lista;
 * el filtro, lo buscado y el último proveedor consultado siguen acá. Sólo se
 * escribe desde el navegador (clics), así que en el servidor queda siempre el
 * valor por defecto.
 */
const recuerdo: { filtro: FiltroProveedor; texto: string; ultimo: string | null } = { filtro: "todos", texto: "", ultimo: null };

export function useListaRecordada() {
  const [filtro, setFiltroState] = useState<FiltroProveedor>(recuerdo.filtro);
  const [texto, setTextoState] = useState(recuerdo.texto);
  const setFiltro = useCallback((f: FiltroProveedor) => { recuerdo.filtro = f; setFiltroState(f); }, []);
  const setTexto = useCallback((t: string) => { recuerdo.texto = t; setTextoState(t); }, []);
  return { filtro, setFiltro, texto, setTexto };
}

/**
 * La ficha de CONSULTA del proveedor (`FichaProveedorModal`) en la URL:
 * `?proveedor=<id>` (lib/admin/enlaces-panel). Llegar por enlace la abre, el
 * «atrás» la cierra y abrirla a mano la escribe. Editar no toca la URL: el
 * formulario se abre encima y, al cerrarlo, la ficha sigue ahí.
 *
 * El proveedor se lee de la lista por id: tras guardar una edición la ficha
 * muestra lo nuevo sin reabrirla.
 */
export function useFichaProveedorUrl({ proveedores, loading }: { proveedores: readonly DbSupplier[]; loading: boolean }) {
  const { id: idEnUrl, abrir: abrirEnUrl, cerrar: cerrarEnUrl } = useFichaEnUrl("proveedor");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<SeccionFicha>("resumen");
  const [ultimo, setUltimo] = useState<string | null>(recuerdo.ultimo);

  const marcar = useCallback((id: string) => {
    recuerdo.ultimo = id;
    setUltimo(id);
  }, []);

  const abrir = useCallback((s: DbSupplier, sec: SeccionFicha = "resumen") => {
    setFichaId(s.id);
    setSeccion(sec);
    marcar(s.id);
    abrirEnUrl(s.id);
  }, [abrirEnUrl, marcar]);

  const cerrar = useCallback(() => {
    setFichaId(null);
    cerrarEnUrl();
  }, [cerrarEnUrl]);

  useAbrirFichaAlLlegar<DbSupplier>({
    idEnUrl,
    idAbierto: fichaId,
    listo: !loading,
    buscar: (id) => proveedores.find((s) => s.id === id),
    abrir: (s) => { setFichaId(s.id); setSeccion("resumen"); marcar(s.id); },
    cerrar: () => setFichaId(null),
    noEsta: () => {
      toast.error("No encontramos ese proveedor.");
      cerrarEnUrl();
    },
  });

  const proveedor = fichaId ? proveedores.find((s) => s.id === fichaId) ?? null : null;
  return { proveedor, seccion, setSeccion, abrir, cerrar, ultimo };
}
