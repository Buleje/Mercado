"use client";

/**
 * El Anexo 04 de los días MARCADOS en la tira, combinados (Brandon, 2026-09-23:
 * *«cuando se selecciona según el check los días quiero que aparezca opción de
 * Anexo 4 y se hará ese anexo según lo seleccionado, se combinará»*).
 *
 * Junta los paquetes de todos los días marcados —respetando los dueños que se
 * dejaron en los chips— en UNA lectura (`?resumenJornadas=1&paquetes=1`) y abre
 * el `Anexo04Modal` de siempre con esas piezas: el formato oficial no cambia ni
 * un casillero, sólo de dónde salen las filas.
 *
 * Un paquete sin escuadría NO entra (una medida inventada en una declaración
 * jurada es peor que una fila menos) y se dice dos veces: en la barra de los
 * días marcados y en el checklist del anexo, donde se mira antes de firmar.
 */

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { AvisoAnexo04 } from "@/lib/forestal/anexo04-validacion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { DuenosPorDia } from "@/lib/forestal/resumen-de-jornadas";
import { avisoSinEscuadria, piezasDeLasCorridas } from "@/lib/forestal/piezas-del-dia";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { leerJornadasConPaquetes } from "./hooks/use-jornadas-con-paquetes";
import { ActionToasts, useActionToasts } from "./cubicador-toasts";
import EncimaDeRadix from "@/components/admin/shared/encima-de-radix";

/* Perezoso: la tira vive también en consumos y despachos, que nunca lo abren. */
const Anexo04Modal = dynamic(() => import("./Anexo04Modal"), { ssr: false });

/** La clave de lo marcado: con otra selección, el aviso de antes ya no habla de ella. */
export const claveDeLaSeleccion = (dias: readonly string[], duenos: DuenosPorDia) =>
  `${[...dias].sort().join(",")}|${JSON.stringify(duenos)}`;

export function useAnexoDeLosDias() {
  const [abierto, setAbierto] = useState<{
    piezas: PiezaCubicada[];
    avisos: AvisoAnexo04[];
    rotulo: string;
  } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<{ clave: string; texto: string } | null>(null);

  const abrir = useCallback(async (dias: readonly string[], duenos: DuenosPorDia) => {
    const clave = claveDeLaSeleccion(dias, duenos);
    setCargando(true);
    setAviso(null);
    try {
      const r = await leerJornadasConPaquetes(dias, duenos);
      const { piezas, sinEscuadria } = piezasDeLasCorridas(r.detalle);
      const falta = avisoSinEscuadria(sinEscuadria, fmtM3, {
        adonde: "en el anexo",
        como: "cárgala en «Ver qué salió ese día» o en Productos disponibles",
      });
      if (piezas.length === 0) {
        setAviso({
          clave,
          texto:
            r.detalle.length === 0
              ? "Esos días no tienen corridas declaradas: no hay piezas para el Anexo 04."
              : `No hay piezas para el Anexo 04. ${falta ?? "Sus paquetes no tienen piezas."}`,
        });
        return;
      }
      if (falta) setAviso({ clave, texto: falta });
      const orden = [...dias].sort();
      setAbierto({
        piezas,
        avisos: falta ? [{ nivel: "aviso", mensaje: falta }] : [],
        /* Lo que el selector de piezas del anexo dice que tiene adentro. */
        rotulo: `${orden.length === 1 ? "El" : "Días marcados:"} ${orden.map((d) => etiquetaLarga(d)).join(" · ")}`,
      });
    } catch (e) {
      setAviso({
        clave,
        texto: `No se pudieron leer los paquetes: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setCargando(false);
    }
  }, []);

  const cerrar = useCallback(() => setAbierto(null), []);
  /** El aviso de ESTA selección (el de otra ya no aplica). */
  const avisoDe = (dias: readonly string[], duenos: DuenosPorDia) =>
    aviso && aviso.clave === claveDeLaSeleccion(dias, duenos) ? aviso.texto : null;

  return { abierto, cargando, abrir, cerrar, avisoDe };
}

/**
 * El anexo, en un portal al `body` y un peldaño arriba de los modales a mano:
 * la tira vive dentro de «Producir sin lote», que se mueve con `translate` —un
 * `fixed` adentro quedaría atado a esa caja— y va en `z-modal-2`, por encima
 * del `z-modal` con el que nace el anexo.
 */
export default function CtpAnexoDeLosDias({
  piezas,
  avisos,
  rotulo,
  onCerrar,
}: {
  piezas: PiezaCubicada[];
  avisos: AvisoAnexo04[];
  rotulo: string;
  onCerrar: () => void;
}) {
  /* Lo que el anexo avisa al bajar el PDF o el Excel: en el mismo peldaño, o
     quedaría detrás de su propio velo. */
  const { toasts, push, dismiss } = useActionToasts();
  /* En una capa de Radix: desde «Registrar producción» (AdminModal) un portal
     suelto quedaba sin clics ni foco (revisión 23-09). */
  return (
    <EncimaDeRadix titulo={`Anexo 04 · ${rotulo}`}>
      <div className="relative z-modal-3">
        <Anexo04Modal
          rows={piezas}
          avisosExtra={avisos}
          rotuloDeLasPiezas={rotulo}
          onCerrar={onCerrar}
          onAviso={(msg, tono) => push({ tono, msg })}
        />
        <ActionToasts toasts={toasts} onDismiss={dismiss} />
      </div>
    </EncimaDeRadix>
  );
}
