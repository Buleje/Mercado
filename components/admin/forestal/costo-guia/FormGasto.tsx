"use client";

/**
 * «Agregar gasto» de una guía (ADR-437 §8): estiba, descarga, carguío,
 * cubicación, vigilancia u otro. Va al `Expense` con el N° de guía — el P&L lo
 * cuenta por su lado; acá sólo suma al «puesto en patio».
 */

import { useId, useState } from "react";
import { Loader2, Plus } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import {
  CATEGORIAS_GASTO_GUIA,
  CATEGORIA_GASTO_GUIA_LABEL,
  METODOS_PAGO,
  METODO_PAGO_LABEL,
  type CategoriaGastoGuia,
  type GastoGuiaInput,
  type MetodoPagoGuia,
} from "@/lib/forestal/plata-de-guia";
import type { Resultado } from "@/hooks/use-plata-de-guia";
import { Btn } from "../ctp-shared";
import { CAMPO, ROTULO } from "./comun";

export default function FormGasto({
  onGuardar,
  onCancelar,
}: {
  onGuardar: (g: Omit<GastoGuiaInput, "gtfNumber">) => Promise<Resultado>;
  onCancelar: () => void;
}) {
  const ids = { cat: useId(), monto: useId(), fecha: useId(), metodo: useId(), a: useId() };
  const [categoria, setCategoria] = useState<CategoriaGastoGuia>("estiba");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(() => limaDateKey());
  const [pagado, setPagado] = useState(true);
  const [metodo, setMetodo] = useState<MetodoPagoGuia>("efectivo");
  const [pagadoA, setPagadoA] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = Number(monto.replace(",", "."));
  const valido = monto.trim() !== "" && Number.isFinite(m) && m > 0 && fecha <= limaDateKey();

  async function guardar() {
    if (!valido) return;
    setGuardando(true);
    setError(null);
    const r = await onGuardar({
      categoria,
      monto: Math.round(m * 100) / 100,
      fecha,
      pagado,
      metodo: pagado ? metodo : null,
      ...(pagadoA.trim() ? { pagadoA: pagadoA.trim() } : {}),
    });
    setGuardando(false);
    if (r.ok) onCancelar();
    else setError(r.mensaje);
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border-2 border-[var(--accent)]/30 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor={ids.cat} className={ROTULO}>
            Qué fue
          </label>
          <select
            id={ids.cat}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaGastoGuia)}
            className={CAMPO}
          >
            {CATEGORIAS_GASTO_GUIA.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_GASTO_GUIA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.monto} className={ROTULO}>
            Monto (S/)
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
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={pagado}
          onChange={(e) => setPagado(e.target.checked)}
          className="h-5 w-5 accent-[var(--accent-dark)]"
        />
        Ya está pagado
      </label>
      <div className="grid grid-cols-2 gap-2">
        {pagado && (
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
        )}
        <div className={pagado ? "" : "col-span-2"}>
          <label htmlFor={ids.a} className={ROTULO}>
            A quién
          </label>
          <input
            id={ids.a}
            value={pagadoA}
            onChange={(e) => setPagadoA(e.target.value)}
            placeholder="Estibadores, vigilante…"
            className={CAMPO}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-bold text-[var(--data-error-ink)]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Btn size="sm" variant="ghost" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Btn>
        <Btn
          size="sm"
          variant="primary"
          onClick={() => void guardar()}
          disabled={!valido || guardando}
        >
          {guardando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Anotar el gasto
        </Btn>
      </div>
    </div>
  );
}
