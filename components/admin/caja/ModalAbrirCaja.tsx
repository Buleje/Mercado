"use client";

import { useState } from "react";
import { Loader2, Unlock } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { BotonCancelar, MarcoModalCaja, mensajeDeError } from "./MarcoModalCaja";

const MONTOS_RAPIDOS = [100, 200, 300, 500];

/** Abrir la caja del día con el fondo inicial. */
export function ModalAbrirCaja({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    if (abriendo) return;
    setAbriendo(true);
    setError(null);
    try {
      const res = await fetch("/api/cash-registers", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "open", openingAmount: Number(monto) || 0, notes: notas || undefined }),
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo abrir la caja"));
        return;
      }
      onHecho();
      onCerrar();
    } catch (err) {
      console.warn("[caja] abrir caja falló", err);
      setError("Sin conexión con el servidor — la caja NO se abrió.");
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <MarcoModalCaja
      claveMemoria="caja-abrir"
      titulo="Abrir caja"
      subtitulo="El efectivo con el que empiezas el día"
      icono={Unlock}
      onCerrar={onCerrar}
      error={error}
      pie={
        <>
          <BotonCancelar onClick={onCerrar} />
          <button
            type="button"
            onClick={abrir}
            disabled={abriendo}
            className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl text-base font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {abriendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Unlock className="h-5 w-5" />}
            Abrir caja
          </button>
        </>
      }
    >
      <Field
        label={
          <span className="inline-flex items-center gap-1.5">
            Monto de apertura
            <InfoTip what="Dinero con el que abre la caja al empezar el día (el sencillo para dar vuelto)." example="Abres con S/ 200 en monedas y billetes chicos." />
          </span>
        }
        labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2"
      >
        {(id) => (
          <>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">S/</span>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.10"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void abrir();
                }}
                placeholder="0.00"
                className="w-full pl-12 pr-4 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal text-right font-mono tabular-nums outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- el modal se abre para escribir el monto de inmediato
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {MONTOS_RAPIDOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonto(String(m))}
                  className={cn(
                    "px-4 min-h-10 rounded-xl text-sm font-semibold border transition-colors",
                    parseFloat(monto || "0") === m
                      ? "bg-primary text-white border-primary"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-primary/40 hover:text-primary",
                  )}
                >
                  S/ {m}
                </button>
              ))}
            </div>
          </>
        )}
      </Field>
      <Field label={<>Notas <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></>} labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej: caja del turno de la tarde"
          rows={2}
          className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
        />
      </Field>
    </MarcoModalCaja>
  );
}
