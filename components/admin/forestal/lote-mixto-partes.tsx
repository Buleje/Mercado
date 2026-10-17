"use client";

/**
 * Piezas chicas del lote mixto (ADR-441), aparte para que el modal y la
 * tarjeta de Consumos se lean de una vez: abrir uno nuevo, anular con motivo
 * y el historial de los repartidos con sus lotes hijos.
 */

import { useId, useState } from "react";
import { Ban, Combine, Loader2 } from "@buleje/design-system/icons";
import { formatDateShort } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { Btn } from "./ctp-shared";
import { CAMPO, plural } from "./armar-lote-escaneo-partes";
import type { LoteMixto } from "./hooks/use-lotes-mixtos";

const ERROR =
  "rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]";

/** No hay ningún mixto abierto: una frase y el botón que lo abre. */
export function SinMixtoAbierto({
  onCrear,
  creando,
  error,
}: {
  onCrear: () => void;
  creando: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-[var(--surface-sunken)] px-4 py-5 text-center">
      <p className="text-base text-[var(--text-secondary)]">No hay un lote mixto abierto.</p>
      <Btn variant="primary" onClick={onCrear} disabled={creando} className="mx-auto">
        {creando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Combine className="h-4 w-4" aria-hidden />}
        Abrir un lote mixto
      </Btn>
      {error && (
        <p role="alert" className={ERROR}>
          No se abrió: {error}
        </p>
      )}
    </div>
  );
}

/**
 * Anular el mixto: suelta sus trozas al patio (quedan libres) y no borra nada.
 * Pide el motivo (≥ 3 letras, como el servidor) — queda en el registro.
 */
export function AnularMixto({
  code,
  onAnular,
  onCancelar,
}: {
  code: string;
  onAnular: (motivo: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const id = useId();
  const [motivo, setMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valido = motivo.trim().length >= 3;
  const anular = async () => {
    if (!valido) return;
    setAnulando(true);
    setError(null);
    try {
      await onAnular(motivo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAnulando(false);
    }
  };
  return (
    <div className="space-y-2 rounded-2xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-3">
      <label htmlFor={id} className="block text-base font-bold text-[var(--text-primary)]">
        ¿Por qué anulas {code}? Sus trozas vuelven libres al patio.
      </label>
      <input
        id={id}
        type="text"
        value={motivo}
        maxLength={300}
        onChange={(e) => setMotivo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void anular();
          }
        }}
        disabled={anulando}
        placeholder="ej: se armó con la pila equivocada"
        className={CAMPO}
      />
      {error && (
        <p role="alert" className={ERROR}>
          No se anuló: {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn variant="ghost" onClick={onCancelar} disabled={anulando}>
          No, seguir
        </Btn>
        <Btn variant="danger" onClick={() => void anular()} disabled={!valido || anulando}>
          {anulando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
          Sí, anular {code}
        </Btn>
      </div>
    </div>
  );
}

/**
 * Los mixtos ya repartidos, el más nuevo primero, cada uno con los lotes que
 * dejó: de qué pila salió cada lote.
 */
export function HistorialDeMixtos({
  repartidos,
  onVerLote,
}: {
  repartidos: readonly LoteMixto[];
  onVerLote?: (lote: { id: string; code: string }) => void;
}) {
  if (repartidos.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">Todavía no se repartió ningún lote mixto.</p>;
  }
  return (
    <ul className="space-y-2">
      {repartidos.map((m) => (
        <li key={m.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {m.code}
            <span className="font-normal text-[var(--text-secondary)]">
              {m.repartidoEn ? ` · repartido el ${formatDateShort(m.repartidoEn)}` : " · repartido"} ·{" "}
              {plural(m.lotes.length, "lote", "lotes")}
            </span>
          </p>
          {m.lotes.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {m.lotes.map((l) => {
                const texto = `${l.code}${l.speciesCommon ? ` · ${l.speciesCommon}` : ""}${
                  l.piezas != null ? ` · ${plural(l.piezas, "troza", "trozas")}` : ""
                }${l.volumenM3 != null ? ` · ${fmtM3(l.volumenM3)} m³` : ""}`;
                return (
                  <li key={l.id}>
                    {onVerLote ? (
                      <button
                        type="button"
                        onClick={() => onVerLote({ id: l.id, code: l.code })}
                        className="inline-flex min-h-11 items-center rounded-lg border border-[var(--rule-base)] px-2.5 text-sm text-[var(--text-primary)] hover:border-[var(--accent)]"
                      >
                        {texto}
                      </button>
                    ) : (
                      <span className="inline-flex min-h-8 items-center rounded-lg bg-[var(--surface-sunken)] px-2.5 text-sm text-[var(--text-primary)]">
                        {texto}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
