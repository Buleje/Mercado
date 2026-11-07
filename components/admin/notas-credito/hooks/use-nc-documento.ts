import { useCallback, useMemo, useState } from "react";
import { descripcionArmada } from "@/lib/notas-credito/motivos";
import { ofrecerDevueltoEnCaja } from "@/lib/notas-credito/remanente";
import { importeDeLaNota } from "@/components/admin/notas-credito/nc-importe";
import { useRemanenteDocumento } from "@/components/admin/notas-credito/hooks/use-remanente-documento";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";
import { useNcSelector } from "@/components/admin/notas-credito/hooks/use-nc-selector";

/** Tasa estimada sin documento: el servidor usa la del negocio al guardar. */
const TASA_SIN_DOCUMENTO = 0.18;

const CAMPOS_VACIOS = { decia: "", debeDecir: "", rucMal: "", rucBien: "" };
export type CamposMotivo = typeof CAMPOS_VACIOS;

/**
 * Lo que queda del documento elegido y cuánto lleva la nota según su motivo (F09/F11/F12/M55, 17-10).
 * Las cantidades se guardan con la venta a la que pertenecen: al cambiar de venta vuelven a cero sin
 * un efecto que las limpie. Parte de `useNotasCredito`.
 */
export function useNcDocumento(previo: ReturnType<typeof useNcEstado> & ReturnType<typeof useNcSelector>) {
  const { showNew, selectedVenta, form } = previo;
  const docId = showNew ? selectedVenta?.id ?? null : null;
  const remanente = useRemanenteDocumento(docId);
  const lineas = useMemo(() => remanente.datos?.lineas ?? [], [remanente.datos]);

  const [cant, setCant] = useState<{ doc: string | null; q: number[] }>({ doc: null, q: [] });
  const cantidades = useMemo(() => (cant.doc === docId ? cant.q : []), [cant, docId]);
  const [campos, setCampos] = useState<CamposMotivo>(CAMPOS_VACIOS);

  const fijar = useCallback((q: number[]) => setCant({ doc: docId, q }), [docId]);
  const setCantidad = useCallback((i: number, n: number) => {
    setCant((prev) => {
      const base = prev.doc === docId ? prev.q : [];
      return {
        doc: docId,
        q: lineas.map((l, j) => (j === i ? Math.max(0, Math.min(l.vendidas, Math.round(n))) : base[j] ?? 0)),
      };
    });
  }, [docId, lineas]);
  const marcarTodo = useCallback(() => fijar(lineas.map((l) => l.vendidas)), [fijar, lineas]);
  /** M55: lo que ya volvió por Caja › Devolución, para que la nota diga lo mismo que el mostrador. */
  const usarDevueltoEnCaja = useCallback(() => fijar(lineas.map((l) => l.devueltasEnCaja)), [fijar, lineas]);
  const limpiarCantidades = useCallback(() => fijar([]), [fijar]);
  const limpiarDocumento = useCallback(() => { setCant({ doc: null, q: [] }); setCampos(CAMPOS_VACIOS); }, []);

  const tasa = remanente.datos?.tasa ?? TASA_SIN_DOCUMENTO;
  const importe = useMemo(() => importeDeLaNota({
    codigo: form.codigoMotivo,
    conDocumento: !!docId,
    remanente: remanente.datos?.remanente ?? null,
    errorDocumento: remanente.error,
    lineas,
    cantidades,
    baseEscrita: form.monto,
    tasa,
  }), [form.codigoMotivo, form.monto, docId, remanente.datos, remanente.error, lineas, cantidades, tasa]);

  const descripcionFinal = descripcionArmada(form.codigoMotivo, { libre: form.descripcionMotivo, ...campos });
  const devueltoEnCaja = lineas.some((l) => l.devueltasEnCaja > 0);
  /** El botón «Lo devuelto en Caja» se esconde si las notas activas ya cubren lo que Caja devolvió. */
  const ofrecerDevuelto = ofrecerDevueltoEnCaja(
    lineas,
    remanente.datos?.remanente.acreditadoConIgv ?? 0,
    remanente.datos?.reembolsadoEnCaja ?? 0,
  );

  return {
    remanente, lineas, cantidades, setCantidad, marcarTodo, usarDevueltoEnCaja, limpiarCantidades,
    limpiarDocumento, campos, setCampos, tasa, importe, descripcionFinal, devueltoEnCaja, ofrecerDevuelto,
  };
}
