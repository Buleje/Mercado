"use client";

/**
 * «Poner fecha de cobro» para las filas marcadas de Cobranza.
 *
 * Sin fecha, Cobranza no sabe cuál está vencido: todo se ve como «hace N días».
 * Acá se le pone el mismo día a varios de un golpe (en 15 días, en 30, fin de
 * mes o un día a elección) y la lista se reordena sola.
 */

import { useState } from "react";
import { CalendarClock } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { diaCorto } from "@/lib/adelantos/control-edicion";
import { ATAJOS_FECHA_COBRO, fechaDeAtajo } from "@/lib/adelantos/fecha-cobro-lote";
import { limaDateKey } from "@/lib/utils";

const MOTIVOS: Record<string, string> = {
  no_abierto: "ya no está abierto",
  no_dado: "es plata que recibiste",
  entregas_pactadas: "tiene sus cuotas con fecha",
  antes_del_adelanto: "la fecha es anterior al día en que se dio",
  no_existe: "no se encontró",
};

const boton =
  "inline-flex h-12 items-center rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-50";

export default function BarraFechaCobro({ ids, onGuardado }: { ids: string[]; onGuardado: () => void }) {
  const [eligiendo, setEligiendo] = useState(false);
  const [dia, setDia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const guardar = async (fecha: string) => {
    if (!fecha || ids.length === 0) return;
    setGuardando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/adelantos/fecha-en-lote", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ ids: ids.slice(0, 200), fechaVencimiento: fecha }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        actualizados?: number;
        omitidos?: Array<{ motivo: string }>;
      };
      if (!r.ok) {
        setAviso({ ok: false, texto: j.error ?? "No se pudo guardar la fecha." });
        return;
      }
      const n = j.actualizados ?? 0;
      const om = j.omitidos ?? [];
      const porque = om.length ? ` (${om.length} sin cambio: ${MOTIVOS[om[0].motivo] ?? "no aplica"})` : "";
      setAviso({ ok: n > 0, texto: `Cobro puesto para el ${diaCorto(fecha)} en ${n} adelanto${n === 1 ? "" : "s"}${porque}.` });
      setEligiendo(false);
      if (n > 0) onGuardado();
    } catch (e) {
      logger.error("[cobranza] no se pudo poner la fecha de cobro", { error: String(e) });
      setAviso({ ok: false, texto: "No se pudo guardar la fecha. Revisa tu conexión." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)]">
          <CalendarClock className="h-4 w-4" aria-hidden /> Poner fecha de cobro
        </span>
        {ATAJOS_FECHA_COBRO.map((a) => (
          <button key={a.id} type="button" disabled={guardando} onClick={() => void guardar(fechaDeAtajo(a.id))} title={diaCorto(fechaDeAtajo(a.id))} className={boton}>
            {a.label}
          </button>
        ))}
        <button type="button" disabled={guardando} onClick={() => setEligiendo((v) => !v)} aria-expanded={eligiendo} className={boton}>
          Elegir día
        </button>
      </div>
      {eligiendo && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dia}
            min={limaDateKey()}
            onChange={(e) => setDia(e.target.value)}
            aria-label="Día de cobro"
            className="h-12 rounded-xl bg-[var(--surface-sunken)] px-3 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button type="button" disabled={guardando || !dia} onClick={() => void guardar(dia)} className="inline-flex h-12 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
      {aviso && (
        <p role="status" className={`text-sm font-semibold ${aviso.ok ? "text-[var(--data-success)]" : "text-[var(--data-warning-ink)]"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
