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
import { AlertTriangle, ArrowLeft, Clock, Printer, RefreshCw } from "@buleje/design-system/icons";
import { AccionesDeLaVista } from "@/components/admin/shared/libro-acciones-vista";
import { Btn, PanelSkeleton, VistaHeader, useKpisPlegables } from "./ctp-shared";
import { Etapa, ProduccionDelLote, SalidaDelLote, TablaDeTrozas } from "./historia/EtapasDelLote";
import DescargarLotes from "./historia/DescargarLotes";
import { Paso, PasoTarjeta, frasesDeTiempo, pieRendimiento } from "./historia/pasos-del-lote";
import { BTN_ICONO_RIEL } from "./ctp-riel-piezas";
import { useHistoriaLote } from "@/hooks/use-historia-lote";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { esLoteDeInventario } from "@/lib/forestal/lotes-aserrio";
import { imprimirHistoriaLote } from "@/lib/forestal/historia-lote-print";
import { formatDate, formatNumber } from "@/lib/format";
import AvisoRegistroAusente from "@/components/admin/shared/AvisoRegistroAusente";

const n4 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(4));
const nf = (v: number) => formatNumber(v);
const unidad = (u: string | null | undefined) => (!u || u === "m3" ? "m³" : u);
const fecha = (iso: string | null) =>
  iso ? formatDate(iso, { soloFecha: true }) : "—";

export default function CtpHistoriaLoteView({
  loteInicial,
  onLote,
  onVolver,
}: {
  loteInicial?: string | null;
  /** Avisa el lote elegido: la pestaña de Lotes lo recuerda al volver. */
  onLote?: (loteId: string) => void;
  /** Dentro de Lotes de aserrío: el estado vacío lleva a armar el primero. */
  onVolver?: () => void;
}) {
  const { lotes, cargando: cargandoLotes } = useLotesAserrio();
  const [loteId, setLoteIdLocal] = useState<string | null>(loteInicial ?? null);
  const setLoteId = (id: string | null) => {
    setLoteIdLocal(id);
    if (id) onLote?.(id);
  };

  /* Se abre en el primer lote CON algo adentro. Abrir en uno vacío muestra
     cuatro etapas en blanco y parece que la pantalla no anda. */
  useEffect(() => {
    if (loteId || lotes.length === 0) return;
    const conMadera = lotes.find((l) => (l.trozas?.length ?? 0) > 0 || (l.volumenM3 ?? 0) > 0);
    setLoteIdLocal((conMadera ?? lotes[0]).id);
  }, [lotes, loteId]);

  const { historia: h, cargando, error, recargar } = useHistoriaLote(loteId);
  const lote = useMemo(() => lotes.find((l) => l.id === loteId) ?? null, [lotes, loteId]);
  const deInventario = Boolean(lote && esLoteDeInventario(lote));

  /* El recorrido en cuatro cifras, plegable (Brandon 05-10): el botón va en la
     fila de acciones y el titular viaja adentro mientras está cerrado. */
  const kpis = useKpisPlegables({
    claveMemoria: "ctp-historia-lote",
    sinDatosAun: false,
    resumen: h ? `${nf(h.armado.piezas)} pz · ${n4(h.consumo.m3Total)} m³ a la sierra · ${n4(h.salida.total)} m³ despachado` : undefined,
    tarjetas: h
      ? [
          <PasoTarjeta key="1"><Paso n={1} termino="Se apartó" valor={`${nf(h.armado.piezas)} pz`} pie={`${n4(h.armado.m3)} m³ en la pila`} /></PasoTarjeta>,
          <PasoTarjeta key="2"><Paso n={2} termino="Entró a la sierra" valor={`${n4(h.consumo.m3Total)} m³`} pie={`${nf(h.consumo.piezasConsumidas)} piezas consumidas`} /></PasoTarjeta>,
          <PasoTarjeta key="3">
            <Paso
              n={3}
              termino="Salió aserrado"
              valor={h.produccion.total ? `${n4(h.produccion.total.cantidad)} ${unidad(h.produccion.total.unit)}` : "—"}
              pie={pieRendimiento(h)}
            />
          </PasoTarjeta>,
          <PasoTarjeta key="4"><Paso n={4} termino="Se despachó" valor={`${n4(h.salida.total)} m³`} pie={`${n4(h.salida.enStock)} m³ todavía en planta`} /></PasoTarjeta>,
        ]
      : [],
  });

  /* El lote pedido (⌘K, un enlace) ya no existe: la lista llegó y no lo trae. */
  const ausente = Boolean(loteId && !cargandoLotes && lotes.length > 0 && !lote);

  return (
    <div className="space-y-3">
      {ausente && <AvisoRegistroAusente que="Ese lote" />}
      {/* Dentro del libro el lote, Imprimir, Descargar y Recargar van al riel
          (compactación 17-10). La especie viaja en cada opción del selector:
          la cifra suelta al lado repetía el código. */}
      <VistaHeader
        titulo="Historia del lote"
        hint="Todo lo que pasó con una pila de madera: qué trozas se apartaron, qué corrida se las comió, qué salió de ellas y con qué guía se fueron."
      />
      {kpis.boton}
      <AccionesDeLaVista>
        <select
          value={loteId ?? ""}
          onChange={(e) => setLoteId(e.target.value || null)}
          aria-label="Elige el lote"
          title="El lote cuya historia ves"
          className="h-12 min-w-0 max-w-[16rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] max-sm:max-w-full max-sm:flex-1"
        >
          {cargandoLotes && <option value="">Cargando lotes…</option>}
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} · {l.speciesCommon ?? "sin especie"} · {l.status}
              {(l.trozas?.length ?? 0) > 0 ? ` · ${l.trozas!.length} pz` : ""}
            </option>
          ))}
        </select>
        {/* Dos puertas distintas a propósito: «Imprimir» abre la hoja para
            mirarla y mandarla a papel; «Descargar» baja el archivo —uno o
            varios lotes— sin pasar por el diálogo del sistema. */}
        <button
          type="button"
          onClick={() => h && imprimirHistoriaLote(h)}
          disabled={!h}
          aria-label="Imprimir la historia del lote"
          title="Imprimir la historia del lote"
          className={BTN_ICONO_RIEL}
        >
          <Printer className="h-4 w-4" aria-hidden />
        </button>
        <DescargarLotes
          lotes={lotes.map((l) => ({ id: l.id, code: l.code, status: l.status, piezas: l.trozas?.length ?? 0 }))}
          loteActual={loteId}
        />
        <button
          type="button"
          onClick={() => void recargar()}
          disabled={cargando}
          aria-label="Recargar la historia"
          title="Recargar la historia"
          className={BTN_ICONO_RIEL}
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </AccionesDeLaVista>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2.5 text-sm font-medium text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No pude armar la historia: {error}
        </p>
      )}

      {cargando && !h && <PanelSkeleton kpis={4} />}
      {!cargando && !h && !error && lotes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          <p>Todavía no hay lotes de aserrío. Arma uno y su historia empieza acá.</p>
          {onVolver && (
            <Btn variant="secondary" onClick={onVolver} className="mt-3">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Ir a los lotes
            </Btn>
          )}
        </div>
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

          {kpis.panel}

          {/* Cuánto tardó entre etapa y etapa. No sale de ninguna tabla del
              libro y es con lo que se decide: una pila que espera se degrada, y
              un lote aserrado que no sale es plata quieta. */}
          {frasesDeTiempo(h.tiempos).length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-4 py-2 text-sm text-[var(--text-secondary)]">
              <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              {/* El separador se ARMA entre frases, no se prefija a cada una:
                  con la espera en `null` —una corrida fechada antes que el
                  armado— la línea empezaba con un «·» colgado. */}
              {frasesDeTiempo(h.tiempos).map((f, i) => (
                <span key={f.clave}>
                  {i > 0 && <span className="mr-2 text-[var(--text-tertiary)]">·</span>}
                  {f.antes}
                  <b className="font-mono text-[var(--text-primary)]">{f.dias}</b> {f.dias === 1 ? "día" : "días"}
                  {f.despues}
                </span>
              ))}
            </p>
          )}

          <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
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
