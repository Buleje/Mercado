"use client";

/**
 * «Pago» de la guía (ADR-437 §5-§7).
 *
 * El estado (pagada · parcial · sin pagar) se DERIVA de la cuenta del
 * proveedor: nunca se guarda. Un pago es una liquidación (ADR-413) — código
 * LIQ, caja una sola vez, anulable, con su papel — con esta guía imputada y la
 * foto del comprobante en el almacén privado (ADR-434). No hay un tercer
 * camino de pago.
 *
 * «¿Cuánto le debo?» tiene UNA respuesta: la de «Cuenta por persona». Acá se
 * escribe en palabras: por sus guías le debes X · de adelantos te debe Y.
 */

import { useState } from "react";
import { HandCoins, Wallet } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  METODO_PAGO_LABEL,
  type DesgloseCubierto,
  type MetodoPagoGuia,
  type PlataDeGuiaDTO,
} from "@/lib/forestal/plata-de-guia";
import type { usePagoDeGuia } from "@/hooks/use-plata-de-guia";
import { Btn } from "../ctp-shared";
import { Bloque, ChipPago, diaCorto, soles } from "./comun";
import FormPago from "./FormPago";

type Pago = ReturnType<typeof usePagoDeGuia>;

/** «pagado S/ 500 · cruzado con adelantos S/ 300 · con aserrío u otros cargos S/ 200» — sólo lo que no es cero. */
function DesglosePago({ d }: { d: DesgloseCubierto | undefined }) {
  if (!d) return null; // respuestas de antes no lo traen
  const partes = [
    { k: "pagado", rotulo: "pagado", v: d.pagado },
    { k: "cruzado", rotulo: "cruzado con adelantos", v: d.cruzado },
    { k: "otros", rotulo: "con aserrío u otros cargos", v: d.otros },
  ].filter((p) => p.v > 0.005);
  if (partes.length === 0) return null;
  return (
    <p className="text-[var(--text-secondary)]">
      {partes.map((p, i) => (
        <span key={p.k}>
          {i > 0 && " · "}
          {p.rotulo} <span className="tabular-nums text-[var(--text-primary)]">{soles(p.v)}</span>
        </span>
      ))}
    </p>
  );
}

export default function SeccionPago({
  dto,
  pago,
  onPagado,
}: {
  dto: PlataDeGuiaDTO;
  pago: Pago;
  /** Tras un pago bueno: releer la guía (el estado es derivado). */
  onPagado: (codigo?: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const est = dto.pago;
  const persona = dto.persona;

  return (
    <Bloque
      titulo={
        <>
          <Wallet className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          <span>Pago</span>
          <InfoTip
            title="Estado de pago"
            what="Sale de la cuenta del proveedor: lo que cubre esta guía —plata que le pagaste, cruces con sus adelantos y otros cargos a su nombre, como un aserrío que le prestaste—. Lo que no nombra guía cubre por antigüedad (de la más vieja a la más nueva)."
            affects="Un pago es una liquidación LIQ: se anula desde Cuenta por persona. «Pagado» en la Cuenta cuenta sólo la plata y los cruces."
            example="Madera S/ 1 000 · le pagaste S/ 500 · cruce S/ 300 · aserrío prestado S/ 200 → cubierto S/ 1 000."
          />
        </>
      }
      extra={est ? <ChipPago estado={est.estado} /> : null}
    >
      {!dto.cuenta || !est ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {dto.proveedor || dto.cuenta
            ? "Guarda el costo anotado en su cuenta y acá vas a llevar el pago."
            : "Elige a quién le pagas y guarda el costo: sin eso no hay pago que llevar."}
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[var(--text-secondary)]">
              {/* «Cubierto», no «Pagado»: incluye cruces y otros cargos. La
                  sección Cuenta llama «Pagado» sólo a la plata + cruces. */}
              Cubierto{" "}
              <span className="font-bold tabular-nums text-[var(--text-primary)]">
                {soles(est.pagado)}
              </span>{" "}
              de <span className="tabular-nums">{soles(est.monto)}</span>
              {est.cubiertoPorAntiguedad > 0 && (
                <> · {soles(est.cubiertoPorAntiguedad)} por antigüedad</>
              )}
            </span>
            {est.pendiente > 0.005 && (
              <span className="font-bold tabular-nums text-[var(--data-warning-ink)]">
                Falta {soles(est.pendiente)}
              </span>
            )}
          </div>
          {est.pagado > 0 && <DesglosePago d={est.desglose} />}
          {est.excedente > 0 && (
            <p className="text-[var(--text-secondary)]">
              Se le pagó {soles(est.excedente)} de más en esta guía: cubre otras por antigüedad.
            </p>
          )}

          {pago.liquidaciones.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-[var(--surface-sunken)] p-2">
              {pago.liquidaciones.map((l) => (
                <li
                  key={l.id}
                  className={`flex items-baseline justify-between gap-2 ${l.anulada ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-secondary)]"}`}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-bold text-[var(--text-primary)]">{l.codigo}</span> ·{" "}
                    {diaCorto(l.fecha)}
                    {l.pago
                      ? ` · ${METODO_PAGO_LABEL[l.pago.metodo as MetodoPagoGuia] ?? l.pago.metodo}`
                      : ""}
                    {l.anulada ? " · anulada" : ""}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">
                    {soles((l.pago?.monto ?? 0) + (l.compensado ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {est.pendiente > 0.005 && !abierto && (
            <Btn size="sm" variant="primary" onClick={() => setAbierto(true)}>
              <HandCoins className="h-4 w-4" aria-hidden /> Registrar pago
            </Btn>
          )}
          {abierto && (
            <FormPago
              dto={dto}
              pago={pago}
              pendiente={est.pendiente}
              onCancelar={() => setAbierto(false)}
              onListo={(codigo) => {
                setAbierto(false);
                onPagado(codigo);
              }}
            />
          )}
        </div>
      )}

      {persona && (
        <p className="mt-2 border-t border-[var(--rule-soft)] pt-2 text-sm text-[var(--text-secondary)]">
          Por sus guías le debes{" "}
          <span className="font-bold tabular-nums text-[var(--text-primary)]">
            {soles(Math.max(0, persona.porGuias))}
          </span>
          {persona.deAdelantos != null && (
            <>
              {" "}
              · de adelantos te debe{" "}
              <span className="font-bold tabular-nums text-[var(--text-primary)]">
                {soles(Math.max(0, persona.deAdelantos))}
              </span>
            </>
          )}{" "}
          · neto:{" "}
          {persona.neto < 0
            ? `le debes ${soles(-persona.neto)}`
            : persona.neto > 0
              ? `te debe ${soles(persona.neto)}`
              : "a mano"}
        </p>
      )}
    </Bloque>
  );
}
