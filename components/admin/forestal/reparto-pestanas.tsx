"use client";

/**
 * Las pestañas de la Distribución de rolliza (Brandon, 2026-10-19: «en general
 * en rolliza todo tiene que estar compacto y distribuido con pestañas»).
 *
 * Antes era una sola tira de cinco pantallas: lo que entró, los bloques, el
 * Anexo 04 por permiso, lo que falta y el cierre, uno debajo del otro. Ahora se
 * ve una cosa a la vez y la sección viaja en `?sub=` (se puede compartir el
 * enlace y el «atrás» vuelve a la anterior). Nada se borró: cada bloque de
 * antes vive en una pestaña.
 */

import { useEffect, type ReactNode } from "react";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { EVENTO_IR_AL_ANEXO, ID_SECCION_ANEXO } from "./reparto-registrar-todo";

export const SECCIONES_ROLLIZA = ["entrada", "bloques", "por-distribuir", "anexo", "cierre"] as const;
export type SeccionRolliza = (typeof SECCIONES_ROLLIZA)[number];

const ROTULO: Record<SeccionRolliza, string> = {
  entrada: "Lo que entró",
  bloques: "Bloques",
  "por-distribuir": "Sin marcar",
  anexo: "Anexo 04 por permiso",
  cierre: "Faltante y cierre",
};

const ID_PANEL = "reparto-rolliza";

export function useSeccionRolliza(): { sub: SeccionRolliza; irA: (s: SeccionRolliza) => void } {
  const { vista, irA } = useSubvistaModulo<SeccionRolliza>("forestal-reparto-rolliza", SECCIONES_ROLLIZA, "bloques");
  /* «Ir al Anexo 04» desde el registro en el Libro (`use-tanda-del-libro`). */
  useEffect(() => {
    const abrir = () => irA("anexo");
    window.addEventListener(EVENTO_IR_AL_ANEXO, abrir);
    return () => window.removeEventListener(EVENTO_IR_AL_ANEXO, abrir);
  }, [irA]);
  return { sub: vista, irA };
}

/**
 * La barra y el panel de la sección activa. El ancla del Anexo 04 va en la
 * barra, que siempre está: el salto llega acá y el evento abre la pestaña.
 */
export function PestanasRolliza({
  sub,
  irA,
  porDistribuir,
  conAnexo,
  children,
}: {
  sub: SeccionRolliza;
  irA: (s: SeccionRolliza) => void;
  /** Líneas sin tildar: el número de la pestaña «Sin marcar». */
  porDistribuir: number;
  /** Hay algún Anexo 04 por permiso que armar. */
  conAnexo: boolean;
  children: ReactNode;
}) {
  const secciones = SECCIONES_ROLLIZA.map((clave) => ({
    clave,
    rotulo: ROTULO[clave],
    cuenta: clave === "por-distribuir" && porDistribuir > 0 ? porDistribuir : undefined,
  }));
  return (
    <>
      <div id={conAnexo ? ID_SECCION_ANEXO : undefined} className="mb-3 scroll-mt-4 print:hidden">
        <BarraDeSecciones
          secciones={secciones}
          activa={sub}
          onCambiar={irA}
          etiqueta="Secciones de la distribución de rolliza"
          idPanel={ID_PANEL}
        />
      </div>
      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, sub)}>
        {children}
      </div>
    </>
  );
}
