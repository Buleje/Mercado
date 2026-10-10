"use client";

/**
 * «Documentos» de un plan que YA existe: al editarlo y en su pestaña de la
 * vista del plan. Todo va al servidor en el momento —subir, vencimiento,
 * carpetas nuevas— con el mismo pipeline del módulo Documentos, y la vista
 * previa es el visor de Documentos (encima del modal del plan, sin perderlo).
 *
 * El hook lo instancia quien monta (`docs`): la vista del plan lo necesita
 * también para la cifra de la pestaña, y dos consultas de lo mismo en la misma
 * pantalla pueden contestar distinto.
 */

import { useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { DocumentosDelPlan } from "../hooks/use-plan-documentos";
import PlanDocumentosSeccion from "./PlanDocumentosSeccion";
import VistaPreviaDoc from "./VistaPreviaDoc";
import type { AccionesDocs, DatosDelPlan } from "./acciones";

export default function PlanDocumentosDelPlan({
  planId,
  docs,
  delPlan,
}: {
  planId: string;
  docs: DocumentosDelPlan;
  /** Si no viene, lo que el plan ya guarda sale de la vista del servidor. */
  delPlan?: DatosDelPlan;
}) {
  const { confirm } = useConfirm();
  const [verId, setVerId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);

  if (!docs.disponible) return null;

  const informar = (motivo: string | null) => setAviso(motivo);

  const acciones: AccionesDocs = {
    modo: "plan",
    planId,
    ocupado: docs.ocupado,
    subidas: docs.subidas,
    subir: (files, carpeta, casillero) => {
      setAviso(null);
      void docs.subir(files, carpeta, casillero);
    },
    cambiarVence: (archivo, fecha) => {
      if (archivo.documentId) void docs.cambiarVencimiento(archivo.documentId, fecha).then(informar);
    },
    quitar: async (archivo) => {
      if (!archivo.documentId) return;
      const ok = await confirm({
        title: `¿Quitar «${archivo.nombre}»?`,
        description: "Va a la papelera de Documentos: desde ahí se recupera si fue un error.",
        intent: "warning",
        confirmLabel: "Sí, quitarlo",
      });
      if (ok) informar(await docs.papelera(archivo.documentId));
    },
    ver: (archivo) => setVerId(archivo.documentId),
    descartarSubida: docs.descartarSubida,
    crearCarpeta: async (nombre, paraTodos) => {
      const { error, clave } = await docs.crearCarpeta(nombre, paraTodos);
      // La recién creada queda elegida: es donde se va a subir lo siguiente.
      if (!error && clave) setElegida(clave);
      return error;
    },
    renombrar: (carpeta, nombre) => docs.renombrarCarpeta(carpeta.clave, nombre),
    mover: (carpeta, paso) => docs.moverCarpeta(docs.carpetas, carpeta.clave, paso),
    quitarCarpeta: async (carpeta) => {
      const ok = await confirm({
        title: `¿Quitar «${carpeta.nombre}» de la lista?`,
        description:
          "Deja de aparecer en los documentos de los planes. La carpeta y sus archivos siguen en Documentos: no se borra nada.",
        intent: "warning",
        confirmLabel: "Sí, quitarla",
      });
      return ok ? docs.quitarCarpeta(carpeta) : null;
    },
    adoptar: (carpeta, paraTodos) => (carpeta.folderId ? docs.adoptar(carpeta.folderId, paraTodos) : Promise.resolve(null)),
    crearCasillero: (carpeta, input) => docs.crearCasillero(carpeta.clave, input),
  };

  return (
    <>
      <PlanDocumentosSeccion
        carpetas={docs.carpetas}
        acciones={acciones}
        delPlan={delPlan ?? docs.vista?.delPlan ?? { resolucionNumber: null, resolucionDate: null, representanteLegal: null, propietarioNombre: null }}
        cargando={docs.cargando}
        error={docs.error}
        aviso={aviso}
        elegida={elegida}
        onElegir={setElegida}
      />
      <VistaPreviaDoc docId={verId} onClose={() => setVerId(null)} onCambio={() => void docs.recargar()} />
    </>
  );
}
