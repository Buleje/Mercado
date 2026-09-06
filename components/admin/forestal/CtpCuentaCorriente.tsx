"use client";

/**
 * CtpCuentaCorriente — lo que se le debe (o le debe) a cada parte (ADR-322).
 *
 * Vive como pestaña de Fletes porque es de ahí de donde salen la mitad de los
 * cargos: el flete que el CTP pagó por cuenta de un titular se le descuenta al
 * liquidarle su madera. Un botón trae esos fletes a la cuenta sin re-tipearlos,
 * y el `fleteId` impide cobrarlos dos veces.
 *
 * El saldo se dice con palabras: "X le debe S/ 700" se entiende; "saldo 700",
 * no siempre.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wallet } from "@buleje/design-system/icons";
import {
  CONCEPTOS,
  CONCEPTO_LABEL,
  TIPO_SUGERIDO,
  calcularSaldo,
  corridaDeSaldos,
  fletesSinCargar,
  leerSaldo,
  saldosPorParte,
  type Concepto,
  type MovimientoCuenta,
  type TipoMov,
} from "@/lib/forestal/cuenta-corriente";
import { csrfHeaders } from "@/lib/csrf-client";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { Flete } from "@/lib/forestal/fletes";
import { Btn, I, IconAction, TablaSkeleton } from "./ctp-shared";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
const hoy = () => new Date().toISOString().slice(0, 10);

export default function CtpCuentaCorriente({ fletes }: { fletes: Flete[] }) {
  const dir = useDirectorioForestal();
  const [movs, setMovs] = useState<MovimientoCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<{ parteId: string; concepto: Concepto; tipo: TipoMov; monto: string; fecha: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/cuenta", { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(`No se pudo leer la cuenta corriente (${r.status})`);
      const j = (await r.json()) as { movimientos?: MovimientoCuenta[] };
      setMovs(j.movimientos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const saldos = useMemo(() => saldosPorParte(movs), [movs]);
  const total = useMemo(() => calcularSaldo(movs), [movs]);
  const pendientes = useMemo(() => fletesSinCargar(fletes, movs), [fletes, movs]);
  const partes = useMemo(() => [...dir.porRol("proveedor"), ...dir.porRol("transportista")], [dir]);

  async function guardar(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/forestal/cuenta", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as { movimiento?: MovimientoCuenta; message?: string };
    if (!r.ok || !j.movimiento) throw new Error(j.message ?? "No se pudo guardar el movimiento.");
    setMovs((p) => [j.movimiento!, ...p]);
  }

  /** Trae a la cuenta los fletes que van a cargo de un proveedor. */
  async function cargarFletes() {
    setOcupado("fletes");
    setError(null);
    try {
      for (const f of pendientes) {
        await guardar({
          parteId: f.proveedorId,
          parteNombre: f.proveedorNombre ?? "Proveedor",
          fecha: f.fecha.slice(0, 10),
          tipo: "cargo",
          concepto: "flete",
          monto: f.monto,
          referencia: f.gtfNumber ?? f.placa ?? null,
          fleteId: f.id,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function borrar(id: string) {
    if (!window.confirm("¿Borrar el movimiento? El saldo se recalcula solo.")) return;
    setOcupado(id);
    try {
      const r = await fetch(`/api/admin/forestal/cuenta?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfHeaders(),
      });
      if (!r.ok) throw new Error("No se pudo borrar.");
      setMovs((p) => p.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Wallet className="h-4 w-4" />
          {total.saldo === 0
            ? "Todas las cuentas al día"
            : total.saldo > 0
              ? `A favor del CTP: ${soles(total.saldo)}`
              : `A favor de terceros: ${soles(Math.abs(total.saldo))}`}
        </span>
        <div className="flex flex-wrap gap-2">
          {pendientes.length > 0 && (
            <Btn size="sm" variant="secondary" disabled={ocupado !== null} onClick={() => void cargarFletes()}>
              {ocupado === "fletes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Cargar {pendientes.length} flete(s) a cuenta
            </Btn>
          )}
          <Btn
            size="sm"
            variant={nuevo ? "dark" : "primary"}
            onClick={() =>
              setNuevo((v) =>
                v ? null : { parteId: partes[0]?.id ?? "", concepto: "adelanto", tipo: "cargo", monto: "", fecha: hoy() },
              )
            }
          >
            <Plus className="h-4 w-4" />
            Anotar movimiento
          </Btn>
        </div>
      </div>

      {nuevo && (
        <div className="grid gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:grid-cols-6">
          <select
            className={`${I} sm:col-span-2`}
            value={nuevo.parteId}
            onChange={(e) => setNuevo({ ...nuevo, parteId: e.target.value })}
          >
            <option value="">— Con quién —</option>
            {partes.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <select
            className={I}
            value={nuevo.concepto}
            onChange={(e) => {
              const c = e.target.value as Concepto;
              // El concepto sugiere el tipo; el operador puede cambiarlo (hay
              // devoluciones que van al revés).
              setNuevo({ ...nuevo, concepto: c, tipo: TIPO_SUGERIDO[c] });
            }}
          >
            {CONCEPTOS.map((c) => (
              <option key={c} value={c}>{CONCEPTO_LABEL[c]}</option>
            ))}
          </select>
          <select className={I} value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoMov })}>
            <option value="cargo">Le debe al CTP</option>
            <option value="abono">A su favor</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Monto S/"
            className={`${I} text-right font-mono tabular-nums`}
            value={nuevo.monto}
            onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })}
          />
          <Btn
            variant="primary"
            disabled={!nuevo.parteId || !(Number(nuevo.monto) > 0) || ocupado !== null}
            onClick={() => {
              const parte = partes.find((p) => p.id === nuevo.parteId);
              setOcupado("nuevo");
              setError(null);
              void guardar({
                parteId: nuevo.parteId,
                parteNombre: parte?.nombre ?? "Parte",
                fecha: nuevo.fecha,
                tipo: nuevo.tipo,
                concepto: nuevo.concepto,
                monto: Number(nuevo.monto),
              })
                .then(() => setNuevo(null))
                .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                .finally(() => setOcupado(null));
            }}
          >
            {ocupado === "nuevo" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Btn>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-sunken)] p-2.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {cargando ? (
        <TablaSkeleton />
      ) : saldos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
          Ninguna cuenta abierta todavía. Anotá un adelanto o traé los fletes que van a cargo de un proveedor.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {saldos.map((s) => {
            const suyos = movs.filter((m) => m.parteId === s.parteId);
            return (
              <li key={s.parteId} className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <button
                  type="button"
                  onClick={() => setAbierta((v) => (v === s.parteId ? null : s.parteId))}
                  aria-expanded={abierta === s.parteId}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{s.parteNombre}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      {s.movimientos} movimiento{s.movimientos === 1 ? "" : "s"} · {leerSaldo(s.saldo, "")}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-sm font-bold tabular-nums ${
                      s.saldo > 0
                        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : s.saldo < 0
                          ? "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                          : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    {soles(Math.abs(s.saldo))}
                  </span>
                </button>

                {abierta === s.parteId && (
                  <ul className="space-y-1 border-t border-[var(--rule-soft)] p-2">
                    {corridaDeSaldos(suyos).reverse().map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm">
                        <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                          {fecha(m.fecha)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                          {CONCEPTO_LABEL[m.concepto]}
                          {m.referencia && <span className="ml-1.5 font-mono text-xs text-[var(--text-tertiary)]">{m.referencia}</span>}
                        </span>
                        <span
                          className={`w-24 shrink-0 text-right font-mono tabular-nums ${
                            m.tipo === "cargo"
                              ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                              : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                          }`}
                        >
                          {m.tipo === "cargo" ? "+" : "−"}{soles(m.monto)}
                        </span>
                        <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                          {soles(m.acumulado)}
                        </span>
                        {ocupado === m.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                        ) : (
                          <IconAction icon={Trash2} label="Borrar movimiento" tone="danger" onClick={() => void borrar(m.id)} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
