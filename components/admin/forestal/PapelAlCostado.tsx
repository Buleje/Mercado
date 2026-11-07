"use client";

/**
 * Forestal: un papel del drive (foto/PDF de la GTF, factura, lista de trozas…)
 * se ve AL COSTADO de la lista que lo trae, con ‹ › entre los papeles (Brandon
 * 31-10: el mismo «un clic = ver al costado» del Archivo, Esenciales y Terceros).
 * «Abrir» o doble clic sigue abriendo la ventana grande de siempre.
 *
 * Envuelve el cuerpo de una ventana: lista a la izquierda (`children`), papel a
 * la derecha. En menos de 760 px el papel reemplaza la lista con «‹ Volver».
 */

import { useState, type ReactNode } from "react";
import PreviaDocSuelta from "@/components/admin/documentos/vista-lateral/PreviaDocSuelta";
import type { usePapelAlCostado } from "@/components/admin/documentos/vista-lateral/use-doc-suelto";
import { raw } from "./gtf-documentos-acciones";
import VistaPreviaDoc from "./plan-documentos/VistaPreviaDoc";

export default function PapelAlCostado({
  lado,
  children,
  cerradoClassName,
  onEnviar,
}: {
  lado: ReturnType<typeof usePapelAlCostado>;
  children: ReactNode;
  /** Clases del cuerpo mientras no hay papel abierto (el margen de siempre de la ventana). */
  cerradoClassName?: string;
  /** Enviar ESTE papel por WhatsApp. Sin esto no se ofrece. */
  onEnviar?: (id: string) => void;
}) {
  const [grande, setGrande] = useState<string | null>(null);
  const id = lado.id;
  const descargar = (nombre: string) => {
    if (!id) return;
    const a = document.createElement("a");
    a.href = `${raw(id)}?download=1`;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <>
      <div className={id ? "grid gap-4 px-5 py-4 min-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] sm:px-6" : undefined}>
        <div className={id ? "min-w-0 max-[759px]:hidden" : cerradoClassName}>{children}</div>
        {id && (
          <aside aria-label="Papel" className="min-w-0 self-start min-[760px]:sticky min-[760px]:top-0">
            <PreviaDocSuelta
              docId={id}
              nav={lado.nav("Volver a la lista")}
              onAbrirGrande={() => setGrande(id)}
              onDescargar={descargar}
              onEnviar={onEnviar ? () => onEnviar(id) : undefined}
            />
          </aside>
        )}
      </div>
      <VistaPreviaDoc docId={grande} onClose={() => setGrande(null)} />
    </>
  );
}
