"use client";

/**
 * CtpTrozasDespachoModal — «Trozas / productos ingresados» (ADR-363).
 *
 * El otro origen de la lista de una guía: la madera que sale **como entró**, sin
 * pasar por la sierra. Un CTP no siempre asierra lo que compra — parte se
 * revende en rollo — y esa salida es un despacho igual, sólo que su cadena de
 * custodia es más corta: la troza se señala en la guía con la que entró.
 *
 * Es el MISMO patio que el picker de consumo (`CtpTrozasPicker`): las mismas
 * piezas, los mismos filtros y el mismo predicado de disponibilidad —una troza
 * ya aserrada, no recibida, descarte o partida en pedazos no puede subir al
 * camión (T2)—. Lo que cambia es a dónde va.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, TreePine } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  LABEL_BLOQUEO,
  estaDisponible,
  filtrarTrozas,
  motivoBloqueo,
  type TrozaConsumible,
} from "@/lib/forestal/consumo-trozas";
import { r4, uidDeFila, type FilaDespacho } from "@/lib/forestal/despacho-lista";
import { Btn, ModalFooter } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";

const CAMPO =
  "h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Lo que la guía declara de una troza que sale sin aserrar. */
const PRODUCTO_ROLLIZO = "MADERA EN ROLLO";
const PRESENTACION_ROLLIZO = "TROZAS";

const fmtDia = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";

/** La troza del patio, traducida a un renglón de la lista de la guía. */
export function filaDeTroza(t: TrozaConsumible): FilaDespacho {
  return {
    uid: uidDeFila(`troza:${t.id}`, null),
    // La atribución NO es una corrida: esta fila viaja por `trozas[]`.
    corridaId: "",
    trozaId: t.id,
    lineNo: null,
    paqueteId: null,
    especie: t.especieComun,
    especieCientifica: t.especieCientifica ?? null,
    cites: false,
    producto: PRODUCTO_ROLLIZO,
    codigo: t.codigoPlanta || t.codificacion || null,
    presentacion: PRESENTACION_ROLLIZO,
    cantidad: 1,
    espesorCm: null,
    anchoCm: null,
    largoM: t.largoM ?? null,
    volumen: r4(Number(t.volumenM3 ?? 0)),
    unidad: "m3",
    /* El techo de una troza es ella misma: no hay saldo de corrida que repartir. */
    disponibleCorrida: r4(Number(t.volumenM3 ?? 0)),
    gtfOrigen: t.gtfNumber ? [t.gtfNumber] : [],
    titularOrigen: t.permiso ? [t.permiso] : [],
    lote: t.loteAserrioCode ?? null,
    linea: null,
    fechaProduccion: t.fechaRecepcion ?? t.fechaIngreso ?? null,
  };
}

export default function CtpTrozasDespachoModal({
  yaElegidas,
  onAgregar,
  onCerrar,
}: {
  /** Ids de trozas ya en la lista de la guía: no se ofrecen dos veces. */
  yaElegidas: ReadonlySet<string>;
  onAgregar: (filas: FilaDespacho[]) => void;
  onCerrar: () => void;
}) {
  const [trozas, setTrozas] = useState<TrozaConsumible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState("");
  const [gtf, setGtf] = useState("");
  const [soloDisponibles, setSoloDisponibles] = useState(true);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/trozas/patio", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { trozas?: TrozaConsumible[] }) => { if (vivo) { setTrozas(j.trozas ?? []); setError(null); } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const opciones = useMemo(() => {
    const unicos = (vals: (string | null | undefined)[]) =>
      [...new Set(vals.map((v) => (v ?? "").trim()).filter(Boolean))].sort();
    return { especies: unicos(trozas.map((t) => t.especieComun)), guias: unicos(trozas.map((t) => t.gtfNumber)) };
  }, [trozas]);

  const visibles = useMemo(
    () => filtrarTrozas(trozas, { texto, especie, gtf, soloDisponibles }).filter((t) => !yaElegidas.has(t.id)),
    [trozas, texto, especie, gtf, soloDisponibles, yaElegidas],
  );
  const { visibles: enPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(visibles, { porPaginaInicial: 25 });

  const seleccionadas = useMemo(() => visibles.filter((t) => elegidas.has(t.id)), [visibles, elegidas]);
  const totalM3 = r4(seleccionadas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));

  return (
    <AdminModal
      open
      onClose={onCerrar}
      variant="wide"
      title="Trozas y productos ingresados"
      description="La madera que sale como entró, sin pasar por la sierra"
      icon={TreePine}
      className="sm:w-[min(96vw,84rem)] sm:max-w-none"
      footer={
        <ModalFooter
          error={error}
          nota={
            seleccionadas.length > 0 ? (
              <span>
                <b className="text-[var(--text-primary)]">{seleccionadas.length}</b> troza{seleccionadas.length === 1 ? "" : "s"} ·{" "}
                <span className="font-mono tabular-nums">{fmtM3(totalM3)} m³</span>
              </span>
            ) : (
              <span>{visibles.length} pieza{visibles.length === 1 ? "" : "s"} en el patio</span>
            )
          }
        >
          <Btn variant="ghost" onClick={onCerrar}>Cerrar</Btn>
          <Btn
            variant="primary"
            disabled={seleccionadas.length === 0}
            onClick={() => { onAgregar(seleccionadas.map(filaDeTroza)); onCerrar(); }}
          >
            Agregar trozas{seleccionadas.length > 0 ? ` (${seleccionadas.length})` : ""}
          </Btn>
        </ModalFooter>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Código de la troza, marca de planta o guía…"
              aria-label="Buscar una troza del patio"
              className={`${CAMPO} pl-9`}
            />
          </label>
          <select value={especie} onChange={(e) => setEspecie(e.target.value)} aria-label="Filtrar por especie" className={CAMPO}>
            <option value="">Todas las especies</option>
            {opciones.especies.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
          </select>
          <select value={gtf} onChange={(e) => setGtf(e.target.value)} aria-label="Filtrar por guía de ingreso" className={CAMPO}>
            <option value="">Todas las guías</option>
            {opciones.guias.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={soloDisponibles}
            onChange={(e) => setSoloDisponibles(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Sólo las que se pueden despachar
          <span className="text-xs text-[var(--text-tertiary)]">
            (una troza ya aserrada, no recibida, descarte o partida en pedazos no puede subir al camión)
          </span>
        </label>

        <TablaCtp altoMax="max-h-[52vh]">
          <TheadCtp>
            <tr>
              <th className="px-2 py-2" />
              <th className="px-3 py-2 font-bold">Código</th>
              <th className="px-3 py-2 font-bold">Marca de planta</th>
              <th className="px-3 py-2 font-bold">Especie</th>
              <th className="px-3 py-2 font-bold">GTF de ingreso</th>
              <th className="px-3 py-2 font-bold">Título habilitante</th>
              <th className="px-3 py-2 font-bold">Recepción</th>
              <th className="px-3 py-2 text-right font-bold">Largo (m)</th>
              <th className="px-3 py-2 text-right font-bold">Volumen (m³)</th>
              <th className="px-3 py-2 font-bold">Estado</th>
            </tr>
          </TheadCtp>
          <TbodyCtp>
            {enPagina.length === 0 && (
              <FilaVacia cols={10}>
                {cargando ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo el patio…</span>
                ) : trozas.length === 0 ? (
                  "El patio no tiene piezas cargadas. Se cargan al recibir la guía, en Ingresos."
                ) : (
                  "Ninguna troza coincide con los filtros."
                )}
              </FilaVacia>
            )}
            {enPagina.map((t) => {
              const bloqueo = motivoBloqueo(t);
              const libre = estaDisponible(t);
              const elegida = elegidas.has(t.id);
              return (
                <tr key={t.id} className={elegida ? "bg-[var(--data-success-500)]/10" : "hover:bg-[var(--surface-sunken)]"}>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={elegida}
                      disabled={!libre}
                      onChange={() =>
                        setElegidas((prev) => {
                          const s = new Set(prev);
                          if (s.has(t.id)) s.delete(t.id); else s.add(t.id);
                          return s;
                        })
                      }
                      aria-label={`Elegir la troza ${t.codificacion ?? t.id}`}
                      className="h-4 w-4 accent-[var(--accent)] disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-sm font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{t.codigoPlanta ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{t.gtfNumber ?? "—"}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-[var(--text-tertiary)]">{t.permiso ?? "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-tertiary)]">{fmtDia(t.fechaRecepcion ?? t.fechaIngreso)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{t.largoM ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {fmtM3(Number(t.volumenM3 ?? 0))}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {bloqueo ? (
                      <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{LABEL_BLOQUEO[bloqueo]}</span>
                    ) : (
                      <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">En el patio</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </TbodyCtp>
        </TablaCtp>

        {visibles.length > 0 && (
          <CtpPaginacion rango={rango} porPagina={porPagina} onPorPagina={setPorPagina} onIr={ir} sustantivo="troza" />
        )}
      </div>
    </AdminModal>
  );
}
