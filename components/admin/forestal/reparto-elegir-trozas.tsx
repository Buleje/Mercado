"use client";

import { useMemo, useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { Casilla } from "@/components/ui-system/Casilla";
import { logger } from "@/lib/logger";
import type { BloqueDistribuido, BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { ordenarPorLlegada } from "@/lib/forestal/trozas-para-bloque";
import { useTrozasParaBloque } from "./hooks/use-trozas-para-bloque";
import { anotarElegidasEnLaGuardada } from "./reparto-lotes-sugeridos-api";

/**
 * reparto-elegir-trozas — «Elegir las trozas» de un bloque (ADR-519, fase 1).
 *
 * Un bloque sembrado desde Capacidad trae TODAS las trozas del grupo (65
 * trozas, 96,957 m³ para amparar 10 m³). Esto propone las que de verdad hacen
 * falta —enteras, primero las que llegaron antes, cada día bajo su tope— y
 * deja quitar o agregar a mano. Lo guardado vive en `trozasElegidas`: el lote
 * por bloque y las jornadas leen ésas, y «Volver a todas» lo deshace.
 *
 * Autocontenido a propósito: la fase 4 lo monta como un paso del recorrido.
 */

type Aplicar = (bloqueId: string, cambio: (b: BloqueRolliza) => BloqueRolliza) => void;

const PRIMARIO = button({ variant: "primary", size: "sm" });
const SECUNDARIO = button({ variant: "secondary", size: "sm" });
const PLEGAR = button({ variant: "ghost", size: "sm", className: "gap-1.5 px-2" });

const AVISO =
  "flex items-start gap-1.5 text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

/** «2026-10-14T…» → «14/10/2026», en UTC (la llegada es un día, no una hora). */
const fechaCorta = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

export default function RepartoElegirTrozas({
  bd,
  distribucionId,
  aplicar,
}: {
  bd: BloqueDistribuido;
  distribucionId: string | null;
  aplicar: Aplicar;
}) {
  const b = bd.bloque;
  const [abierto, setAbierto] = useState(false);
  const { datos, error, cargando, recargar } = useTrozasParaBloque(bd, distribucionId, abierto);
  const guardadas = useMemo(() => b.trozasElegidas ?? [], [b.trozasElegidas]);
  const [editadas, setEditadas] = useState<Set<string> | null>(null);
  const [guardando, setGuardando] = useState(false);

  const sel = datos?.seleccion;
  /* Las que consumieron los días ya escritos son del bloque: siempre marcadas. */
  const enLibro = useMemo(() => new Set(datos?.yaEnElLibro ?? []), [datos]);
  const base = guardadas.length > 0 ? guardadas : (sel?.elegidas ?? []);
  const marcadas = new Set([...(editadas ?? base), ...enLibro]);
  /* Con lote, elegir no saca piezas de él: se mira, no se guarda. */
  const conLote = Boolean(b.loteId);
  const descartada = useMemo(
    () => new Map((sel?.descartadas ?? []).map((d) => [d.id, d.motivo])),
    [sel],
  );
  const propuestas = useMemo(() => new Set(sel?.elegidas ?? []), [sel]);
  const filas = useMemo(() => ordenarPorLlegada(datos?.trozas ?? []), [datos]);
  const volDe = useMemo(() => new Map(filas.map((t) => [t.id, t.volumenM3])), [filas]);
  const marcadasM3 = [...marcadas].reduce((a, id) => a + (volDe.get(id) ?? 0), 0);
  const objetivo = sel?.objetivoRollizaM3 ?? 0;
  /* El objetivo es de los días que faltan escribir: lo ya escrito no lo cubre. */
  const pendientesM3 = [...marcadas]
    .filter((id) => !enLibro.has(id))
    .reduce((a, id) => a + (volDe.get(id) ?? 0), 0);
  const faltaMarcadas = Math.max(0, objetivo - pendientesM3);
  const total = b.trozaIds?.length ?? 0;
  const cambio = [...marcadas].sort().join() !== [...guardadas].sort().join();

  const alternar = (id: string) => {
    const next = new Set(marcadas);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEditadas(next);
  };

  const guardar = (ids: string[] | null) => {
    setGuardando(true);
    /* En el orden de llegada: el mismo que propone la regla. */
    const orden = ids ? filas.map((t) => t.id).filter((id) => ids.includes(id)) : null;
    const valor = orden && orden.length > 0 ? orden : null;
    aplicar(b.id, (x) => ({ ...x, trozasElegidas: valor }));
    setEditadas(null);
    const anotar = distribucionId
      ? anotarElegidasEnLaGuardada(distribucionId, b.id, valor)
      : Promise.resolve();
    anotar
      .catch((err: unknown) =>
        logger.error("[reparto] anotar las trozas elegidas en la distribución guardada falló", {
          error: String(err),
        }),
      )
      .finally(() => setGuardando(false));
  };

  const resumen =
    guardadas.length > 0
      ? `${guardadas.length} de ${total} trozas elegidas`
      : `${total} troza${total === 1 ? "" : "s"} del grupo · sin elegir`;

  return (
    <section className="mx-3 mt-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className={PLEGAR}
        >
          {abierto ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
          <CardTitle as="span">Trozas que ampara</CardTitle>
        </button>
        <span className="text-xs text-[var(--text-secondary)]">{resumen}</span>
        <InfoTip
          title="Elegir las trozas"
          what="El bloque trae todas las trozas del grupo. Aquí se proponen sólo las que hacen falta para lo que usaste: enteras, primero las que llegaron antes, y ningún día por encima de su tope de rendimiento."
          affects="El lote del bloque y las jornadas del Libro usan sólo las elegidas. Las que no llegaron al patio, las de otro lote y los días de mes cerrado no entran."
          example="Bloque de 10 m³ usados al 55 % → hacen falta 18,182 m³ de rolliza → se eligen 12 trozas (18,640 m³), no las 65 del grupo."
        />
      </div>

      {abierto && (
        <div className="space-y-2 px-3 pb-3">
          {cargando && !datos && (
            <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las trozas que hacen
              falta…
            </p>
          )}
          {error && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              <button type="button" onClick={recargar} className={SECUNDARIO}>
                Reintentar
              </button>
            </p>
          )}

          {sel && (
            <>
              <p className="text-sm text-[var(--text-primary)]">
                Propuesta: <b className="tabular-nums">{sel.elegidas.length}</b> troza
                {sel.elegidas.length === 1 ? "" : "s"} ·{" "}
                <b className="tabular-nums">{fmtM3(sel.elegidasM3)} m³</b> para{" "}
                <span className="tabular-nums">{fmtM3(sel.objetivoRollizaM3)} m³</span> de rolliza
                necesaria
                {sel.excesoM3 > 0 ? (
                  <span className="text-[var(--text-secondary)]">
                    {" "}
                    · sobran {fmtM3(sel.excesoM3)} m³
                  </span>
                ) : null}
              </p>
              {conLote && (
                <p className={AVISO}>
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  Este bloque ya tiene su lote: elegir no suelta las que ya están en él.
                </p>
              )}
              {sel.faltaM3 > 0 && (
                <p className={AVISO}>
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  Faltan {fmtM3(sel.faltaM3)} m³ de rolliza: no hay más trozas disponibles para este
                  bloque.
                </p>
              )}
              {sel.porDia
                .filter((d) => d.motivo)
                .map((d) => (
                  <p key={d.dia} className={AVISO}>
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Día {d.dia}:{" "}
                    {d.motivo}
                  </p>
                ))}
              {sel.avisos.map((a) => (
                <p key={a} className={AVISO}>
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {a}
                </p>
              ))}

              <DataTable className="w-full">
                <caption className="sr-only">Trozas del bloque {b.etiqueta}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-12">
                      <span className="sr-only">Elegida</span>
                    </th>
                    <th scope="col">Troza</th>
                    <th scope="col">Llegó</th>
                    <th scope="col" className="text-right">
                      m³
                    </th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((t) => {
                    const motivo = descartada.get(t.id);
                    const escrita = enLibro.has(t.id);
                    return (
                      <tr key={t.id}>
                        <td>
                          <Casilla
                            checked={marcadas.has(t.id)}
                            disabled={Boolean(motivo) || escrita || conLote}
                            onChange={() => alternar(t.id)}
                            aria-label={`Elegir la troza ${t.codigo ?? t.id}`}
                          />
                        </td>
                        <td className="font-mono">{t.codigo ?? t.id}</td>
                        <td className="tabular-nums">{fechaCorta(t.llegaISO)}</td>
                        <td className="text-right tabular-nums">{fmtM3(t.volumenM3)}</td>
                        <td
                          className={
                            motivo ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"
                          }
                        >
                          {escrita
                            ? "Ya en el Libro"
                            : (motivo ?? (propuestas.has(t.id) ? "Propuesta" : "No hace falta"))}
                        </td>
                      </tr>
                    );
                  })}
                  {(datos?.noEncontradas ?? []).map((id) => (
                    <tr key={id}>
                      <td />
                      <td className="font-mono">{id}</td>
                      <td>—</td>
                      <td className="text-right">—</td>
                      <td className="text-[var(--text-tertiary)]">
                        No está en el patio de este negocio
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--text-secondary)]">
                  Marcadas:{" "}
                  <b className="tabular-nums text-[var(--text-primary)]">{marcadas.size}</b> ·{" "}
                  {fmtM3(marcadasM3)} m³
                  {faltaMarcadas > 0 ? (
                    <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      {" "}
                      · faltan {fmtM3(faltaMarcadas)} m³
                    </span>
                  ) : null}
                </span>
                <span className="flex-1" />
                {editadas && !conLote && (
                  <button type="button" onClick={() => setEditadas(null)} className={SECUNDARIO}>
                    Deshacer cambios
                  </button>
                )}
                {guardadas.length > 0 && !conLote && (
                  <button
                    type="button"
                    onClick={() => guardar(null)}
                    disabled={guardando}
                    className={SECUNDARIO}
                  >
                    Volver a todas
                  </button>
                )}
                {!conLote && (
                  <button
                    type="button"
                    onClick={() => guardar([...marcadas])}
                    disabled={guardando || marcadas.size === 0 || (!cambio && guardadas.length > 0)}
                    className={PRIMARIO}
                  >
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Guardar elegidas
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
