"use client";

/**
 * CtpHistoriaLoteView — el expediente de un lote de aserrío, de punta a punta.
 *
 * La vista «Lotes de aserrío» es OPERATIVA: armar, cargar, producir. Contesta
 * «¿qué hago hoy?». Esta contesta la otra pregunta, la que llega después —de un
 * comprador, de un fiscalizador, o del propio dueño tres meses más tarde—:
 * **«¿qué pasó con este lote?»**. Mezclarlas ensuciaba las dos.
 *
 * El recorrido y sus reglas viven en `lib/forestal/historia-lote.ts` (puro, con
 * tests); acá se elige el lote y se dibuja. La regla que más importa no es de
 * pantalla: cuando una corrida se comparte entre dos lotes, lo que salió NO se
 * reparte por regla de tres — se declara como techo y como hueco. Un expediente
 * que inventa el número que tiene que probar no sirve para nada.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Printer, RefreshCw } from "@buleje/design-system/icons";
import { Btn, PanelSkeleton, VistaHeader } from "./ctp-shared";
import { Etapa, ProduccionDelLote, SalidaDelLote, TablaDeTrozas } from "./historia/EtapasDelLote";
import { useHistoriaLote } from "@/hooks/use-historia-lote";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { esLoteDeInventario } from "@/lib/forestal/lotes-aserrio";
import { imprimirHistoriaLote } from "@/lib/forestal/historia-lote-print";

const n4 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(4));
const nf = (v: number) => v.toLocaleString("es-PE");
const unidad = (u: string | null | undefined) => (!u || u === "m3" ? "m³" : u);
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export default function CtpHistoriaLoteView({ loteInicial }: { loteInicial?: string | null }) {
  const { lotes, cargando: cargandoLotes } = useLotesAserrio();
  const [loteId, setLoteId] = useState<string | null>(loteInicial ?? null);

  /* Se abre en el primer lote CON algo adentro. Abrir en uno vacío muestra
     cuatro etapas en blanco y parece que la pantalla no anda. */
  useEffect(() => {
    if (loteId || lotes.length === 0) return;
    const conMadera = lotes.find((l) => (l.trozas?.length ?? 0) > 0 || (l.volumenM3 ?? 0) > 0);
    setLoteId((conMadera ?? lotes[0]).id);
  }, [lotes, loteId]);

  const { historia: h, cargando, error, recargar } = useHistoriaLote(loteId);
  const lote = useMemo(() => lotes.find((l) => l.id === loteId) ?? null, [lotes, loteId]);
  const deInventario = Boolean(lote && esLoteDeInventario(lote));

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Historia del lote"
        meta={h ? `${h.lote.code} · ${h.lote.speciesCommon ?? "sin especie"}` : undefined}
        hint="Todo lo que pasó con una pila de madera: qué trozas se apartaron, qué corrida se las comió, qué salió de ellas y con qué guía se fueron."
      >
        <select
          value={loteId ?? ""}
          onChange={(e) => setLoteId(e.target.value || null)}
          aria-label="Elegí el lote"
          className="h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)]"
        >
          {cargandoLotes && <option value="">Cargando lotes…</option>}
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} · {l.status}
              {(l.trozas?.length ?? 0) > 0 ? ` · ${l.trozas!.length} pz` : ""}
            </option>
          ))}
        </select>
        <Btn variant="dark" size="md" onClick={() => h && imprimirHistoriaLote(h)} disabled={!h}>
          <Printer className="h-4 w-4" /> Imprimir
        </Btn>
        <Btn variant="secondary" size="md" onClick={() => void recargar()} disabled={cargando}>
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Recargar
        </Btn>
      </VistaHeader>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2.5 text-sm font-medium text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No pude armar la historia: {error}
        </p>
      )}

      {cargando && !h && <PanelSkeleton kpis={4} />}
      {!cargando && !h && !error && lotes.length === 0 && (
        <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
          Todavía no hay lotes de aserrío. Armá uno en «Lotes de aserrío» y su historia empieza acá.
        </p>
      )}

      {h && (
        <>
          {/* Los huecos ARRIBA: lo que la cadena no puede afirmar se lee antes
              que la cadena, no después de creerle (mismo criterio que ADR-315). */}
          {h.huecos.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2.5 dark:bg-transparent">
              {h.huecos.map((x) => (
                <li key={x} className="flex items-start gap-2 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          )}

          {/* El recorrido en una línea: quien sólo quiere el número no baja. */}
          <dl className="grid grid-cols-2 divide-[var(--rule-soft)] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] sm:grid-cols-4 sm:divide-x">
            <Paso termino="Se apartó" valor={`${nf(h.armado.piezas)} pz`} pie={`${n4(h.armado.m3)} m³ en la pila`} />
            <Paso termino="Entró a la sierra" valor={`${n4(h.consumo.m3Total)} m³`} pie={`${nf(h.consumo.piezasConsumidas)} piezas consumidas`} />
            <Paso
              termino="Salió aserrado"
              valor={h.produccion.total ? `${n4(h.produccion.total.cantidad)} ${unidad(h.produccion.total.unit)}` : "—"}
              pie={h.produccion.rendimientoPct != null ? `${Number(h.produccion.rendimientoPct).toFixed(2)} % de rendimiento` : "sin rendimiento que calcular"}
            />
            <Paso termino="Se despachó" valor={`${n4(h.salida.total)} m³`} pie={`${n4(h.salida.enStock)} m³ todavía en planta`} />
          </dl>

          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            <Etapa
              n={1}
              titulo="Armado"
              resumen={`${fecha(h.armado.fecha)} · ${nf(h.armado.piezas)} piezas · ${n4(h.armado.m3)} m³`}
              vacio={
                h.armado.piezas === 0
                  ? deInventario
                    ? "Este lote se declaró como inventario: se cargó el volumen directamente, sin trozas reales que listar. No falta un dato — nunca existieron esas piezas en el patio."
                    : "El lote todavía no tiene piezas apartadas."
                  : undefined
              }
            >
              {h.armado.guias.length > 0 && (
                <p className="mb-2 text-sm text-[var(--text-secondary)]">
                  Piezas de {h.armado.guias.length === 1 ? "la guía" : "las guías"}{" "}
                  <span className="font-mono font-bold text-[var(--text-primary)]">{h.armado.guias.join(" · ")}</span>
                </p>
              )}
              {h.armado.fueraDeJuego.length > 0 && (
                <ul className="mb-2 space-y-0.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  {h.armado.fueraDeJuego.map((f) => (
                    <li key={f.codigo}>
                      <span className="font-mono font-bold text-[var(--text-primary)]">{f.codigo}</span>: {f.motivo}
                    </li>
                  ))}
                </ul>
              )}
              <TablaDeTrozas trozas={h.armado.trozas} />
            </Etapa>

            <Etapa
              n={2}
              titulo="Consumo"
              resumen={`${n4(h.consumo.m3Total)} m³ en ${h.consumo.corridas.length} ${h.consumo.corridas.length === 1 ? "corrida" : "corridas"}`}
              vacio={h.consumo.corridas.length === 0 ? "Todavía no entró a la sierra." : undefined}
            >
              <ul className="space-y-1.5">
                {h.consumo.corridas.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm">
                    <span className="font-bold text-[var(--text-primary)]">
                      Corrida N° {c.lineNo ?? "—"} <span className="font-normal text-[var(--text-tertiary)]">· {fecha(c.fecha)}</span>
                      {c.abierta && (
                        <span className="ml-2 rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                          sin declarar
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                      {n4(c.m3)} m³
                      {c.piezasDelLote > 0 && ` · ${nf(c.piezasDelLote)} pz de este lote (${n4(c.m3DelLote)} m³)`}
                    </span>
                  </li>
                ))}
              </ul>
            </Etapa>

            <Etapa
              n={3}
              titulo="Producción"
              resumen={
                h.produccion.total
                  ? `${n4(h.produccion.total.cantidad)} ${unidad(h.produccion.total.unit)} · ${nf(h.produccion.paquetes)} ${h.produccion.paquetes === 1 ? "paquete" : "paquetes"} · ${nf(h.produccion.piezas)} pz`
                  : "sin total (unidades mezcladas)"
              }
              vacio={h.produccion.corridas.length === 0 ? "Todavía no se declaró producción." : undefined}
            >
              <ProduccionDelLote produccion={h.produccion} />
            </Etapa>

            <Etapa
              n={4}
              titulo="Salida"
              resumen={
                h.salida.despachos.length > 0
                  ? `${n4(h.salida.total)} m³ en ${h.salida.despachos.length} ${h.salida.despachos.length === 1 ? "guía" : "guías"}`
                  : `${n4(h.salida.enStock)} m³ en planta`
              }
              vacio={
                h.salida.despachos.length === 0
                  ? "Nada de este lote salió todavía. Cuando emitas una guía con su producto, acá va a decir con qué GTF se fue, a dónde y junto a qué otros lotes viajó."
                  : undefined
              }
            >
              <SalidaDelLote salida={h.salida} />
            </Etapa>
          </div>
        </>
      )}
    </div>
  );
}

function Paso({ termino, valor, pie }: { termino: string; valor: string; pie: string }) {
  return (
    <div className="border-t border-[var(--rule-soft)] px-4 py-3 first:border-t-0 sm:border-t-0">
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {termino}
      </dt>
      <dd className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</dd>
      <p className="text-xs text-[var(--text-tertiary)]">{pie}</p>
    </div>
  );
}
