"use client";

/**
 * Los avisos de Cámaras en UNA línea (Brandon 10-10: tres avisos amarillos
 * apilados ocupaban 174 px antes de la primera cámara). Se ve el más grave y
 * «N avisos» despliega el resto, cada uno con su ⓘ.
 *
 * Orden por gravedad: la dirección (sin ella no llega NINGUNA foto) → la
 * cámara callada (una que no manda) → la IA sin clave (llegan, sin leer).
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { CalladasAviso, DireccionAviso, SinIaAviso } from "./AvisosCamaras";
import type { EstadoDireccion } from "./camaras-ui";
import type { CamaraConConexion } from "./ConectarCamaraModal";

/** La dirección impide que llegue cualquier foto (túnel cerrado o la de esta PC). */
const direccionConProblema = (e: EstadoDireccion) => e.tipo === "tunel-caido" || e.tipo === "local";

/**
 * Todos los avisos en UNA línea: el más grave a la vista y «+N» para el resto.
 * `conDireccionOk`: en «Cámaras» la dirección pública activa también se dice
 * (en verde, al final de la lista), porque ahí es donde se la copia.
 */
export default function AvisosEnUnaLinea({
  estado,
  calladas,
  sinIa,
  conDireccionOk = false,
}: {
  estado: EstadoDireccion;
  calladas: CamaraConConexion[];
  sinIa: boolean;
  conDireccionOk?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  type Clave = "direccion" | "calladas" | "ia" | "ok";
  const claves: Clave[] = [];
  if (direccionConProblema(estado)) claves.push("direccion");
  if (calladas.length > 0) claves.push("calladas");
  if (sinIa) claves.push("ia");
  const problemas = claves.length;
  const okDireccion = conDireccionOk && (estado.tipo === "tunel" || estado.tipo === "fija");
  if (okDireccion) claves.push("ok");
  if (claves.length === 0) return null;

  const resto = claves.length - 1;
  const idLista = "camaras-avisos-resto";
  const desplegar =
    resto > 0 ? (
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idLista}
        title={abierto ? "Esconder los otros avisos" : "Ver los otros avisos"}
        className="inline-flex h-12 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        <span className="tabular-nums">{problemas > 1 ? `${problemas} avisos` : `+${resto}`}</span>
        <ChevronDown className={`h-4 w-4 transition ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
    ) : null;

  const pintar = (c: Clave, extra?: ReactNode) => {
    if (c === "direccion" || c === "ok")
      return <DireccionAviso key={c} estado={estado} extra={extra} />;
    if (c === "calladas") return <CalladasAviso key={c} calladas={calladas} extra={extra} />;
    return <SinIaAviso key={c} extra={extra} />;
  };

  return (
    <div className="space-y-1.5" data-testid="camaras-avisos">
      {pintar(claves[0], desplegar)}
      {abierto && resto > 0 && (
        <div id={idLista} className="space-y-1.5">
          {claves.slice(1).map((c) => pintar(c))}
        </div>
      )}
    </div>
  );
}
