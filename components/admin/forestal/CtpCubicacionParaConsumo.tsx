"use client";

/**
 * La cubicación de la aserrada, del lado del CONSUMO (ADR-370).
 *
 * En el patio el orden real es al revés del que pedía el libro: primero se
 * asierra y se cubica lo que salió, y recién después se anota qué trozas se
 * comieron. Este bloque hace ese camino — se mide acá, se guarda, y la medición
 * queda disponible para el momento de cargar la sierra.
 *
 * Y lo que sale de una jornada no siempre se declara en un solo asiento: el
 * Libro de Operaciones se lleva **día por día**, así que un lote que se cortó en
 * tres días son tres corridas. Por eso el resumen no muestra sólo el total:
 * reparte lo medido entre las trozas elegidas (cada una ampara hasta su
 * capacidad, `m³ × % aprovechable`) y entre los días que se declaren, con la
 * MISMA cuenta que la pestaña Resúmenes — `distribuirPorCapacidad`, pura y con
 * 33 tests. Una segunda fórmula para el mismo reparto sería una segunda verdad.
 */

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Layers, Ruler, Scale } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { recubicarPiezas } from "@/lib/forestal/cubicacion";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import {
  APROVECHABLE_DEFAULT,
  distribuirPorCapacidad,
  type BloqueRolliza,
} from "@/lib/forestal/cubicacion-reparto";
import { useCubicacionesGuardadas } from "@/hooks/use-cubicaciones-guardadas";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import CtpCubicarProductoModal from "./CtpCubicarProductoModal";
import CtpJornadasDelTurno from "./CtpJornadasDelTurno";
import type { Jornada } from "@/lib/forestal/consumo-en-jornadas";
import type { ResumenJornadas } from "@/lib/forestal/registrar-jornadas";
import { Btn, I } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Una troza elegida para la sierra, con lo que el reparto necesita de ella. */
export interface TrozaParaReparto {
  id: string;
  etiqueta: string;
  especie: string;
  m3: number;
}

export default function CtpCubicacionParaConsumo({
  trozas,
  lote,
  fecha,
  registrar,
  ocupado = false,
  avance = null,
  onAviso,
}: {
  /** Lo tildado en el patio: los bloques de rolliza contra los que se reparte. */
  trozas: TrozaParaReparto[];
  /** Dónde se abren las corridas. Sin lote, el reparto se ve pero no se escribe. */
  lote?: { id: string; code: string } | null;
  /** Fecha de la primera jornada; las siguientes son días corridos. */
  fecha?: string;
  registrar?: (jornadas: Jornada[], loteId: string) => Promise<ResumenJornadas>;
  ocupado?: boolean;
  avance?: { hechas: number; total: number } | null;
  onAviso: (mensaje: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  /** Colapsado por defecto (Brandon, 2026-09-01): ocupaba una franja entera
   *  aunque la mayoría de las veces está en «Ninguna — sólo consumir». Se
   *  reabre solo cuando hay algo que mostrar (una cubicación recién guardada)
   *  o cuando el operario lo pide. */
  const [expandido, setExpandido] = useState(false);
  const [elegida, setElegida] = useState<string>("");
  const [dias, setDias] = useState(1);
  const [aprovechable, setAprovechable] = useState(APROVECHABLE_DEFAULT);
  const guardadas = useCubicacionesGuardadas();
  /** Lo guardado en esta sesión, para que aparezca sin recargar la pestaña. */
  const [recien, setRecien] = useState<CubicacionRegistro[]>([]);

  const lista = useMemo(() => [...recien, ...guardadas.lista], [recien, guardadas.lista]);
  const cubicacion = useMemo(() => lista.find((c) => c.id === elegida) ?? null, [lista, elegida]);
  // Re-cubicadas: una cubicación guardada hace meses puede traer el m³ viejo.
  const piezas: PiezaCubicada[] = useMemo(() => recubicarPiezas(cubicacion?.piezas ?? []), [cubicacion]);

  /* Las trozas elegidas son los bloques: cada una ampara hasta su capacidad y lo
     que no entra queda como faltante — no se prorratea (ADR de reparto). */
  const bloques = useMemo<BloqueRolliza[]>(
    () =>
      trozas.map((t) => ({
        id: t.id,
        etiqueta: t.etiqueta,
        especie: t.especie,
        m3: t.m3,
        origen: "trozas",
        aprovechablePct: aprovechable,
        dias,
      })),
    [trozas, aprovechable, dias],
  );

  const distribucion = useMemo(
    () => (piezas.length > 0 && bloques.length > 0 ? distribuirPorCapacidad(bloques, piezas, "tipo") : null),
    [bloques, piezas],
  );

  const totales = useMemo(
    () => ({
      piezas: piezas.reduce((a, p) => a + (Number(p.cantidad) || 0), 0),
      pieTablar: Math.round(piezas.reduce((a, p) => a + (Number(p.pieTablar) || 0), 0) * 100) / 100,
      m3: Math.round(piezas.reduce((a, p) => a + (Number(p.m3) || 0), 0) * 10_000) / 10_000,
      rollizaM3: Math.round(trozas.reduce((a, t) => a + t.m3, 0) * 10_000) / 10_000,
    }),
    [piezas, trozas],
  );
  const rendimiento =
    totales.rollizaM3 > 0 && totales.m3 > 0 ? Math.round((totales.m3 / totales.rollizaM3) * 1000) / 10 : null;

  return (
    <section className="space-y-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          className="flex min-w-0 flex-1 items-center gap-x-3 gap-y-1 text-left"
        >
          <Ruler className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
            Cubicación de lo aserrado
          </CardTitle>
          {expandido ? (
            <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
              Medí lo que salió de la sierra y usalo al cargar el consumo: el reparto dice qué le toca a cada
              troza y a cada día.
            </p>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-tertiary)]">
              {cubicacion ? `${cubicacion.nombre} · ${fmtM3(totales.m3)} m³` : "Ninguna — sólo consumir"}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${expandido ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <Btn variant="primary" onClick={() => setAbierto(true)}>
          <Ruler className="h-4 w-4" /> Cubicar madera
        </Btn>
      </header>

      {expandido && (
      <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-12">
        <label className="sm:col-span-6">
          <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Cubicación a usar
          </span>
          <select className={I} value={elegida} onChange={(e) => setElegida(e.target.value)}>
            <option value="">Ninguna — sólo consumir</option>
            {lista.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {c.totales.piezas} pza · {fmtM3(c.totales.m3)} m³ · {c.fecha}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-3">
          <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Días de aserrío
          </span>
          <input
            type="number"
            min={1}
            max={60}
            className={I}
            value={dias}
            onChange={(e) => setDias(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="sm:col-span-3">
          <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Aprovechable (%)
          </span>
          <input
            type="number"
            min={1}
            max={100}
            step="0.1"
            className={I}
            value={aprovechable}
            onChange={(e) => setAprovechable(Math.min(100, Math.max(1, Number(e.target.value) || APROVECHABLE_DEFAULT)))}
          />
        </label>
      </div>

      {/* El resumen: qué se midió, contra cuánta rolliza y con qué rendimiento. */}
      {cubicacion && (
        <div className="grid gap-2 sm:grid-cols-4">
          <Cifra icon={Layers} label="Aserrada medida" valor={`${fmtM3(totales.m3)} m³`} sub={`${totales.piezas} piezas · ${pieTablarDe(totales.m3).toLocaleString("es-PE")} pt`} />
          <Cifra icon={Scale} label="Rolliza elegida" valor={`${fmtM3(totales.rollizaM3)} m³`} sub={`${trozas.length} troza${trozas.length === 1 ? "" : "s"} tildada${trozas.length === 1 ? "" : "s"}`} />
          <Cifra icon={Scale} label="Rendimiento" valor={rendimiento != null ? `${rendimiento} %` : "—"} sub={`Aprovechable declarado ${aprovechable} %`} />
          <Cifra icon={CalendarDays} label="Días" valor={String(dias)} sub={dias === 1 ? "Todo en una jornada" : `${fmtM3(totales.m3 / dias)} m³ por día`} />
        </div>
      )}

      {/* El reparto por troza y por día: es lo que después se declara asiento
          por asiento en el libro. */}
      {distribucion && (
        <div className="space-y-2">
          {distribucion.especies.map((esp) => (
            <div key={esp.especie} className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
              <div className="flex flex-wrap items-baseline justify-between gap-2 bg-[var(--surface-sunken)] px-3 py-1.5">
                <b className="text-sm text-[var(--text-primary)]">{esp.especie}</b>
                <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  rolliza {fmtM3(esp.rollizaM3)} m³ · aserrada {fmtM3(esp.aserradaM3)} m³
                  {esp.rendimientoPct != null ? ` · ${esp.rendimientoPct} %` : ""}
                </span>
              </div>
              <ul className="divide-y divide-[var(--rule-soft)]">
                {esp.bloques.map((b) => (
                  <li key={b.bloque.id} className="px-3 py-1.5 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono font-bold text-[var(--text-primary)]">{b.bloque.etiqueta}</span>
                      <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                        ampara {fmtM3(b.capacidadM3)} m³ · usado {fmtM3(b.usadoM3)} m³
                        {b.libreM3 > 0 ? ` · libre ${fmtM3(b.libreM3)}` : ""}
                      </span>
                    </div>
                    {b.porDia.length > 1 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {b.porDia.map((d) => (
                          <span
                            key={d.dia}
                            className="rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]"
                          >
                            día {d.dia}: {fmtM3(d.m3)} m³ · {d.piezas} pza
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {distribucion.totales.faltanteM3 > 0 && (
            <p className="rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Quedan {fmtM3(distribucion.totales.faltanteM3)} m³ de aserrada que ninguna troza elegida puede
              amparar (harían falta {fmtM3(distribucion.totales.rollizaFaltanteM3)} m³ de rolliza al{" "}
              {aprovechable} %). Tildá más trozas o revisá el aprovechable.
            </p>
          )}
        </div>
      )}

      {/* Del reparto al libro: las jornadas se ven antes de escribirlas. */}
      {distribucion && registrar && (
        <CtpJornadasDelTurno
          bloques={distribucion.especies.flatMap((e) => e.bloques)}
          dias={dias}
          fechaInicio={fecha ?? new Date().toISOString().slice(0, 10)}
          lote={lote ?? null}
          ocupado={ocupado}
          avance={avance}
          onRegistrar={async (jornadas, loteId) => {
            const r = await registrar(jornadas, loteId);
            onAviso(r.mensaje);
            return r;
          }}
        />
      )}
      </div>
      )}

      {abierto && (
        <CtpCubicarProductoModal
          filas={[]}
          ctpEntryIds={[]}
          titulo={`Aserrada del ${new Date().toLocaleDateString("es-PE")}`}
          onClose={() => setAbierto(false)}
          onGuardada={(msg, registro) => {
            setAbierto(false);
            if (registro) {
              setRecien((p) => [registro, ...p]);
              setElegida(registro.id);
              setExpandido(true);
            }
            onAviso(msg);
          }}
        />
      )}
    </section>
  );
}

function Cifra({
  icon: Icon,
  label,
  valor,
  sub,
}: {
  icon: typeof Layers;
  label: string;
  valor: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{valor}</p>
      <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>
    </div>
  );
}
