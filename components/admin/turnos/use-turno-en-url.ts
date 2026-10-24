"use client";

/**
 * El turno abierto en la URL: `?vista=turnos&sub=historial&turno=<id>` abre su
 * resumen. Es el lector del enlace `turno` (`lib/admin/enlaces-panel.ts`) y lo
 * que escribe un clic en el historial: «atrás» cierra el resumen y el link se
 * puede compartir.
 *
 * Hasta el 10-10 ese enlace llevaba a Caja › Cuadrar, que desde ese día es sólo
 * el contador de la caja abierta: un turno cerrado ya no tenía nada que ver ahí.
 *
 * El clic sólo escribe la URL y el lector abre (el resumen se pide al servidor:
 * abrirlo en los dos lados lo pedía dos veces). El resumen que aparece al
 * cerrar un turno no vive en la URL: por eso `desdeUrl`, para que recargar la
 * lista después del cierre no lo cierre.
 */
import { useCallback, useState } from "react";
import { useAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import type { Turno } from "./tipos";

interface Opciones {
  historial: Turno[];
  turnoActivo: Turno | null;
  listo: boolean;
  /** El turno del resumen a la vista, o `null`. */
  resumenAbiertoId: string | null;
  verResumen: (t: Turno) => void;
  cerrarResumen: () => void;
  irASeccion: (s: "turno" | "historial") => void;
}

export function useTurnoEnUrl({ historial, turnoActivo, listo, resumenAbiertoId, verResumen, cerrarResumen, irASeccion }: Opciones) {
  const ficha = useFichaEnUrl("turno");
  const [desdeUrl, setDesdeUrl] = useState(false);

  useAbrirFichaAlLlegar<Turno>({
    idEnUrl: ficha.id,
    idAbierto: desdeUrl ? resumenAbiertoId : null,
    listo,
    buscar: (id) => historial.find((t) => t.id === id) ?? (turnoActivo?.id === id ? turnoActivo : null),
    abrir: (t) => {
      /* El turno abierto no tiene resumen de cierre: se muestra en su sección. */
      if (t.status === "ABIERTO") {
        irASeccion("turno");
        ficha.cerrar();
        return;
      }
      setDesdeUrl(true);
      irASeccion("historial");
      verResumen(t);
    },
    cerrar: () => {
      setDesdeUrl(false);
      cerrarResumen();
    },
    /* Borrado o de otro negocio: la URL no queda pidiendo algo que no está. */
    noEsta: () => ficha.cerrar(),
  });

  const { abrir: abrirFicha, cerrar: cerrarFicha } = ficha;
  const ver = useCallback((t: Turno) => abrirFicha(t.id), [abrirFicha]);
  const cerrar = useCallback(() => {
    cerrarResumen();
    if (desdeUrl) {
      setDesdeUrl(false);
      cerrarFicha();
    }
  }, [cerrarResumen, desdeUrl, cerrarFicha]);

  return { ver, cerrar };
}
