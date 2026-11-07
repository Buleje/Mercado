"use client";

/**
 * CtpSemanaDeProduccion — la tira de días del registro de PRODUCCIÓN, con
 * «Anular el día» (Brandon, 2026-09-23).
 *
 * Es `CtpSemanaDeRegistro` más lo que hace falta para anular lo declarado un
 * día: preguntar (`useAnularDiaDeProduccion`), releer la tira, avisar al libro
 * de atrás y decir qué se anuló. Vive aparte para que los dos modales que
 * declaran producción («Producir sin lote» y «Declarar producción» del lote)
 * tengan el MISMO botón con la misma regla, sin copiar el camino en cada uno.
 *
 * La papelera sólo sale a quien el servidor deja anular (`puedePedir` con el
 * MISMO array de roles que la ruta, `RUTAS_PANEL`): a un almacenero se le
 * ofrecía un botón que terminaba en 403.
 */

import { useCallback, type ComponentProps } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { RespuestaAnularDia } from "@/lib/forestal/anular-dia-produccion";
import CtpSemanaDeRegistro from "./CtpSemanaDeRegistro";
import { useAnularDiaDeProduccion } from "./hooks/use-anular-dia";
import { ActionToasts, useActionToasts } from "./cubicador-toasts";

type Props = Omit<
  ComponentProps<typeof CtpSemanaDeRegistro>,
  "seccion" | "onAnularDia" | "anulandoDia" | "onEditado"
> & {
  /** Vuelve a leer la semana de la tira (`useJornadasDeProduccion().recargar`). */
  onReleer: () => void;
  /** El libro cambió sin cerrar el modal: la tabla de atrás tiene que releer. */
  onCambioEnElLibro?: () => void;
};

export default function CtpSemanaDeProduccion({ onReleer, onCambioEnElLibro, ...tira }: Props) {
  const { toasts, push: avisar, dismiss: quitarAviso } = useActionToasts();
  const alAnular = useCallback(
    (r: RespuestaAnularDia, resumen: string) => {
      onReleer();
      onCambioEnElLibro?.();
      if (r.anuladas.length === 0) return;
      avisar({
        tono: "success",
        msg: `${r.anuladas.length === 1 ? "Se anuló 1 corrida" : `Se anularon ${r.anuladas.length} corridas`} del ${etiquetaLarga(r.dia)}`,
        detail: `${resumen}. Quedan en el Libro como anuladas, con su motivo.`,
      });
    },
    [onReleer, onCambioEnElLibro, avisar],
  );
  const { anularDia, anulando } = useAnularDiaDeProduccion({ onAnulado: alAnular });
  /* Se corrigió una escuadría o una corrida desde «Ver qué salió ese día»:
     la tira relee (el día puede cambiar de especie o de m³) y el libro también. */
  const alEditar = useCallback(() => {
    onReleer();
    onCambioEnElLibro?.();
  }, [onReleer, onCambioEnElLibro]);
  /* Mientras el rol no se sabe (`null`), no se ofrece: «no sé» no es «puede». */
  const puedeAnular = puedePedir("/api/admin/forestal/ctp/anular-dia", useMiRol());

  return (
    <>
      <CtpSemanaDeRegistro
        {...tira}
        seccion="produccion"
        onAnularDia={puedeAnular ? (iso) => void anularDia(iso) : undefined}
        anulandoDia={anulando}
        onEditado={alEditar}
      />
      <ActionToasts toasts={toasts} onDismiss={quitarAviso} />
    </>
  );
}
