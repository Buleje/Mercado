"use client";

/**
 * «Corregir: esta plata la recibí / la di» (ADR-448 §2.5, fase 1.5).
 *
 * Para los adelantos cargados del lado equivocado antes de que existiera la
 * dirección: en Blas, ADL-0003 y ADL-0004 de Wasaco (S/ 3 031, pagos por
 * aserrío) quedaron como plata dada. Sólo con 0 entregas vivas —con entregas,
 * darlo vuelta cambiaría lo que ya se liquidó— y NO mueve la caja: lo dice
 * antes de confirmar, porque el arqueo de ese día queda como estaba.
 */

import { useState } from "react";
import { ArrowRightLeft, Ban } from "@buleje/design-system/icons";
import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { ETIQUETA_CONCEPTO, type AdelantoConceptoRecibido, type AdelantoDireccion } from "@/lib/adelantos/direccion";
import { fmtMon, inputCls } from "../shared";
import { MarcaSeleccion, claseOpcion } from "../crear-adelanto/piezas";

/** Los 409 del servidor, dichos como en el mostrador. */
const MOTIVO_409: Record<string, string> = {
  con_entregas: "Ya tiene entregas: anúlalas primero y después corrige de qué lado está la plata.",
  anulado: "Está anulado: no se corrige.",
  sin_cambio: "Ya está de ese lado.",
};

export default function CorregirDireccion({
  adelantoId,
  direccion,
  onCorregido,
}: {
  adelantoId: string;
  direccion: AdelantoDireccion;
  /**
   * Recibe lo que hay que leer después (la caja no se movió; si pasó a lo dado,
   * que ahora supera su tope). Lo muestra el modal padre: el `load()` que sigue
   * desmonta este bloque y un aviso guardado acá se perdía.
   */
  onCorregido: (aviso: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const destino: AdelantoDireccion = direccion === "DADO" ? "RECIBIDO" : "DADO";
  const [concepto, setConcepto] = useState<AdelantoConceptoRecibido>("SERVICIO");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const corregir = async () => {
    if (motivo.trim().length < 3) { setErr("Escribe por qué lo corriges."); return; }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          action: "corregirDireccion",
          direccion: destino,
          conceptoRecibido: destino === "RECIBIDO" ? concepto : null,
          motivo: motivo.trim(),
        }),
      });
      const j = await leerJson<{
        error?: string;
        message?: string;
        code?: string;
        issues?: string[];
        correccion?: { aviso?: string; excedeLimite?: { limite: number; saldo: number } | null };
      }>(res);
      if (res.ok) {
        /* No bloquea: la plata ya estaba dada; sólo lo dice. */
        const ex = j?.correccion?.excedeLimite;
        const avisos = [
          j?.correccion?.aviso,
          ex && `Ojo: ahora supera su tope de crédito — debe ${fmtMon(ex.saldo)} con un tope de ${fmtMon(ex.limite)}.`,
        ].filter((x): x is string => !!x);
        setAbierto(false);
        onCorregido(avisos.length ? avisos.join(" ") : null);
        return;
      }
      /* `movio_caja` trae del servidor el motivo y la salida que propone: va tal cual. */
      setErr(
        res.status === 403
          ? "Esto lo corrige el dueño o un administrador."
          : ((j?.code && MOTIVO_409[j.code]) ?? j?.issues?.[0] ?? j?.message ?? j?.error ?? "No se pudo corregir."),
      );
    } catch (e) {
      logger.error("[adelantos] no se pudo corregir la dirección", { error: String(e) });
      setErr("No se pudo corregir. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--accent-ink)] hover:underline"
      >
        <ArrowRightLeft className="h-4 w-4" aria-hidden />
        {direccion === "DADO" ? "Corregir: esta plata la recibí" : "Corregir: esta plata la di"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
      <p className="text-base font-bold text-[var(--text-primary)]">
        {destino === "RECIBIDO" ? "Pasarlo a plata que recibiste" : "Pasarlo a plata que diste"}
      </p>
      {destino === "RECIBIDO" && (
        <div role="group" aria-label="Por qué te dieron la plata" className="grid gap-2 sm:grid-cols-2">
          {(["SERVICIO", "PRESTAMO"] as const).map((c) => (
            <button key={c} type="button" aria-pressed={concepto === c} onClick={() => setConcepto(c)} className={claseOpcion(concepto === c)}>
              <span className="min-w-0 flex-1 text-sm font-bold text-[var(--text-primary)]">{ETIQUETA_CONCEPTO[c]}</span>
              <MarcaSeleccion activa={concepto === c} />
            </button>
          ))}
        </div>
      )}
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Por qué lo corriges (ej. era el pago del aserrío)"
        aria-label="Motivo de la corrección"
        className={inputCls}
      />
      <p className="flex items-start gap-2 text-sm font-semibold text-[var(--data-warning-ink)]">
        <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        No mueve la caja: si ese día la plata entró o salió distinto, anótalo en la caja a mano.
      </p>
      {err && <p className="text-sm font-semibold text-[var(--data-error-ink)]">{err}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          Cancelar
        </button>
        <button
          type="button"
          onClick={corregir}
          disabled={saving}
          className="h-11 rounded-xl bg-[var(--accent-dark)] px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Corrigiendo…" : "Corregir"}
        </button>
      </div>
    </div>
  );
}
