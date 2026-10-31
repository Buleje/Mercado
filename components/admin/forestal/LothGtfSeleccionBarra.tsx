"use client";

/**
 * La barra de las guías tildadas en la vista GTF del Libro TH: cuenta lo
 * elegido (guías, m³ vigentes, piezas) y ofrece los formatos de Trámites que
 * aceptan guías (`GuiasAFormatoBarra`, la misma que usa «Guías emitidas» del
 * CTP). Los ids del Libro TH viajan SIN prefijo: así eran las URLs desde el
 * primer día (`tramite-guias-url`).
 *
 * Con guías de 2+ permisos avisa antes de salir del libro «van N permisos → N
 * oficios» (08-10): la Relación arma un oficio por permiso.
 */

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { avisoDePermisos, permisosDeLasGuias } from "@/lib/forestal/tramites-permiso";
import { permisoDeLaGuiaGtf } from "./gtf-acciones-menu";
import type { CifraSeleccion } from "./ctp-barra-seleccion";
import type { Gtf } from "./gtf-tabla-columnas";
import GuiasAFormatoBarra from "./GuiasAFormatoBarra";
import { accionesConFormatoVarias, fuenteLoth, useGtfConFormatoVarias } from "./hooks/use-gtf-con-formato";

export default function LothGtfSeleccionBarra({ elegidas, onLimpiar }: { elegidas: readonly Gtf[]; onLimpiar: () => void }) {
  const aviso = useMemo(
    () => avisoDePermisos(permisosDeLasGuias(elegidas.map((g) => ({ gtfNumber: g.gtfNumber, status: g.status, tituloHabilitante: permisoDeLaGuiaGtf(g) })))),
    [elegidas],
  );
  /* 27-10: las tildadas en UN PDF con formato (guía + lista de cada una); las anuladas no salen. */
  const varias = useGtfConFormatoVarias(useMemo(() => elegidas.map(fuenteLoth), [elegidas]));
  useEffect(() => {
    if (varias.error) toast.error(varias.error);
  }, [varias.error]);
  if (elegidas.length === 0) return null;

  const anuladas = elegidas.filter((g) => g.status === "anulada").length;
  /* Vista previa: el volumen que declara el libro lo da el servidor. */
  const volumen = elegidas.filter((g) => g.status !== "anulada").reduce((a, g) => a + Number(g.volumenTotalM3 ?? 0), 0);
  const piezas = elegidas.reduce((a, g) => a + (g.piezasTotal ?? g.items?.length ?? 0), 0);
  const cifras: CifraSeleccion[] = [
    { label: elegidas.length === 1 ? "Guía" : "Guías", valor: anuladas > 0 ? `${elegidas.length} (${anuladas} anulada${anuladas === 1 ? "" : "s"})` : String(elegidas.length), fuerte: true },
    { label: "Volumen", valor: `${fmtM3(volumen)} m³` },
    { label: "Piezas", valor: String(piezas) },
  ];

  return <GuiasAFormatoBarra elegidas={elegidas} refs={elegidas.map((g) => g.id)} cifras={cifras} onLimpiar={onLimpiar} aviso={aviso} conFormato={accionesConFormatoVarias(varias)} />;
}
