"use client";

/**
 * Cerrar la recepción física de una guía (ADR-325).
 *
 * La GTF declara 25 trozas; al patio llegan 23. Acá se anota lo que hizo el
 * CENTRO al recibir —el código que le marca a cada pieza, de qué parcela del POA
 * salió y cuáles no llegaron—, que son datos propios y no del documento.
 *
 * Se guarda en UNA llamada con todos los cambios: recibir 25 trozas son 25
 * ediciones seguidas, y un PATCH por fila dejaría la recepción a medias si se
 * corta la señal a la mitad.
 */

import { useMemo, useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, CalendarClock, Check, Hash, Loader2, PackageCheck, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { URL_TROZAS_RECEPCION, escribirDelPatio } from "@/lib/forestal/patio-cola";
import {
  avisosRecepcion,
  balanceRecepcion,
  type CambioRecepcion,
  type TrozaRecepcion,
} from "@/lib/forestal/recepcion-trozas";
import {
  codigosRepetidos,
  fecharRecepcion,
  marcarRecepcion,
  normalizarCodigo,
  numerarTrozas,
} from "@/lib/forestal/trozas-recepcion";
import CtpRecepcionTrozaCard from "./CtpRecepcionTrozaCard";

export interface TrozaEditable extends TrozaRecepcion {
  especieComun?: string | null;
  dimensiones?: string | null;
}

const BTN_LOTE =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40";

const CAMPO_TABLA =
  "h-11 rounded-xl border-2 border-[var(--rule-base)] bg-transparent px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-40";

export default function CtpRecepcionTrozas({
  entryId,
  trozas,
  volumenDelIngreso,
  onCerrar,
  onGuardado,
  offline = false,
}: {
  entryId: string;
  trozas: TrozaEditable[];
  volumenDelIngreso: number | null;
  onCerrar: () => void;
  onGuardado: (encolada: boolean) => void;
  /**
   * Modo patio: si no hay señal, la recepción se anota en el equipo en vez de
   * perderse. Va por prop y NO por defecto — desde el libro, en la oficina, un
   * "se guardó en tu equipo" cuando el servidor está caído confunde más de lo
   * que ayuda: ahí se quiere el error y reintentar.
   */
  offline?: boolean;
}) {
  /** Sólo las madres: un pedazo retrozado no se recibe aparte de su troza. */
  const madres = useMemo(() => trozas.filter((t) => !t.trozaOrigenId), [trozas]);
  const [edit, setEdit] = useState<Record<string, CambioRecepcion>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valor = <K extends keyof CambioRecepcion>(t: TrozaEditable, campo: K): CambioRecepcion[K] => {
    const cambio = edit[t.id];
    if (cambio && cambio[campo] !== undefined) return cambio[campo];
    return t[campo as keyof TrozaEditable] as CambioRecepcion[K];
  };

  const tocar = (id: string, parche: Partial<CambioRecepcion>) =>
    setEdit((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id }), id, ...parche } }));

  /** El balance se calcula sobre lo EDITADO: el aviso se mueve mientras se tipea. */
  const conCambios = useMemo(
    () => madres.map((t) => ({ ...t, ...edit[t.id] })),
    [madres, edit],
  );
  const balance = useMemo(() => balanceRecepcion(conCambios), [conCambios]);
  const avisos = useMemo(
    () => avisosRecepcion(balance, volumenDelIngreso),
    [balance, volumenDelIngreso],
  );

  const cambios = Object.values(edit);
  const repetidos = useMemo(() => codigosRepetidos(conCambios), [conCambios]);

  /**
   * Aplica una acción EN LOTE a todas las piezas, con la MISMA lógica que el
   * alta (`lib/forestal/trozas-recepcion`).
   *
   * Corregir la recepción de una guía de sesenta piezas de a una es lo que nadie
   * hace: por eso las mismas tres acciones del alta —llegaron, fecha, códigos—
   * viven también acá. El resultado se vuelca al diccionario de cambios
   * comparando contra el original, para no marcar como editado lo que no cambió.
   */
  const aplicarLote = (fn: (piezas: typeof conCambios) => typeof conCambios) => {
    const resultado = fn(conCambios);
    setEdit((prev) => {
      const siguiente = { ...prev };
      resultado.forEach((nueva, i) => {
        const original = madres[i]!;
        const parche: Partial<CambioRecepcion> = {};
        if ((nueva.codigoPlanta ?? null) !== (original.codigoPlanta ?? null)) parche.codigoPlanta = nueva.codigoPlanta ?? null;
        if ((nueva.fechaRecepcion ?? null) !== (original.fechaRecepcion ?? null)) parche.fechaRecepcion = nueva.fechaRecepcion ?? null;
        if (Boolean(nueva.noRecepcionada) !== Boolean(original.noRecepcionada)) parche.noRecepcionada = Boolean(nueva.noRecepcionada);
        if (Object.keys(parche).length > 0) {
          siguiente[original.id] = { ...(siguiente[original.id] ?? { id: original.id }), id: original.id, ...parche };
        }
      });
      return siguiente;
    });
  };

  const [fechaLote, setFechaLote] = useState("");
  const [numerando, setNumerando] = useState(false);

  /** Numera las que todavía no tienen marca, desde el correlativo del centro. */
  const generarCodigos = async () => {
    setNumerando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas?siguienteCodigo=1", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const desde = Number((await r.json()).siguiente) || 1;
      aplicarLote((piezas) => numerarTrozas(piezas, { desde }).trozas);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNumerando(false);
    }
  };

  const guardar = async () => {
    if (cambios.length === 0) return onCerrar();
    setGuardando(true);
    setError(null);
    try {
      if (offline) {
        const r = await escribirDelPatio({
          section: "recepcion",
          url: URL_TROZAS_RECEPCION,
          metodo: "PATCH",
          payload: { woodEntryId: entryId, cambios },
        });
        if (r.estado === "error") throw new Error(r.mensaje ?? "No se pudo guardar la recepción.");
        onGuardado(r.estado === "encolada");
        return;
      }
      const r = await fetch("/api/admin/forestal/trozas", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ woodEntryId: entryId, cambios }),
      });
      const body = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(body.message ?? body.error ?? "No se pudo guardar la recepción.");
      onGuardado(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="@container overflow-hidden rounded-2xl border-2 border-primary/40 bg-[var(--surface-canvas)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <PackageCheck className="h-4 w-4" aria-hidden />
          </span>
          <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
            Recepción en patio
          </CardTitle>
        </div>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">{balance.recibidas}</b>/{balance.declaradas} piezas ·{" "}
          <b className="text-[var(--text-primary)]">{balance.volumenRecibido.toFixed(4)}</b> m³ recibidos
        </span>
      </div>

      {/* Las mismas tres acciones del alta, sobre TODAS las piezas: recibir una
          guía de sesenta y corregirla de a una son el mismo trabajo. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Sobre las {madres.length}
        </span>
        <button type="button" onClick={() => aplicarLote((p) => marcarRecepcion(p, undefined, true))} className={BTN_LOTE}>
          <Check className="h-4 w-4" aria-hidden /> Llegaron todas
        </button>
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
          <CalendarClock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <span className="sr-only sm:not-sr-only">Recibidas el</span>
          <input
            type="date"
            value={fechaLote}
            onChange={(e) => setFechaLote(e.target.value)}
            aria-label="Fecha de recepción a aplicar a todas"
            className="h-9 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="button"
          onClick={() => aplicarLote((p) => fecharRecepcion(p, undefined, fechaLote))}
          disabled={!fechaLote}
          className={BTN_LOTE}
        >
          Aplicar fecha
        </button>
        <button type="button" onClick={() => void generarCodigos()} disabled={numerando} className={BTN_LOTE}>
          {numerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}
          Generar códigos
        </button>
      </div>

      {/* Un código repetido hace que el servidor rechace la recepción ENTERA. */}
      {repetidos.size > 0 && (
        <p className="flex items-start gap-1.5 border-b border-[var(--rule-soft)] bg-[var(--data-error-50)] px-4 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          El código {[...repetidos].join(", ")} está puesto en más de una pieza. Cada troza lleva el suyo: renumeralas
          antes de guardar.
        </p>
      )}

      {avisos.length > 0 && (
        <ul className="space-y-1 border-b border-[var(--rule-soft)] bg-[var(--data-warning-50)] px-4 py-3 dark:bg-[var(--data-warning-500)]/10">
          {avisos.map((a) => (
            <li key={a} className="flex items-start gap-1.5 text-sm leading-snug text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      )}

      {/* Cards por debajo de 48rem del CONTENEDOR: esto vive dentro del modal de
          detalle del ingreso, así que el viewport no dice nada sobre el ancho
          real. Y la recepción se hace parado frente a la pila — siete columnas,
          tres con input, no entran en un celular. */}
      <ul className="space-y-2 p-3 @3xl:hidden">
        {conCambios.map((t) => (
          <CtpRecepcionTrozaCard
            key={t.id}
            troza={t}
            onCambio={(parche) => tocar(t.id, parche)}
          />
        ))}
      </ul>

      <div className="hidden overflow-x-auto @3xl:block">
        <DataTable className="w-full text-sm hoja-grilla">
          <thead>
            <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <th className="px-3 py-2 font-bold">Codificación</th>
              <th className="px-3 py-2 font-bold">Especie</th>
              <th className="px-3 py-2 text-right font-bold">Vol. m³</th>
              <th className="px-3 py-2 font-bold">Código de planta</th>
              <th className="px-3 py-2 font-bold" title="Cuándo bajó del camión">Recepción</th>
              <th className="px-3 py-2 font-bold">Parcela de corta</th>
              <th className="px-3 py-2 text-center font-bold">¿Llegó?</th>
              <th className="px-3 py-2 font-bold">Observación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {madres.map((t) => {
              const falta = Boolean(valor(t, "noRecepcionada"));
              return (
                <tr key={t.id} className={falta ? "bg-[var(--data-error-50)]/40 dark:bg-[var(--data-error-500)]/10" : undefined}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                    {t.codificacion ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {t.volumenM3 != null ? Number(t.volumenM3).toFixed(4) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={valor(t, "codigoPlanta") ?? ""}
                      onChange={(e) => tocar(t.id, { codigoPlanta: e.target.value })}
                      disabled={falta}
                      placeholder="Ej: 118"
                      aria-invalid={repetidos.has((normalizarCodigo(valor(t, "codigoPlanta")) ?? "").toUpperCase())}
                      className={
                        CAMPO_TABLA +
                        " w-28 font-mono" +
                        (repetidos.has((normalizarCodigo(valor(t, "codigoPlanta")) ?? "").toUpperCase())
                          ? " border-[var(--data-error-500)]"
                          : "")
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={valor(t, "fechaRecepcion") ?? ""}
                      onChange={(e) => tocar(t.id, { fechaRecepcion: e.target.value || null })}
                      disabled={falta}
                      aria-label={`Fecha en que llegó la troza ${t.codificacion ?? t.id}`}
                      className={CAMPO_TABLA + " w-[8.5rem]"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={valor(t, "parcela") ?? ""}
                      onChange={(e) => tocar(t.id, { parcela: e.target.value })}
                      disabled={falta}
                      placeholder="PC-03"
                      className={CAMPO_TABLA + " w-28 font-mono"}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => tocar(t.id, { noRecepcionada: !falta })}
                      title={falta ? "Marcar como recibida" : "Marcar como NO llegada"}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-colors ${
                        falta
                          ? "border-[var(--data-error-500)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                          : "border-[var(--rule-base)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                      }`}
                    >
                      {falta ? <X className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={valor(t, "recepcionObs") ?? ""}
                      onChange={(e) => tocar(t.id, { recepcionObs: e.target.value })}
                      placeholder={falta ? "¿Por qué no llegó?" : "Rajadura, pudrición…"}
                      className={CAMPO_TABLA + " w-full min-w-40"}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      {error && (
        <p className="border-t border-[var(--rule-soft)] px-4 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--rule-soft)] px-4 py-3">
        <span className="mr-auto text-sm text-[var(--text-tertiary)]">
          {cambios.length === 0 ? "Sin cambios todavía." : `${cambios.length} troza(s) con cambios sin guardar.`}
        </span>
        <button
          type="button"
          onClick={onCerrar}
          disabled={guardando}
          className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || cambios.length === 0}
          className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:opacity-40"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Guardar recepción
        </button>
      </div>
    </section>
  );
}
