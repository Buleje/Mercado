"use client";

/**
 * «Valorizar y descontar» (ADR-478): precio por especie en la unidad del lote
 * (S/ por PT en Oxapampina y en la aserrada, S/ por m³ en Smalian) o un precio
 * GENERAL para las especies sin precio propio (ADR-483), el total y a qué
 * adelantos va —el más antiguo primero— ANTES de confirmar; lo que no cubren
 * va a su cuenta forestal (ADR-484). Las líneas son las NETAS: después de los
 * descuentos del lote, como las valoriza el servidor.
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
  decimalesDe, FaltaPrecioError, fmtVolumen, repartirConCuenta,
  unidadDe, valorizar, type AdelantoAbierto, type LineaEspecie,
} from "@/lib/forestal/cubicacion-cuenta";
import { aplicarDescuentoLote, lineasDeEspecie } from "@/lib/forestal/cubicacion-comercial";
import { BOTON_PRIMARIO } from "./ctp-lotes-modal-marco";
import { ACuentaPrevia } from "./cubicador-trozas-a-cuenta";
import {
  aplicarCubicacionTrozas, medidasDe, useAdelantosAbiertos, useCubicacionesTrozas, ultimosPrecios, type CubicacionTrozas, type CuentaDeLaPersona,
} from "./hooks/use-cubicaciones-trozas";

const nuevaClave = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `cub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
/** «1,20» o «1.20» → 1.2; vacío o raro → null. */
const leerPrecio = (s: string): number | null => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

/** Las líneas por especie que se valorizan: brutas → descuentos del lote → netas (lo mismo que `aplicar`). */
function lineasNetas(cub: CubicacionTrozas): LineaEspecie[] {
  const brutas = lineasDeEspecie({ material: cub.material ?? "troza", modo: cub.modo ?? "pieza", formula: cub.formula, trozas: medidasDe(cub) });
  try { return aplicarDescuentoLote(brutas, cub.descuentos, cub.formula).lineas; }
  catch { return brutas; /* el servidor ya lo validó al guardar; si no cuadra, responde 422 al aplicar */ }
}

export default function ValorizarPrecios({
  cub, cuenta, onAplicada,
}: {
  cub: CubicacionTrozas;
  /** Su cuenta forestal: adonde va lo que el adelanto no cubre (null = sin ficha en el directorio). */
  cuenta: CuentaDeLaPersona | null;
  onAplicada: (c: CubicacionTrozas) => void;
}) {
  const unidad = unidadDe(cub.formula);
  const aserrada = cub.material === "aserrada";
  const lineas = useMemo(() => lineasNetas(cub), [cub]);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const { lista: anteriores } = useCubicacionesTrozas(
    { beneficiario: cub.beneficiarioId ?? undefined, estado: "aplicada", ...(aserrada ? { material: "aserrada" as const } : {}) },
    !!cub.beneficiarioId,
  );
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

  /* Sólo los precios tipeados (> 0): las especies sin precio propio las cubre el general. */
  const propios = useMemo(
    () => lineas.flatMap((l) => {
      const precio = l.volumen > 0 ? leerPrecio(precios[l.clave] ?? "") : null;
      return precio != null ? [{ clave: l.clave, precio }] : [];
    }),
    [lineas, precios],
  );
  const precioGeneral = leerPrecio(general);
  const vista = useMemo((): { monto: number; porEspecie: ReturnType<typeof valorizar>["porEspecie"] } | { falta: string } => {
    try { return valorizar(lineas, propios, precioGeneral); }
    catch (e) { return { falta: e instanceof FaltaPrecioError ? e.especie : "una especie" }; }
  }, [lineas, propios, precioGeneral]);
  const monto = "monto" in vista ? vista.monto : null;

  /* Cada adelanto hasta su saldo; el resto, a su cuenta (ADR-484). */
  const reparto = useMemo(
    () => (monto == null || !(monto > 0) || adelantos === null ? null : repartirConCuenta(monto, cub.volumen, elegidos, decimalesDe(cub.formula))),
    [monto, adelantos, elegidos, cub.volumen, cub.formula],
  );
  const partes = reparto?.partes ?? null;
  const aCuenta = reparto?.aCuenta ?? null;
  const persona = cub.personaNombre ?? "esta persona";
  const sePuede = !!reparto && (!aCuenta || !!cuenta);
  const listo = monto != null && monto > 0 && sePuede && confirmado && !enviando;
  const verbo = !aCuenta ? "Descontar" : partes?.length ? "Aplicar" : "Anotar en su cuenta";

  const aplicar = async () => {
    if (!listo || monto == null) return;
    setEnviando(true);
    setError(null);
    const r = await aplicarCubicacionTrozas(cub.id, {
      precios: propios,
      ...(precioGeneral != null ? { precioGeneral } : {}),
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
                <p className="text-sm tabular-nums text-[var(--text-tertiary)]">
                  {aserrada ? (l.n > 0 ? `${l.n} ${l.n === 1 ? "pieza" : "piezas"} · ` : "") : `${l.n} ${l.n === 1 ? "troza" : "trozas"} · `}
                  {fmtVolumen(l.volumen, cub.formula)}
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                S/
                <input inputMode="decimal" aria-label={`Precio de ${l.nombre} por ${unidad}`} value={precios[l.clave] ?? ""}
                  placeholder={precioGeneral != null ? general.trim() : "0,00"}
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
        <li className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[var(--surface-sunken)] px-4 py-3">
          <div className="w-full sm:w-auto sm:flex-1">
            <p className="text-base font-bold text-[var(--text-primary)]">Precio general</p>
            <p className="text-sm text-[var(--text-tertiary)]">Para las especies sin precio propio</p>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            S/
            <input inputMode="decimal" aria-label={`Precio general por ${unidad}`} value={general} placeholder="0,00" data-campo="precio-general"
              onChange={(e) => { setGeneral(e.target.value); setConfirmado(false); }}
              className="h-11 w-24 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right text-base font-semibold tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]" />
            por {unidad}
          </label>
          <span className="ml-auto w-28" aria-hidden />
        </li>
      </ul>

      <div className="flex items-baseline justify-between rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">
          {"falta" in vista ? `Falta el precio de ${vista.falta} (o pon un precio general)` : "Total"}
        </span>
        <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{monto != null ? formatCurrency(monto) : "—"}</span>
      </div>

      {!cub.beneficiarioId ? null : adelantos === null ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Buscando sus adelantos…</p>
      ) : (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-[var(--text-secondary)]">Se descuenta de (el más antiguo primero)</p>
          {abiertos.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">No tiene adelantos abiertos de este lado: todo va a su cuenta.</p>
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
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {aCuenta && <ACuentaPrevia sentido={cub.sentido} resto={aCuenta.monto} cuenta={cuenta} nombre={persona} hayAdelanto={!!partes?.length} />}

      {sePuede ? (
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
        {monto != null ? `${verbo} ${formatCurrency(monto)}` : verbo}
      </button>
    </div>
  );
}
