"use client";

/**
 * «Registrar pago» de una guía, en línea (ADR-437 §6): una liquidación LIQ con
 * la guía imputada. El monto arranca en lo pendiente; «Descontar de lo
 * adelantado» sólo aparece si la persona es la MISMA en las dos libretas.
 */

import { useId, useState } from "react";
import { HandCoins, Loader2 } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import {
  METODOS_PAGO,
  METODO_PAGO_LABEL,
  type MetodoPagoGuia,
  type PlataDeGuiaDTO,
} from "@/lib/forestal/plata-de-guia";
import type { FotoCarga } from "@/lib/forestal/fotos-carga";
import type { usePagoDeGuia } from "@/hooks/use-plata-de-guia";
import CtpFotosDelIngreso from "../CtpFotosDelIngreso";
import { Btn } from "../ctp-shared";
import { CAMPO, ROTULO, soles } from "./comun";

type Pago = ReturnType<typeof usePagoDeGuia>;
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function FormPago({
  dto,
  pago,
  pendiente,
  onListo,
  onCancelar,
}: {
  dto: PlataDeGuiaDTO;
  pago: Pago;
  pendiente: number;
  onListo: (codigo?: string) => void;
  onCancelar: () => void;
}) {
  const ids = { monto: useId(), metodo: useId(), fecha: useId() };
  /* «Descontar de lo adelantado» sólo con la MISMA persona en las dos libretas
     (`cruzable`): cruzar a dos personas distintas sería mover plata ajena. */
  const puedeCruzar = pago.cruzable && pago.adelantosTeDebe > 0;
  const [cruzar, setCruzar] = useState(false);
  const compensar = cruzar ? r2(Math.min(pendiente, pago.adelantosTeDebe)) : 0;
  const [monto, setMonto] = useState(() => String(r2(pendiente)));
  const [metodo, setMetodo] = useState<MetodoPagoGuia>("efectivo");
  const [fecha, setFecha] = useState(() => limaDateKey());
  const [moverCaja, setMoverCaja] = useState(true);
  const [fotos, setFotos] = useState<FotoCarga[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const m = monto.trim() === "" ? 0 : Number(monto.replace(",", "."));
  const total = r2((Number.isFinite(m) ? m : 0) + compensar);
  const valido =
    Number.isFinite(m) &&
    m >= 0 &&
    total > 0 &&
    total <= r2(pendiente) + 0.005 &&
    fecha <= limaDateKey();

  async function registrar() {
    if (!valido) return;
    setEnviando(true);
    setError(null);
    const r = await pago.registrar({
      monto: r2(m),
      metodo,
      fecha,
      moverCaja,
      compensar,
      comprobantes: fotos,
    });
    setEnviando(false);
    if (r.ok) onListo(r.codigo);
    else setError(r.mensaje);
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border-2 border-[var(--accent)]/30 p-3">
      {puedeCruzar && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={cruzar}
            onChange={(e) => {
              setCruzar(e.target.checked);
              const c = e.target.checked ? r2(Math.min(pendiente, pago.adelantosTeDebe)) : 0;
              setMonto(String(r2(Math.max(0, pendiente - c))));
            }}
            className="h-5 w-5 accent-[var(--accent-dark)]"
          />
          Descontar de lo adelantado ({soles(Math.min(pendiente, pago.adelantosTeDebe))})
        </label>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor={ids.monto} className={ROTULO}>
            {cruzar ? "Y en plata (S/)" : "Monto (S/)"}
          </label>
          <input
            id={ids.monto}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor={ids.metodo} className={ROTULO}>
            Cómo
          </label>
          <select
            id={ids.metodo}
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MetodoPagoGuia)}
            className={CAMPO}
          >
            {METODOS_PAGO.map((x) => (
              <option key={x} value={x}>
                {METODO_PAGO_LABEL[x]}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={ids.fecha} className={ROTULO}>
            Fecha
          </label>
          <input
            id={ids.fecha}
            type="date"
            max={limaDateKey()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={CAMPO}
          />
        </div>
      </div>
      {total > r2(pendiente) + 0.005 && (
        <p className="text-sm font-bold text-[var(--data-warning-ink)]">
          Pasa lo pendiente de esta guía ({soles(pendiente)}). Lo de más se paga desde «Cuenta por
          persona».
        </p>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={moverCaja}
          onChange={(e) => setMoverCaja(e.target.checked)}
          className="h-5 w-5 accent-[var(--accent-dark)]"
        />
        Anotar la salida en la caja
      </label>
      <div>
        <span className={ROTULO}>Foto del comprobante</span>
        <CtpFotosDelIngreso
          fotos={fotos}
          onCambio={setFotos}
          disabled={enviando}
          gtf={dto.gtfNumber}
          proposito="comprobante"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-bold text-[var(--data-error-ink)]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Btn size="sm" variant="ghost" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Btn>
        <Btn
          size="sm"
          variant="primary"
          onClick={() => void registrar()}
          disabled={!valido || enviando}
        >
          {enviando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <HandCoins className="h-4 w-4" aria-hidden />
          )}
          Registrar {soles(total)}
        </Btn>
      </div>
    </div>
  );
}
