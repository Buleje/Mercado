"use client";

/**
 * Asignar el permiso a varias producciones sin lote de una vez (ADR-409).
 *
 * El hecho que lo pide: en el libro de pruebas, **ocho de ocho** producciones
 * sin lote no tenían permiso — hasta ahora no había dónde escribirlo. Ir asiento
 * por asiento es la clase de trabajo que no se hace, y sin hacerlo el saldo por
 * permiso muestra todo junto bajo «Sin permiso declarado».
 *
 * Tres cosas, y las tres importan:
 *
 *  1. **Se elige qué corridas.** Un botón que toca ocho asientos sin mostrar
 *     cuáles es un botón que nadie debería apretar.
 *  2. **Se dice qué va a pasar antes**: cuántos m³ se van a mover a ese permiso.
 *  3. **El resultado se detalla línea por línea.** El servidor rechaza las que
 *     ya tienen materia prima (ahí manda la guía, ADR-402) y las de un mes
 *     cerrado; decir «listo» tapando eso sería mentir sobre el libro.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Tag } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { declaraEnM3, type CorridaSinOrigen } from "@/lib/forestal/saldo-por-permiso";
import { Btn } from "./ctp-shared";
import { formatDate } from "@/lib/format";

interface Resultado {
  permiso: string;
  aplicados: { id: string; lineNo: number | null }[];
  rechazados: { id: string; lineNo: number | null; motivo: string }[];
}

const fmtFecha = (f: string) =>
  formatDate(f.length <= 10 ? `${f}T12:00:00Z` : f, { soloFecha: true });

export default function AsignarPermisoMasivo({
  corridas,
  permisosSugeridos,
  onAplicado,
}: {
  /** Las corridas sin permiso declarado — las que el saldo junta en un montón. */
  corridas: readonly CorridaSinOrigen[];
  permisosSugeridos: readonly string[];
  /** Se llama tras aplicar, para que el apartado vuelva a leer el saldo. */
  onAplicado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [permiso, setPermiso] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(corridas.map((c) => c.id)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const seleccion = useMemo(() => corridas.filter((c) => elegidas.has(c.id)), [corridas, elegidas]);
  const m3Elegidos = useMemo(
    () => seleccion.filter(declaraEnM3).reduce((a, c) => a + (Number(c.cantidad) || 0), 0),
    [seleccion],
  );

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const aplicar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "asignar_permiso_masivo",
          ids: seleccion.map((c) => c.id),
          originCode: permiso.trim(),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<Resultado> & {
        message?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      setResultado({
        permiso: j.permiso ?? permiso.trim(),
        aplicados: j.aplicados ?? [],
        rechazados: j.rechazados ?? [],
      });
      invalidarCtp();
      onAplicado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (corridas.length === 0) return null;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      >
        <Tag className="h-4 w-4" aria-hidden /> Asignarles un permiso ({corridas.length})
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-sunken)] p-3">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold text-[var(--text-primary)]">
          Asignar un permiso a producciones sin lote
        </p>
        <InfoTip
          title="Asignar un permiso"
          what="Se escribe en el asiento (ADR-402)."
          affects="Las que ya tienen materia prima no se tocan: ahí el permiso lo pone la guía de ingreso."
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            N° de permiso
          </span>
          <input
            value={permiso}
            onChange={(e) => setPermiso(e.target.value)}
            list="ctp-permisos-masivo"
            placeholder="Ej. CON-25-001 · o escribilo"
            className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <datalist id="ctp-permisos-masivo">
            {permisosSugeridos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <button
          type="button"
          onClick={() => void aplicar()}
          disabled={guardando || !permiso.trim() || seleccion.length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {guardando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
          Asignar a {seleccion.length}
        </button>
        <Btn onClick={() => setAbierto(false)} disabled={guardando}>
          Cancelar
        </Btn>
      </div>

      {seleccion.length > 0 && permiso.trim() && (
        <p className="text-sm text-[var(--text-secondary)]">
          Van a pasar <b className="font-mono tabular-nums">{fmtM3(m3Elegidos)} m³</b> declarados a{" "}
          <b className="font-mono">{permiso.trim()}</b>.
        </p>
      )}

      <ul className="max-h-48 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {corridas.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={elegidas.has(c.id)}
              onChange={() => alternar(c.id)}
              aria-label={`Línea ${c.lineNo ?? "sin número"} del ${fmtFecha(c.fecha)}`}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="font-mono text-xs text-[var(--text-tertiary)]">
              #{c.lineNo ?? "—"}
            </span>
            <span className="text-[var(--text-tertiary)]">{fmtFecha(c.fecha)}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
              {c.especie ?? "Sin especie"}
              {c.referencia ? ` · ${c.referencia}` : ""}
            </span>
            <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--text-primary)]">
              {declaraEnM3(c) ? `${fmtM3(c.cantidad)} m³` : `${c.cantidad} ${c.unidad ?? "—"}`}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {resultado && (
        <div className="space-y-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
          <p className="text-[var(--text-primary)]">
            <b>{resultado.aplicados.length}</b> línea(s) quedaron bajo{" "}
            <b className="font-mono">{resultado.permiso}</b>
            {resultado.rechazados.length > 0 && `, ${resultado.rechazados.length} sin tocar`}.
          </p>
          {resultado.rechazados.length > 0 && (
            <ul className="space-y-0.5">
              {resultado.rechazados.map((r) => (
                <li key={r.id} className="flex items-start gap-1.5 text-[var(--text-secondary)]">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--data-warning-500)]"
                    aria-hidden
                  />
                  <span>
                    <b className="font-mono">#{r.lineNo ?? "—"}</b>: {r.motivo}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
