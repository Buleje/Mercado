"use client";

/**
 * «Valorizar y descontar» (ADR-478): precio por especie en la unidad del lote
 * (S/ por PT en Oxapampina, S/ por m³ en Smalian), el total y a qué adelantos
 * va —el más antiguo primero— ANTES de confirmar.
 *
 * Todo lo de acá es vista previa con las mismas funciones puras que usa el
 * servidor (`lib/forestal/cubicacion-cuenta.ts`). El servidor vuelve a
 * calcular; si su monto no es el que se vio, responde 409 y no mueve nada.
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Coins, Loader2 } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import {
  agruparPorEspecie, decimalesDe, ExcedeLoRecibidoError, FaltaPrecioError, fmtVolumen, repartirFifo, SinAdelantoAbiertoError,
  unidadDe, valorizar, type AdelantoAbierto, type Imputacion,
} from "@/lib/forestal/cubicacion-cuenta";
import { BOTON_PRIMARIO } from "./ctp-lotes-modal-marco";
import { aplicarCubicacionTrozas, useAdelantosAbiertos, useCubicacionesTrozas, ultimosPrecios, type CubicacionTrozas } from "./hooks/use-cubicaciones-trozas";

const nuevaClave = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `cub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
/** «1,20» o «1.20» → 1.2; vacío o raro → null. */
const leerPrecio = (s: string): number | null => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

export default function ValorizarPrecios({ cub, onAplicada }: { cub: CubicacionTrozas; onAplicada: (c: CubicacionTrozas) => void }) {
  const unidad = unidadDe(cub.formula);
  const lineas = useMemo(() => agruparPorEspecie(cub.trozas ?? [], cub.formula), [cub.trozas, cub.formula]);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const { lista: anteriores } = useCubicacionesTrozas({ beneficiario: cub.beneficiarioId ?? undefined, estado: "aplicada" }, !!cub.beneficiarioId);
  const ultimos = useMemo(() => ultimosPrecios(anteriores, cub.formula), [anteriores, cub.formula]);
  const adelantos = useAdelantosAbiertos(cub.beneficiarioId, cub.sentido);
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Una clave por intento: se reusa si la red cortó (el servidor la reconoce)
     y se cambia si el servidor contestó que no (el cuerpo va a ser otro). */
  const clave = useRef(nuevaClave());

  const abiertos: AdelantoAbierto[] = useMemo(
    () => (adelantos ?? []).map((a) => ({ id: a.id, codigoOperacion: a.codigoOperacion ?? null, fecha: a.fechaAdelanto, saldo: a.saldoPendiente, direccion: a.direccion })),
    [adelantos],
  );
  const elegidos = useMemo(() => abiertos.filter((a) => !fuera.has(a.id)), [abiertos, fuera]);

  const vista = useMemo((): { monto: number; porEspecie: ReturnType<typeof valorizar>["porEspecie"] } | { falta: string } => {
    const lista = lineas.filter((l) => l.volumen > 0).map((l) => ({ clave: l.clave, precio: leerPrecio(precios[l.clave] ?? "") ?? 0 }));
    try { return valorizar(lineas, lista.filter((p) => p.precio > 0)); }
    catch (e) { return { falta: e instanceof FaltaPrecioError ? e.especie : "una especie" }; }
  }, [lineas, precios]);
  const monto = "monto" in vista ? vista.monto : null;

  const reparto = useMemo((): { partes: Imputacion[] } | { aviso: string } | null => {
    if (monto == null || !(monto > 0) || adelantos === null) return null;
    try { return { partes: repartirFifo(monto, cub.volumen, elegidos, decimalesDe(cub.formula)) }; }
    catch (e) {
      if (e instanceof SinAdelantoAbiertoError) return { aviso: "No hay adelantos abiertos elegidos: queda guardada sin descontar." };
      if (e instanceof ExcedeLoRecibidoError) return { aviso: `Vale más de lo que le debes devolver (${formatCurrency(e.debe)}).` };
      return { aviso: "No se pudo repartir." };
    }
  }, [monto, adelantos, elegidos, cub.volumen, cub.formula]);
  const partes = reparto && "partes" in reparto ? reparto.partes : null;
  const persona = cub.personaNombre ?? "esta persona";
  const listo = monto != null && monto > 0 && !!partes?.length && confirmado && !enviando;

  const aplicar = async () => {
    if (!listo || monto == null) return;
    setEnviando(true);
    setError(null);
    const r = await aplicarCubicacionTrozas(cub.id, {
      precios: lineas.filter((l) => l.volumen > 0).map((l) => ({ clave: l.clave, precio: leerPrecio(precios[l.clave] ?? "") ?? 0 })),
      montoVisto: monto,
      idempotencyKey: clave.current,
      version: cub.version,
      ...(fuera.size ? { adelantoIds: elegidos.map((a) => a.id) } : {}),
    });
    setEnviando(false);
    if (r.ok) { onAplicada(r.data); return; }
    if (r.status >= 400 && r.status < 500) clave.current = nuevaClave();
    setConfirmado(false);
    setError(r.mensaje);
  };

  return (
    <div className="space-y-3" data-vista="cubicacion-valorizar">
      <ul className="divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-soft)]">
        {lineas.map((l) => {
          const linea = "porEspecie" in vista ? vista.porEspecie.find((x) => x.clave === l.clave) : null;
          const ultimo = ultimos[l.clave];
          return (
            <li key={l.clave} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="w-full sm:w-auto sm:flex-1">
                <p className="text-base font-bold text-[var(--text-primary)]">{l.nombre}</p>
                <p className="text-sm tabular-nums text-[var(--text-tertiary)]">{l.n} {l.n === 1 ? "troza" : "trozas"} · {fmtVolumen(l.volumen, cub.formula)}</p>
              </div>
              <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                S/
                <input inputMode="decimal" aria-label={`Precio de ${l.nombre} por ${unidad}`} value={precios[l.clave] ?? ""} placeholder="0,00"
                  onChange={(e) => { setPrecios({ ...precios, [l.clave]: e.target.value }); setConfirmado(false); }}
                  className="h-11 w-24 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right text-base font-semibold tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]" />
                por {unidad}
              </label>
              {ultimo != null && !precios[l.clave] && (
                <button type="button" onClick={() => setPrecios({ ...precios, [l.clave]: ultimo.toFixed(2) })}
                  className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-dark)]">
                  último: {formatCurrency(ultimo)}
                </button>
              )}
              <span className="ml-auto w-28 text-right text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {linea?.monto != null ? formatCurrency(linea.monto) : "—"}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-baseline justify-between rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">
          {"falta" in vista ? `Falta el precio de ${vista.falta}` : "Total"}
        </span>
        <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{monto != null ? formatCurrency(monto) : "—"}</span>
      </div>

      {!cub.beneficiarioId ? (
        <p className="text-sm text-[var(--text-tertiary)]">Esta persona no tiene cuenta de adelantos: no hay de dónde descontar.</p>
      ) : adelantos === null ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Buscando sus adelantos…</p>
      ) : (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-[var(--text-secondary)]">Se descuenta de (el más antiguo primero)</p>
          {abiertos.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">No tiene adelantos abiertos de este lado.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...abiertos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((a) => {
                const parte = partes?.find((p) => p.adelantoId === a.id);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-soft)] px-3 py-2 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" aria-label={`Descontar de ${a.codigoOperacion ?? "este adelanto"}`}
                      checked={!fuera.has(a.id)}
                      onChange={(e) => { const s = new Set(fuera); if (e.target.checked) s.delete(a.id); else s.add(a.id); setFuera(s); setConfirmado(false); }} />
                    <span className="font-mono font-bold text-[var(--text-primary)]">{a.codigoOperacion ?? "Adelanto"}</span>
                    <span className="text-[var(--text-tertiary)]">{formatDate(a.fecha)} · saldo {formatCurrency(a.saldo)}</span>
                    <span className="ml-auto font-bold tabular-nums text-[var(--text-primary)]">
                      {parte ? `− ${formatCurrency(parte.monto)}` : "—"}
                      {parte?.excedido && <span className="ml-1.5 rounded-full bg-[var(--data-warning-50)] px-2 py-0.5 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]" title="Queda a favor suyo: págaselo aparte, la liquidación de la cuenta no lo salda">le debes la diferencia: págala aparte</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {reparto && "aviso" in reparto && <p className="mt-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{reparto.aviso}</p>}
        </div>
      )}

      {partes?.length ? (
        <label className="flex items-center gap-2 text-base text-[var(--text-primary)]">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} data-accion="confirmar-persona" />
          <span>Sí, es la madera de <b>{persona}</b></span>
        </label>
      ) : null}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      <button type="button" className={`${BOTON_PRIMARIO} w-full`} disabled={!listo} onClick={() => void aplicar()} data-accion="aplicar-cubicacion">
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
        {monto != null ? `Descontar ${formatCurrency(monto)}` : "Descontar"}
      </button>
    </div>
  );
}
