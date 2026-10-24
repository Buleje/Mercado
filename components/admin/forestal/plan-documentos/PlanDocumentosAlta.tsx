"use client";

/**
 * «Documentos» mientras se CREA el plan: todavía no hay id, ni carpeta en el
 * Drive donde subir. Lo que se carga queda en memoria (los `File` incluidos,
 * con su carpeta y su casillero) y lo escribe `guardarDocumentosPendientes`
 * cuando el plan se guarda. El estado vive en el formulario del plan, que es
 * quien decide cuándo guardar y cuándo preguntar antes de cerrar.
 */

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { SEMILLA, usePlantillaAlta } from "../hooks/use-plan-documentos";
import PlanDocumentosSeccion from "./PlanDocumentosSeccion";
import { carpetasDelAlta } from "./modelo";
import { idLocal, type PendientesDocumentos } from "./pendientes";
import type { AccionesDocs, DatosDelPlan } from "./acciones";

export default function PlanDocumentosAlta({
  pendientes,
  onPendientes,
  delPlan,
}: {
  pendientes: PendientesDocumentos;
  onPendientes: (fn: (p: PendientesDocumentos) => PendientesDocumentos) => void;
  delPlan: DatosDelPlan;
}) {
  const { plantilla, cargando, error, disponible, hoy } = usePlantillaAlta({ semilla: SEMILLA });
  const { confirm } = useConfirm();
  const [elegida, setElegida] = useState<string | null>(null);
  const carpetas = useMemo(() => carpetasDelAlta(plantilla, pendientes, hoy), [plantilla, pendientes, hoy]);

  if (!disponible) return null;

  const acciones: AccionesDocs = {
    modo: "alta",
    planId: null,
    ocupado: false,
    subidas: [],
    subir: (files, carpeta, casillero) =>
      onPendientes((p) => ({
        ...p,
        archivos: [
          ...p.archivos,
          ...files.map((file) => ({
            id: idLocal("arch"),
            file,
            carpetaClave: carpeta.clave,
            casillero: casillero ? { id: casillero.campoId, clave: casillero.clave, nombre: casillero.nombre } : null,
            vence: null,
          })),
        ],
      })),
    cambiarVence: (archivo, fecha) =>
      onPendientes((p) => ({ ...p, archivos: p.archivos.map((a) => (a.id === archivo.key ? { ...a, vence: fecha } : a)) })),
    quitar: (archivo) => onPendientes((p) => ({ ...p, archivos: p.archivos.filter((a) => a.id !== archivo.key) })),
    ver: (archivo) => {
      const a = pendientes.archivos.find((x) => x.id === archivo.key);
      if (!a) return;
      /* Todavía no está en el Drive: se abre el archivo local tal cual. */
      const url = URL.createObjectURL(a.file);
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    descartarSubida: () => {},
    crearCarpeta: async (nombre, paraTodosLosPlanes) => {
      const clave = idLocal("nueva");
      onPendientes((p) => ({ ...p, carpetas: [...p.carpetas, { clave, nombre, paraTodosLosPlanes }] }));
      setElegida(clave);
      return null;
    },
    renombrar: async (carpeta, nombre) => {
      onPendientes((p) => ({ ...p, carpetas: p.carpetas.map((c) => (c.clave === carpeta.clave ? { ...c, nombre } : c)) }));
      return null;
    },
    quitarCarpeta: async (carpeta) => {
      const archivos = pendientes.archivos.filter((a) => a.carpetaClave === carpeta.clave).length;
      if (archivos > 0) {
        const ok = await confirm({
          title: `¿Quitar «${carpeta.nombre}»?`,
          description: `Tiene ${archivos} ${archivos === 1 ? "archivo" : "archivos"} por subir: se quitan con ella. Todavía no se subió nada.`,
          intent: "warning",
          confirmLabel: "Sí, quitarla",
        });
        if (!ok) return null;
      }
      onPendientes((p) => {
        const { [carpeta.clave]: _fuera, ...datos } = p.datos;
        void _fuera;
        return {
          carpetas: p.carpetas.filter((c) => c.clave !== carpeta.clave),
          casilleros: p.casilleros.filter((k) => k.carpetaClave !== carpeta.clave),
          archivos: p.archivos.filter((a) => a.carpetaClave !== carpeta.clave),
          datos,
        };
      });
      setElegida(null);
      return null;
    },
    crearCasillero: async (carpeta, input) => {
      onPendientes((p) => ({
        ...p,
        casilleros: [...p.casilleros, { clave: idLocal("doc"), carpetaClave: carpeta.clave, nombre: input.nombre, descripcion: input.descripcion, soloEstePlan: input.soloEstePlan }],
      }));
      return null;
    },
    datos: pendientes.datos,
    onDatos: (clave, datos) => onPendientes((p) => ({ ...p, datos: { ...p.datos, [clave]: datos } })),
  };

  return (
    <PlanDocumentosSeccion
      carpetas={carpetas}
      acciones={acciones}
      delPlan={delPlan}
      cargando={cargando}
      error={error ? `No se pudo leer la plantilla de carpetas (${error}). Se muestran las sugeridas.` : null}
      elegida={elegida}
      onElegir={setElegida}
    />
  );
}
