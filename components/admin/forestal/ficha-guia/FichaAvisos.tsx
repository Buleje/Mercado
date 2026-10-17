/**
 * Lo que hay que mirar ANTES de recibir, una línea por aviso con su acción y
 * el detalle en un ⓘ (Brandon 09-24: aviso = una línea). Sin avisos no dibuja
 * nada: un «todo en orden» permanente enseña a no leer este lugar.
 */

import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { nTrozas } from "@/lib/forestal/acomodar-trozas";
import { BOTON_BLOQUE } from "./comun";

function Aviso({ children, info, accion }: { children: ReactNode; info?: ReactNode; accion?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-ink)]">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
      {info}
      {accion}
    </li>
  );
}

export default function FichaAvisos({
  descuadre,
  enOtraFila,
  vencida,
  onCuadrar,
  onAcomodar,
  ocupado,
}: {
  /** Lo que declara la guía y lo que suman sus trozas, si no cuadran (ADR-353). */
  descuadre: { declarado: number; trozas: number } | null;
  /** Trozas colgadas de la fila de otra especie (ADR-435). */
  enOtraFila: number;
  /** La frase del vencimiento, si la madera viajó o espera con la guía vencida. */
  vencida: string | null;
  onCuadrar?: () => void;
  onAcomodar?: () => void;
  ocupado: boolean;
}) {
  if (!descuadre && enOtraFila === 0 && !vencida) return null;
  return (
    <ul className="space-y-1.5" aria-label="Avisos de la guía">
      {descuadre && (
        <Aviso
          info={
            <InfoTip
              title="La guía no cuadra consigo misma"
              what={`Declara ${fmtM3(descuadre.declarado)} m³ por especie y su lista de trozas suma ${fmtM3(descuadre.trozas)} m³.`}
              affects="Se puede recibir igual —el documento es el que es— pero no se va a poder consumir hasta cuadrarla."
            />
          }
          accion={
            onCuadrar && (
              <button type="button" onClick={onCuadrar} disabled={ocupado} className={BOTON_BLOQUE}>
                <Scale className="h-4 w-4" aria-hidden /> Cuadrar
              </button>
            )
          }
        >
          <b>No cuadra:</b>{" "}
          <span className="font-mono tabular-nums">
            {fmtM3(descuadre.declarado)} m³ declarados · {fmtM3(descuadre.trozas)} m³ en trozas
          </span>
        </Aviso>
      )}
      {enOtraFila > 0 && (
        <Aviso
          info={
            <InfoTip
              icono="ayuda"
              title="Trozas en otra fila"
              what="Esta guía tiene una fila por especie. Cada troza tiene que colgar de la fila de SU especie: si no, el consumo y el descuento del permiso le suman a otra."
              affects="«Acomodar» sólo las cambia de fila dentro de esta guía. No toca lo declarado ni lo ya consumido."
            />
          }
          accion={
            onAcomodar && (
              <button type="button" onClick={onAcomodar} disabled={ocupado} className={BOTON_BLOQUE}>
                <ArrowLeftRight className="h-4 w-4" aria-hidden /> Acomodar trozas
              </button>
            )
          }
        >
          <b>{nTrozas(enOtraFila)}</b> {enOtraFila === 1 ? "está" : "están"} en la fila de otra especie.
        </Aviso>
      )}
      {vencida && <Aviso>{vencida}</Aviso>}
    </ul>
  );
}
