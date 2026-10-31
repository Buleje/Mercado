"use client";

/**
 * El catálogo de gastos fijos del Punto de compra («Gastos fijos del negocio»),
 * montado en Mi Plata › Movimientos › Gastos y presupuesto.
 *
 * Plan «panel unificado», ola 3 (2026-10-10): Compras deja de mostrarlo y lo
 * muestra Mi Plata, donde vive la pregunta «¿en qué se va la plata?». Es el
 * MISMO componente y el MISMO hook (`compra/use-gastos-fijos`): pagar con un
 * toque, agregar uno recurrente y quitarlo del catálogo siguen iguales. Lo
 * único propio de acá es lo que el Punto de compra le daba alrededor: el
 * sonido, la confirmación y el aviso (allá un globo propio; acá el toast del
 * panel).
 */

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { usePOSSound } from "@/components/admin/pos/usePOSSound";
import { useGastosFijos } from "@/components/admin/compra/use-gastos-fijos";
import CompraGastosFijos from "@/components/admin/compra/CompraGastosFijos";

interface Props {
  /** Se pagó o se quitó un fijo: la lista de gastos de arriba tiene que releerse. */
  onCambio?: () => void;
}

export default function CatalogoDeGastosFijos({ onCambio }: Props) {
  const { confirm } = useConfirm();
  const { playDing } = usePOSSound();
  /* El hook escribe el aviso y lo borra con un `setTimeout(null)`: acá el aviso
     es un toast que se va solo, así que sólo importa el texto. */
  const setToastMsg = useCallback<Dispatch<SetStateAction<string | null>>>((v) => {
    const msg = typeof v === "function" ? v(null) : v;
    if (msg) toast.success(msg);
  }, []);
  /* Avisar arriba sólo cuando ALGUIEN hizo algo: el hook toca el `ding` en sus
     tres caminos de éxito (pagó un fijo, lo quitó del catálogo, agregó uno) y
     en ningún otro. Antes se comparaba una firma «pagos:catálogo», pero los
     pagos llegan por otro fetch: si volvían después del catálogo, la firma
     cambiaba sin que nadie tocara nada y la lista de arriba se recargaba
     (perdiendo fechas, categoría y el formulario abierto). */
  const dingYAviso = useCallback(() => {
    playDing();
    onCambio?.();
  }, [playDing, onCambio]);
  const gastos = useGastosFijos({ playDing: dingYAviso, confirm, setToastMsg });

  return <CompraGastosFijos gastos={gastos} />;
}
