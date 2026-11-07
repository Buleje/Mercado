"use client";

/**
 * Las impresiones de la GTF de SALIDA pedidas desde el menú ⋯ de una fila de
 * Despacho (Brandon 27-10): las mismas cuatro del Libro TH. Se monta sólo
 * cuando se eligió una (la vista guarda cuál y para qué despacho) y se
 * desmonta al terminar con `onFin`:
 *
 * · Hoja SERFOR → visor con la guía entera (+ su lista si salen trozas) y, si
 *   está vigente, al expediente sola (como la de la guía del despacho).
 * · Resumen interno → visor.
 * · Talonario → el modal del talonario de la guía de salida.
 * · Con formato → imprime la guía (+ lista) en hoja blanca, sin modal.
 *
 * Mientras arma el papel avisa con `onOcupado` para que el ⋯ de la fila gire.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { hayNovedades } from "@/lib/forestal/ctp-cola-archivado";
import CtpArchivadorAuto, { type GuiaParaArchivar } from "./CtpArchivadorAuto";
import CtpDespachoTalonarioModal from "./CtpDespachoTalonarioModal";
import CtpDocumentoVisor, { type DocumentoImprimible } from "./CtpDocumentoVisor";
import type { AccionImpresion } from "./despacho-impresiones-menu";
import { fuenteSalida, useGtfConFormato } from "./hooks/use-gtf-con-formato";
import { AvisoGuiaSalida } from "./hooks/use-guia-salida";
import { fichaDelExpediente, papelesDelDespacho, type DespachoParaImprimir } from "./hooks/use-impresion-despacho";

interface Props {
  despacho: DespachoParaImprimir;
  accion: AccionImpresion;
  /** Qué se está armando (`null` = nada): el ⋯ de la fila muestra el giro. */
  onOcupado: (a: AccionImpresion | null) => void;
  onFin: () => void;
}

export default function CtpDespachoImpresiones({ despacho, accion, onOcupado, onFin }: Props) {
  if (accion === "talonario") return <CtpDespachoTalonarioModal despachoId={despacho.id} gtfNumber={despacho.gtfNumber} onClose={onFin} />;
  if (accion === "con-formato") return <ConFormatoDeLaSalida despacho={despacho} onOcupado={onOcupado} onFin={onFin} />;
  return <PapelesDeLaSalida despacho={despacho} accion={accion} onOcupado={onOcupado} onFin={onFin} />;
}

/** El aviso en palabras o el genérico (la red caída no se explica con un stack). */
const motivo = (err: unknown, generico: string): string => (err instanceof AvisoGuiaSalida ? err.message : generico);

function PapelesDeLaSalida({ despacho, accion, onOcupado, onFin }: Props & { accion: "hoja" | "resumen" }) {
  const [documentos, setDocumentos] = useState<DocumentoImprimible[] | null>(null);
  const [activo, setActivo] = useState(0);
  const [cola, setCola] = useState<GuiaParaArchivar[]>([]);
  /* Cerrar el visor con el expediente a medio guardar no corta el guardado:
     se espera al archivador para avisar cómo terminó. */
  const [visorCerrado, setVisorCerrado] = useState(false);
  const fin = useRef({ onOcupado, onFin });
  useEffect(() => {
    fin.current = { onOcupado, onFin };
  });

  useEffect(() => {
    let vivo = true;
    fin.current.onOcupado(accion);
    papelesDelDespacho(despacho, accion)
      .then((p) => {
        if (!vivo) return;
        setDocumentos(p.documentos);
        setCola(p.archivar);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        if (!(err instanceof AvisoGuiaSalida)) console.warn("[despacho-impresiones] no salió el papel", err);
        toast.error(motivo(err, accion === "hoja" ? "No se pudo armar la hoja SERFOR. Prueba de nuevo." : "No se pudo armar el resumen interno. Prueba de nuevo."));
        fin.current.onFin();
      })
      .finally(() => {
        if (vivo) fin.current.onOcupado(null);
      });
    return () => {
      vivo = false;
    };
  }, [despacho, accion]);

  useEffect(() => {
    if (visorCerrado && cola.length === 0) fin.current.onFin();
  }, [visorCerrado, cola.length]);

  return (
    <>
      {cola.length > 0 && (
        <CtpArchivadorAuto
          cola={cola}
          onFin={(r) => {
            setCola([]);
            if (!hayNovedades(r)) return;
            if (r.fallidas > 0) toast.error("No se pudo guardar en el expediente — se puede hacer a mano desde el visor.");
            else toast.success(r.guardadas > 0 ? "Guardada en el expediente (Documentos › Guías forestales)." : "Ya estaba en el expediente.");
          }}
        />
      )}
      {documentos && !visorCerrado && (
        <CtpDocumentoVisor
          documentos={documentos}
          activo={Math.min(activo, documentos.length - 1)}
          onActivo={setActivo}
          onArchivar={accion === "hoja" && despacho.anulada == null ? (d) => fichaDelExpediente(despacho, d.nombre) : undefined}
          onClose={() => setVisorCerrado(true)}
        />
      )}
    </>
  );
}

function ConFormatoDeLaSalida({ despacho, onOcupado, onFin }: Omit<Props, "accion">) {
  /* Montado una vez por pedido: la fuente no cambia mientras vive. */
  const [fuente] = useState(() => fuenteSalida(despacho.id, despacho.gtfNumber, despacho.anulada != null));
  const cf = useGtfConFormato(fuente);
  const [empezo, setEmpezo] = useState(false);
  const lanzado = useRef(false);
  const fin = useRef({ onOcupado, onFin });
  useEffect(() => {
    fin.current = { onOcupado, onFin };
  });
  const { imprimir, ocupado, error } = cf;

  useEffect(() => {
    if (lanzado.current) return;
    lanzado.current = true;
    setEmpezo(true);
    fin.current.onOcupado("con-formato");
    void imprimir(["guia", "lista"]);
  }, [imprimir]);

  useEffect(() => {
    if (!empezo || ocupado) return;
    if (error) toast.error(error);
    fin.current.onOcupado(null);
    fin.current.onFin();
  }, [empezo, ocupado, error]);

  return null;
}
