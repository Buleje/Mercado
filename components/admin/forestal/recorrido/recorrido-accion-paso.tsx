"use client";

import type { ReactNode } from "react";
import { BookOpen, FileText, Loader2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { BloqueDistribuido, BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { DatoSerfor, PasoEnPantalla } from "@/lib/forestal/recorrido-pantalla";
import type { botonRegistrar } from "@/lib/forestal/recorrido-pantalla";
import RepartoElegirTrozas from "../reparto-elegir-trozas";
import AnexoAlLibro from "../reparto-anexo-al-libro";
import DatosListosDelGrupo from "../saldos/datos-listos-del-grupo";
import DatosParaSerfor from "./datos-para-serfor";

/**
 * La acción propia de cada paso, reusando los flujos que ya existen:
 *  · Datos listos → «Datos listos del grupo» (recibir la madera, ponerle permiso).
 *  · Elegir las trozas → el mismo selector de la Distribución.
 *  · Lote / Consumo y producción → UN botón que pide al servidor ambos pasos.
 *  · Anexo 04 → abre el anexo del bloque.
 *  · Salida → datos para SERFOR + «Del anexo al libro» (ADR-446).
 */

type Aplicar = (bloqueId: string, cambio: (b: BloqueRolliza) => BloqueRolliza) => void;

export interface AccionesDelRecorrido {
  bd: BloqueDistribuido;
  distribucionId: string;
  aplicar: Aplicar;
  patio: readonly TrozaConsumible[];
  /** Algo se arregló afuera (guía recibida, permiso puesto): releer patio y recorrido. */
  onCambio: () => void;
  piezas: readonly PiezaCubicada[];
  /** Con `emitidoId` abre ESE anexo ya guardado (para ver o ponerle la GTF), no uno en blanco. */
  abrirAnexo?: (emitidoId?: string) => void;
  /** El anexo guardado del permiso (el del paso «Anexo 04»), si ya hay. */
  anexoGuardadoId?: string;
  registrar: ReturnType<typeof botonRegistrar>;
  /** En qué paso va el botón: «lote» hasta que el lote exista, después «jornadas». */
  pasoDelBoton: "lote" | "jornadas";
  ejecutando: boolean;
  onRegistrar: () => void;
  serfor: { datos: readonly DatoSerfor[]; cargando: boolean; recargar: () => void };
}

function BotonAnexo({ abrir, etiqueta }: { abrir?: () => void; etiqueta: string }) {
  if (!abrir) return null;
  return (
    <button type="button" onClick={abrir} className={button({ variant: "secondary", size: "sm" })}>
      <FileText className="h-4 w-4" aria-hidden /> {etiqueta}
    </button>
  );
}

/** Si el paso tiene algo que hacer acá (sin eso, el paso no ofrece «Ver»). */
export function tieneAccion(paso: PasoEnPantalla, a: AccionesDelRecorrido): boolean {
  const conTrozas = (a.bd.bloque.trozaIds ?? []).length > 0;
  switch (paso.paso) {
    case "datos":
    case "trozas":
      return conTrozas;
    case "lote":
    case "jornadas":
      return paso.paso === a.pasoDelBoton && a.registrar.mostrar;
    case "anexo":
      return paso.estado !== "no_aplica" && Boolean(a.abrirAnexo);
    case "salida":
      return paso.estado !== "no_aplica";
    default:
      return false;
  }
}

export default function RecorridoAccionPaso({ paso, a }: { paso: PasoEnPantalla; a: AccionesDelRecorrido }): ReactNode {
  const trozaIds = a.bd.bloque.trozaIds ?? [];
  switch (paso.paso) {
    case "datos":
      return trozaIds.length > 0 ? <DatosListosDelGrupo trozaIds={trozaIds} patio={a.patio} onCambio={a.onCambio} /> : null;

    case "trozas":
      return trozaIds.length > 0 ? <RepartoElegirTrozas bd={a.bd} distribucionId={a.distribucionId} aplicar={a.aplicar} onGuardado={a.onCambio} /> : null;

    case "lote":
    case "jornadas": {
      if (paso.paso !== a.pasoDelBoton || !a.registrar.mostrar) return null;
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            data-recorrido-registrar
            onClick={a.onRegistrar}
            disabled={!a.registrar.activo || a.ejecutando}
            aria-busy={a.ejecutando}
            className={button({ variant: "primary" })}
          >
            {a.ejecutando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BookOpen className="h-4 w-4" aria-hidden />}
            {a.ejecutando ? "Registrando en el Libro…" : a.registrar.etiqueta}
          </button>
          {a.registrar.motivo && <span className="text-sm text-[var(--text-secondary)]">{a.registrar.motivo}</span>}
        </div>
      );
    }

    case "anexo":
      return paso.estado === "no_aplica" ? null : <BotonAnexo abrir={a.abrirAnexo ? () => a.abrirAnexo?.(paso.estado === "hecho" ? a.anexoGuardadoId : undefined) : undefined} etiqueta={paso.estado === "hecho" ? "Ver el Anexo 04" : "Abrir el Anexo 04"} />;

    case "salida":
      if (paso.estado === "no_aplica") return null;
      return (
        <div className="space-y-3">
          <DatosParaSerfor datos={a.serfor.datos} cargando={a.serfor.cargando} />
          <div className="space-y-2 rounded-xl border border-[var(--rule-base)] px-3 py-2">
            <span className="block text-sm font-bold text-[var(--text-primary)]">Cuando SERFOR te dé el N° de la GTF</span>
            <span className="block text-sm text-[var(--text-secondary)]">Ponlo en el Anexo 04 y pásalo al Libro: la salida queda atada a este permiso.</span>
            <div className="flex flex-wrap items-center gap-2">
              <BotonAnexo abrir={a.abrirAnexo ? () => a.abrirAnexo?.(a.anexoGuardadoId) : undefined} etiqueta="Poner el N° de GTF en el Anexo 04" />
            </div>
            {a.piezas.length > 0 && <AnexoAlLibro piezas={a.piezas} permiso={a.bd.bloque.permiso ?? null} />}
          </div>
        </div>
      );

    default:
      return null;
  }
}
