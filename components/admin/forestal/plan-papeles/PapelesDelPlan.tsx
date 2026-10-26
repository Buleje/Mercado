"use client";

/**
 * «Papeles del permiso» (pestaña Papeles del plan): lo que la norma pide para
 * este tipo de plan contra lo que hay en sus carpetas del Archivo (ADR-467).
 *
 * La lista es pura (`loth-plan-papeles`) y se calcula con la misma vista de
 * carpetas que pinta la pestaña: subir acá o en la carpeta de abajo es lo
 * mismo. Cada archivo subido desde una fila lleva `papel:<clave>` y, si es la
 * resolución, la vigencia del plan como vencimiento (entra al aviso «Por
 * vencer» de siempre).
 *
 * Arriba la cabecera con el avance (`PapelesCabecera`); debajo, los papeles
 * agrupados por lo que piden hacer (`PapelesLista`). Cada fila sabe a qué
 * carpeta y casillero va (`destinoDelPapel`): por eso la pestaña ya no repite
 * la fila de chips «lo que falta» de las carpetas.
 */

import { useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { tagPapel, type PapelDelPlan, type PapelesDelPlan as Papeles } from "@/lib/forestal/loth-plan-papeles";
import type { DocumentosDelPlan } from "../hooks/use-plan-documentos";
import { useLlenarResolucion } from "../hooks/use-llenar-resolucion";
import VistaPreviaDoc from "../plan-documentos/VistaPreviaDoc";
import LlenarDesdeResolucion from "./LlenarDesdeResolucion";
import PapelesCabecera from "./PapelesCabecera";
import PapelesLista from "./PapelesLista";
import { destinoDelPapel } from "./papeles-grupos";

const VALEN_LO_QUE_EL_PLAN = new Set(["resolucion", "plan-aprobado"]);

const CAJA_ERROR =
  "rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--text-primary)]";

export default function PapelesDelPlan({
  planId,
  esPlantacion,
  vigenciaHasta,
  papeles,
  docs,
  onPlanCambiado,
  onIrACarpeta,
}: {
  planId: string;
  esPlantacion: boolean;
  /** AAAA-MM-DD o ISO: vencimiento de la resolución subida sin fecha propia. */
  vigenciaHasta: string | null;
  papeles: Papeles | null;
  docs: DocumentosDelPlan;
  onPlanCambiado: () => void | Promise<void>;
  /** Abre la carpeta del papel (y su casillero, si tiene) en «Carpetas del plan». */
  onIrACarpeta?: (carpetaClave: string, casilleroClave: string | null) => void;
}) {
  const [verId, setVerId] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const llenar = useLlenarResolucion({ planId, onGuardado: onPlanCambiado });

  if (!docs.disponible) return null;
  if (!papeles) {
    return docs.error ? (
      <p role="alert" className={CAJA_ERROR}>
        No pude revisar los papeles: {docs.error}
      </p>
    ) : (
      <p role="status" className="flex items-center gap-2 py-4 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Revisando los papeles…
      </p>
    );
  }

  const resolucion = papeles.lista.find((p) => p.clave === "resolucion")?.archivo ?? null;
  /* Con candado para este rol (sin id): no se lee ni se abre. */
  const resolucionId = resolucion?.documentId ?? null;
  const vigencia = vigenciaHasta ? vigenciaHasta.slice(0, 10) : null;

  const subir = async (p: PapelDelPlan, files: File[]) => {
    const destino = destinoDelPapel(p, docs.carpetas);
    if (!destino) {
      setAviso("Este plan todavía no tiene carpetas en el Archivo.");
      return;
    }
    setAviso(null);
    setSubiendo(p.clave);
    try {
      await docs.subir(files, destino.carpeta, destino.casillero, {
        etiquetas: [tagPapel(p.clave)],
        vence: VALEN_LO_QUE_EL_PLAN.has(p.clave) ? vigencia : null,
      });
    } finally {
      setSubiendo(null);
    }
  };

  /* Pasar la vigencia al plan también la deja como vencimiento del archivo,
     si no tenía: así el aviso «Por vencer» de Documentos la ve. */
  const guardar = async () => {
    const r = llenar.estado?.fase === "listo" ? llenar.estado.r : null;
    const hasta = llenar.marcadas.has("vigenciaHasta") ? r?.propuesta.filas.find((f) => f.campo === "vigenciaHasta")?.leido : null;
    const ok = await llenar.guardar();
    if (ok && hasta && resolucionId && !resolucion?.expiresAt) {
      const error = await docs.cambiarVencimiento(resolucionId, hasta);
      if (error) setAviso(`El plan quedó, pero el vencimiento del archivo no: ${error}`);
    }
  };

  /** «Registro de plantación › Resolución o constancia de registro». */
  const destino = (p: PapelDelPlan): string | null => {
    const d = destinoDelPapel(p, docs.carpetas);
    return d ? (d.casillero ? `${d.carpeta.nombre} › ${d.casillero.nombre}` : d.carpeta.nombre) : null;
  };

  const errores = docs.subidas.filter((s) => s.estado === "error");

  return (
    <section data-papeles-plan aria-label="Papeles del permiso" className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <PapelesCabecera
        papeles={papeles}
        esPlantacion={esPlantacion}
        vigencia={vigencia}
        llenar={resolucionId ? { leyendo: llenar.estado?.fase === "leyendo", onLeer: () => void llenar.leer(resolucionId) } : null}
      />

      {(aviso || errores.length > 0) && (
        <p role="alert" className={CAJA_ERROR}>
          {aviso ?? errores.map((e) => `${e.nombre}: ${e.motivo ?? "no subió"}`).join(" · ")}
        </p>
      )}

      <PapelesLista
        lista={papeles.lista}
        destino={destino}
        subiendo={subiendo}
        bloqueado={subiendo != null || docs.ocupado}
        onSubir={(p, files) => void subir(p, files)}
        onVer={setVerId}
        onIrACarpeta={
          onIrACarpeta
            ? (p) => {
                const d = destinoDelPapel(p, docs.carpetas);
                if (d) onIrACarpeta(d.carpeta.clave, d.casillero?.clave ?? null);
              }
            : undefined
        }
      />

      <VistaPreviaDoc docId={verId} onClose={() => setVerId(null)} onCambio={() => void docs.recargar()} />
      <LlenarDesdeResolucion llenar={llenar} nombreArchivo={resolucion?.nombre ?? "el papel"} onGuardar={() => void guardar()} />
    </section>
  );
}
