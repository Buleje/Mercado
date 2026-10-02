"use client";

/**
 * «Datos de la guía» en la vista previa de «Importar guías despachadas»
 * (ADR-461, 02-10 noche — Brandon: «estarán todos los datos y detalles de la
 * guía»). La MISMA hoja de casilleros que el alta de un ingreso del CTP desde
 * SERFOR (`CtpGuiaSerforHoja`: la guía, el propietario, el destinatario, el
 * transportista y el cuadro de productos 37), con la ficha ya reparada, y
 * arriba el traslado en una línea: de dónde sale y a dónde llega.
 *
 * Plegada: con 20 guías en la vista previa, 20 hojas abiertas serían un muro.
 * Se dibuja recién al abrirla.
 */

import { useState } from "react";
import { MapPin } from "@buleje/design-system/icons";
import { componerPunto } from "@/lib/forestal/ctp-gtf-datos";
import { placasDeLaGuia, sinRaya } from "@/lib/forestal/loth-importar-guia";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import CtpGuiaSerforHoja from "./CtpGuiaSerforHoja";

/** De dónde sale (el origen del recurso, casilleros 10-12) y a dónde llega (el destinatario, 25-28). */
export function trasladoDeLaFicha(f: GtfSerfor): { partida: string; llegada: string } {
  return {
    partida: componerPunto({ direccion: "", distrito: sinRaya(f.distrito), provincia: sinRaya(f.provincia), departamento: sinRaya(f.departamento) }),
    llegada: componerPunto({
      direccion: sinRaya(f.destinatarioDireccion),
      distrito: sinRaya(f.destinatarioDistrito),
      provincia: sinRaya(f.destinatarioProvincia),
      departamento: sinRaya(f.destinatarioDepartamento),
    }),
  };
}

export function TrasladoDeLaFicha({ ficha }: { ficha: GtfSerfor }) {
  const { partida, llegada } = trasladoDeLaFicha(ficha);
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-[var(--rule-base)] px-3.5 py-2.5 text-sm sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> Punto de partida · origen del recurso
        </dt>
        <dd className="break-words font-semibold text-[var(--text-primary)]">{partida || "—"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> Llegada · destinatario
        </dt>
        <dd className="break-words font-semibold text-[var(--text-primary)]">{llegada || "—"}</dd>
      </div>
    </dl>
  );
}

export default function LothImportarGuiasDatos({ ficha }: { ficha: GtfSerfor }) {
  const [abierta, setAbierta] = useState(false);
  const placa = placasDeLaGuia(ficha.placa).placa;
  const viaje = [sinRaya(ficha.titular), sinRaya(ficha.destinatario)].filter(Boolean).join(" → ");
  const resumen = [viaje, placa].filter(Boolean).join(" · ");
  return (
    <details className="border-t border-[var(--rule-soft)]" onToggle={(e) => setAbierta(e.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 px-3 py-1 text-sm font-semibold text-[var(--text-primary)]">
        Datos de la guía
        {resumen && <span className="min-w-0 font-normal text-[var(--text-secondary)] [overflow-wrap:anywhere]">· {resumen}</span>}
      </summary>
      {abierta && (
        <div className="space-y-3 px-3 pb-3">
          <TrasladoDeLaFicha ficha={ficha} />
          <CtpGuiaSerforHoja gtf={ficha} recordarComo="loth:importar:ver-casilleros-guia" casillerosAbiertos />
        </div>
      )}
    </details>
  );
}
