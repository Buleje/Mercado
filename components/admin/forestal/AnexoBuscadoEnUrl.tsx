"use client";

/**
 * El Anexo 04 que ⌘K pide abrir: `?anexo04=<id>`. Se consume una vez (el
 * parámetro sale de la URL) y se abre el modal del anexo cargado con ESE papel
 * (`emitidoId`, el mismo camino del recorrido del permiso). Si ya no está en la
 * bandeja, una línea lo dice (`AvisoRegistroAusente`) y se va sola.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { useAnexosEmitidos } from "@/hooks/use-anexos-emitidos";
import { MS_FILA_RESALTADA } from "@/hooks/use-fila-en-url";
import AvisoRegistroAusente from "@/components/admin/shared/AvisoRegistroAusente";

const Anexo04Modal = dynamic(() => import("./Anexo04Modal"), { ssr: false });

export const PARAM_ANEXO_BUSCADO = "anexo04";

/** Se monta sólo con un anexo pedido: así la bandeja no se lee de balde. */
function AnexoPedido({ id, alTerminar }: { id: string; alTerminar: () => void }) {
  const { lista, cargando } = useAnexosEmitidos(0);
  const anexo = cargando ? null : lista.find((a) => a.id === id) ?? null;
  const ausente = !cargando && !anexo;

  useEffect(() => {
    if (!ausente) return;
    const t = window.setTimeout(alTerminar, MS_FILA_RESALTADA);
    return () => window.clearTimeout(t);
  }, [ausente, alTerminar]);

  if (ausente) return <AvisoRegistroAusente que="Ese Anexo 04" />;
  if (!anexo) return null;
  return <Anexo04Modal rows={[]} emitidoId={anexo.id} ctpEntryId={anexo.ctpEntryId} onCerrar={alTerminar} />;
}

export default function AnexoBuscadoEnUrl() {
  const { id, cerrar } = useFichaEnUrl(PARAM_ANEXO_BUSCADO);
  const [pedido, setPedido] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    setPedido(id);
    cerrar();
  }, [id, cerrar]);
  return pedido ? <AnexoPedido id={pedido} alTerminar={() => setPedido(null)} /> : null;
}
