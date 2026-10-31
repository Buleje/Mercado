"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Hash, ListChecks, QrCode } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { DIAS_AVISO_CODIGO_FISICO } from "@/lib/documentos/codigo-fisico-avisos";
import type { ModeloArchivo } from "./use-archivo";

/* La cámara y la cola del archivador pesan: se bajan al tocar el botón. */
const ModoArchivador = dynamic(() => import("../archivador-celular/ModoArchivador"), { ssr: false });

/**
 * ADR-516 — «N por registrar» en la cabecera del Archivo: cuántos papeles
 * tienen su código y todavía no se anotó en el físico. Clic = la vista con
 * esos papeles. Al día (0) no se dibuja.
 *
 * Al lado, «Archivador» (31-10): con el celular, escanear el sticker de cada
 * papel mientras se guarda (`archivador-celular/`). Donde cabe el repaso uno
 * por uno (desde 1280 px) no se muestra: es para el celular o la tablet.
 */
export default function AvisoCodigoPendiente({ arch }: { arch: ModeloArchivo }) {
  const { conteoCodigo, filterMode, setFilterMode, repasoRegistro, setRepasoRegistro, setRegistroHechos, refresh } = arch;
  const [archivador, setArchivador] = useState(false);
  const n = conteoCodigo?.pendientes ?? 0;
  /* El modo abierto no se desmonta aunque la cuenta llegue a 0 a mitad de la vuelta. */
  const modo = archivador && (
    <ModoArchivador
      onCerrar={(cambios) => {
        setArchivador(false);
        if (cambios > 0) void refresh().catch((err: unknown) => console.warn("[documentos] no pude recargar el Archivo", err));
      }}
    />
  );
  if (n === 0 || filterMode === "trash") return modo || null;
  const activo = filterMode === "codigo";
  const atrasados = conteoCodigo?.atrasados ?? 0;
  // El repaso vive en el panel de la derecha: sólo desde 1280 px.
  const puedeRepasar = !repasoRegistro;
  const repasar = () => { setRegistroHechos(0); setRepasoRegistro(true); setFilterMode("codigo"); };
  return (
    <>
    <button
      type="button"
      onClick={() => setFilterMode(activo ? "all" : "codigo")}
      aria-pressed={activo}
      title={`${n} ${n === 1 ? "papel tiene" : "papeles tienen"} su código sin registrar en el papel físico${atrasados > 0 ? ` (${atrasados} hace ${DIAS_AVISO_CODIGO_FISICO} días o más)` : ""}. ${activo ? "Clic para volver a todos." : "Clic para verlos y marcarlos."}`}
      data-qa="aviso-codigo-pendiente"
      className={button({
        variant: "secondary",
        className: cn(
          "gap-1.5 rounded-xl tabular-nums",
          activo && "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15",
        ),
      })}
    >
      <Hash className="h-4 w-4 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
      <span className="font-bold">{n}</span>
      <span className="max-sm:sr-only">por registrar</span>
    </button>
    {puedeRepasar && (
      <button
        type="button"
        onClick={repasar}
        title="Pasa los papeles por registrar uno por uno con la vista al costado: copias el código, lo anotas en la hoja y marcas «Ya lo anoté»."
        data-qa="repasar-por-registrar"
        className={button({ variant: "secondary", className: "hidden gap-1.5 rounded-xl xl:inline-flex" })}
      >
        <ListChecks className="h-4 w-4" aria-hidden /> Repasar uno por uno
      </button>
    )}
    <button
      type="button"
      onClick={() => setArchivador(true)}
      title="Guardar en el archivador: eliges el archivador, escaneas el sticker de cada papel con la cámara y queda registrado. Si el papel va en otro archivador, te avisa."
      data-qa="abrir-archivador"
      className={button({ variant: "secondary", className: "gap-1.5 rounded-xl max-sm:w-12 max-sm:px-0 xl:hidden" })}
    >
      {/* En el celular sólo el ícono: así la fila de Documentos entra en una sola línea (medido a 400 px). */}
      <QrCode className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Archivador</span>
    </button>
    {modo}
    </>
  );
}
