"use client";

/**
 * Lotes de aserrío — la pestaña donde se arma lo que va a la sierra (ADR-334).
 *
 * El «Lote» es la columna con la que el LO-CTP enlaza Consumos, Producción y
 * Salidas. Vive acá y no adentro de Consumos porque es un trabajo propio del
 * patio —se arma en la pila, con la madera delante— y porque lo que se guarda
 * acá lo reusan las otras pestañas: Producción lo elige para declarar su
 * corrida, Trozas dice en qué lote está cada pieza y Consumos avisa cuánto
 * espera la sierra.
 *
 * Las cifras salen de `lib/forestal/lotes-aserrio.ts` (puro y testeado): la
 * pantalla no calcula, muestra.
 */

import { useMemo, useState } from "react";
import { Boxes, Gauge, Layers, Loader2, PackageOpen, Plus, RefreshCw, Search, TreePine, X } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { libresDelPatio } from "@/lib/forestal/patio-resumen";
import {
  ESTADO_LOTE,
  alertasDeLote,
  filtrarLotes,
  juzgarRendimientoLote,
  pieTablarDe,
  resumenLotes,
  type EstadoLoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import CtpLoteCard from "./CtpLoteCard";
import CtpLoteArmarModal, { type MaterialDeInventario } from "./CtpLoteArmarModal";
import CtpLoteDetalleModal from "./CtpLoteDetalleModal";
import CtpRegistrarProduccionModal, { type ProduccionRegistrada } from "./CtpRegistrarProduccionModal";
import { Btn, CtpKpisPlegables, PanelSkeleton, VistaHeader } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const CAMPO =
  "h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ANILLO_ACTIVO = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

/** El lote elegido para producir viaja al formulario de la pestaña Producción. */
export interface LoteAProducir {
  id: string;
  code: string;
}

export default function CtpLotesView({
  onProducir,
  onCargar,
}: {
  onProducir: (lote: LoteAProducir) => void;
  /** «Cargar»: lleva a Consumos con este lote elegido, que es donde se eligen
   *  las piezas ya filtradas por su especie (ADR-342). */
  onCargar: (lote: LoteAProducir) => void;
}) {
  const {
    lotes, trozas, cargando, error, recargar, crearConTrozas, crearInventario, quitarTroza,
    editarLote, deshacer, deshacerForzado,
  } = useLotesAserrio();
  const { indice: fotos } = useEspeciesFotos();

  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState("");
  const [estado, setEstado] = useState<EstadoLoteAserrio | "">("");
  const [armar, setArmar] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: "ok" | "aviso"; texto: string } | null>(null);

  /**
   * El material del modo INVENTARIO, entre el paso 1 (especie + volumen
   * consumido) y el paso 2 (los paquetes que produjo). El lote y la corrida
   * nacen juntos recién al confirmar el paso 2 — nada se crea a medias.
   */
  const [materialInventario, setMaterialInventario] = useState<MaterialDeInventario | null>(null);
  const [guardandoInventario, setGuardandoInventario] = useState(false);
  const [errorInventario, setErrorInventario] = useState<string | null>(null);

  async function confirmarInventario(datos: ProduccionRegistrada) {
    if (!materialInventario) return;
    setGuardandoInventario(true);
    setErrorInventario(null);
    try {
      const r = await crearInventario({
        speciesCommon: materialInventario.speciesCommon,
        speciesScientific: materialInventario.speciesScientific,
        volumenConsumidoM3: materialInventario.volumenConsumidoM3,
        fecha: materialInventario.fecha,
        finProceso: materialInventario.finProceso,
        code: materialInventario.code,
        notes: materialInventario.notes,
        paquetes: datos.paquetes.map((p) => ({
          codigo: p.codigo,
          productType: p.productType,
          presentacion: p.presentacion,
          cantidad: p.cantidad,
          volumenM3: p.volumenM3,
          espesorCm: p.espesorCm,
          anchoCm: p.anchoCm,
          largoM: p.largoM,
          observations: p.observations || null,
        })),
      });
      setAviso({
        tono: "ok",
        texto:
          `Lote ${r.lote.code} declarado como inventario: ${fmtM3(datos.volumen)} m³ producidos ` +
          `en la corrida N° ${r.corrida.lineNo}. Ya se puede despachar y, si queda margen del 56 %, ` +
          `declararle más producción desde la tabla de Producción.`,
      });
      setMaterialInventario(null);
    } catch (e) {
      setErrorInventario(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoInventario(false);
    }
  }

  /** Una sola marca de tiempo por render: los días de espera no pueden variar entre tarjetas. */
  const ahora = useMemo(() => new Date(), [lotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => resumenLotes(lotes), [lotes]);
  const veredicto = juzgarRendimientoLote(resumen.rendimientoPct);
  const opcionesEspecie = useMemo(
    () => [...new Set(lotes.map((l) => l.speciesCommon).filter(Boolean))].sort(),
    [lotes],
  );
  const visibles = useMemo(() => filtrarLotes(lotes, { texto, especie, estado }), [lotes, texto, especie, estado]);
  /** Lo que queda en el patio sin apartar: es la materia prima de un lote nuevo.
   *  Mismo predicado que la pestaña Consumos (`estaLibreEnPatio`): contaba
   *  también las piezas de guías sin recepcionar y prometía madera que el
   *  picker después no ofrecía. */
  const libresEnPatio = useMemo(() => libresDelPatio(trozas).length, [trozas]);
  /** Los lotes que piden atención: se anuncian arriba, no hay que abrirlos para enterarse. */
  const conAlerta = useMemo(
    () => lotes.filter((l) => alertasDeLote(l, ahora).some((a) => a.tono === "warning")).length,
    [lotes, ahora],
  );
  const detalle = detalleId ? (lotes.find((l) => l.id === detalleId) ?? null) : null;
  const filtrando = Boolean(texto || especie || estado);

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Lotes de aserrío"
        meta={`${resumen.abiertos} con madera${resumen.vacios > 0 ? ` · ${resumen.vacios} vacío${resumen.vacios === 1 ? "" : "s"}` : ""} · ${libresEnPatio} pieza${libresEnPatio === 1 ? "" : "s"} libre${libresEnPatio === 1 ? "" : "s"} en el patio`}
        hint="Las trozas de una misma especie que van juntas al carro. El lote se arma acá, se consume en Producción y con él salen los despachos."
      >
        <Btn variant="secondary" onClick={() => void recargar()} disabled={cargando}>
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Recargar
        </Btn>
        <Btn variant="primary" onClick={() => setArmar(true)}>
          <Plus className="h-4 w-4" /> Armar lote
        </Btn>
      </VistaHeader>

      {/* Todos detrás del botón «Indicadores» (Brandon, 2026-09-03); el titular
          va en la línea de resumen, que es lo que se mira de reojo. */}
      <CtpKpisPlegables
        claveMemoria="lotes"
        resumen={
          `${resumen.abiertos} abierto${resumen.abiertos === 1 ? "" : "s"} · ${fmtM3(resumen.volumenApartado)} m³ apartados · ${libresEnPatio} libre${libresEnPatio === 1 ? "" : "s"} en patio` +
          (resumen.margenTotalM3 > 0 ? ` · ${fmtM3(resumen.margenTotalM3)} m³ por declarar` : "")
        }
        tarjetas={[
        <StatCard
          key="abiertos"
          density="compact"
          label="Lotes abiertos"
          value={String(resumen.abiertos)}
          subValue={
            estado === "abierto"
              ? "Filtrando por estos"
              : /* Los vacíos se DICEN aparte (ADR-357): un lote sin piezas es un
                   rótulo esperando madera, no una pila en el patio. */
                `${resumen.piezasApartadas} piezas esperando la sierra${
                  resumen.vacios > 0 ? ` · ${resumen.vacios} rótulo(s) sin cargar` : ""
                }`
          }
          icon={Boxes}
          emphasis="neutral"
          onClick={() => setEstado((e) => (e === "abierto" ? "" : "abierto"))}
          className={estado === "abierto" ? ANILLO_ACTIVO : undefined}
        />,
        <StatCard
          key="volumen"
          density="compact"
          label="Volumen apartado"
          value={`${fmtM3(resumen.volumenApartado)} m³`}
          subValue={`${resumen.pieTablarApartado.toLocaleString("es-PE")} pt · listos para el carro`}
          icon={TreePine}
          emphasis="success"
        />,
        <StatCard
          key="libres"
          density="compact"
          label="Libres en el patio"
          value={String(libresEnPatio)}
          subValue="Piezas sin apartar — armá un lote"
          icon={PackageOpen}
          emphasis={libresEnPatio > 0 ? "neutral" : "warning"}
          onClick={() => setArmar(true)}
        />,
        <StatCard
          key="rendimiento"
          density="compact"
          label="Rendimiento aserrado"
          value={resumen.rendimientoPct != null ? `${resumen.rendimientoPct}%` : "—"}
          subValue={
            resumen.rendimientoPct != null
              ? `${resumen.consumidos} lote(s) aserrados · ${veredicto.texto}`
              : resumen.sinRendimiento > 0
                ? `${resumen.sinRendimiento} corrida(s) en otra unidad`
                : "Sin lotes aserrados todavía"
          }
          icon={Gauge}
          emphasis={veredicto.tono === "ok" ? "success" : veredicto.tono === "neutro" ? "neutral" : "warning"}
        />,
        <StatCard
          key="sobrante"
          density="compact"
          label="Volumen sobrante"
          value={`${fmtM3(resumen.margenTotalM3)} m³`}
          subValue={`${pieTablarDe(resumen.margenTotalM3).toLocaleString("es-PE")} pt · declarable desde Producción`}
          icon={Boxes}
          emphasis={resumen.margenTotalM3 > 0 ? "success" : "neutral"}
        />,
        /**
         * Lo que esta planta YA aserró, que no estaba en ninguna cifra de la
         * pestaña: `volumenAserrado` y `consumidos` los devolvía `resumenLotes`
         * desde siempre y sólo se usaban para el rendimiento. Es el otro lado
         * del «volumen apartado» — cuánto pasó por el carro y cuánto espera.
         */
        <StatCard
          key="aserrado"
          density="compact"
          label="Ya aserrado"
          value={`${fmtM3(resumen.volumenAserrado)} m³`}
          subValue={
            resumen.consumidos === 0
              ? "Ningún lote entró a la sierra todavía"
              : `${resumen.consumidos} lote${resumen.consumidos === 1 ? "" : "s"} consumido${resumen.consumidos === 1 ? "" : "s"}`
          }
          icon={Layers}
          emphasis="neutral"
        />,
        /* Un lote es de UNA especie (ADR-337): cuántas hay dice de cuántas
           maderas distintas se está trabajando a la vez. */
        <StatCard
          key="especies"
          density="compact"
          label="Especies en lotes"
          value={String(resumen.especies)}
          subValue={resumen.especies === 1 ? "Una sola especie en el patio" : "Distintas entre los lotes"}
          icon={TreePine}
          emphasis="neutral"
        />,
        ]}
      />

      {error && (
        <p className="rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
          No se pudieron leer los lotes: {error}
        </p>
      )}

      {aviso && (
        <p
          className={`flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-bold ${
            aviso.tono === "ok"
              ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
              : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <span className="flex-1">{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar el aviso" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* `w-full` en chico y `flex-1` desde sm: `min-w-*` no emite CSS en este
            proyecto (medido), así que un mínimo declarado ahí no protege nada. */}
        <label className="relative w-full sm:w-auto sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código de lote, especie, nota o código de pieza…"
            aria-label="Buscar un lote"
            className={`${CAMPO} w-full pl-9 pr-3`}
          />
        </label>
        <select value={especie} onChange={(e) => setEspecie(e.target.value)} aria-label="Filtrar por especie" className={`${CAMPO} px-3`}>
          <option value="">Todas las especies</option>
          {opcionesEspecie.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoLoteAserrio | "")}
          aria-label="Filtrar por estado del lote"
          className={`${CAMPO} px-3`}
        >
          <option value="">Todos los estados</option>
          <option value="abierto">{ESTADO_LOTE.abierto.label}</option>
          <option value="consumido">{ESTADO_LOTE.consumido.label}</option>
          <option value="cerrado">{ESTADO_LOTE.cerrado.label}</option>
        </select>
        {filtrando && (
          <button
            type="button"
            onClick={() => { setTexto(""); setEspecie(""); setEstado(""); }}
            className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]"
          >
            Limpiar
          </button>
        )}
      </div>

      {conAlerta > 0 && !filtrando && (
        <p className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-bold text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          {conAlerta} lote{conAlerta === 1 ? "" : "s"} para mirar: madera apartada hace días, piezas consumidas por fuera
          o corridas anuladas. El detalle está en cada tarjeta.
        </p>
      )}

      {cargando && lotes.length === 0 ? (
        /* Tarjetas, no filas: el esqueleto tiene que prometer lo que va a venir. */
        <PanelSkeleton kpis={3} />
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center">
          <Boxes className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)] opacity-40" aria-hidden />
          <p className="text-base font-bold text-[var(--text-primary)]">
            {lotes.length === 0 ? "Todavía no hay lotes de aserrío" : "Ningún lote coincide con el filtro"}
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-[var(--text-secondary)]">
            {lotes.length === 0
              ? "Un lote son las trozas de una misma especie que entran juntas a la sierra. Armalo con las piezas del patio y después Producción lo consume de un click."
              : "Probá con otro estado o limpiá la búsqueda."}
          </p>
          {lotes.length === 0 && (
            <span className="mt-4 inline-flex">
              <Btn variant="primary" onClick={() => setArmar(true)}>
                <Plus className="h-4 w-4" /> Armar el primero
              </Btn>
            </span>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((l) => (
            <li key={l.id}>
              <CtpLoteCard
                lote={l}
                fotos={fotos}
                ahora={ahora}
                onVer={() => setDetalleId(l.id)}
                onAgregar={() => onCargar({ id: l.id, code: l.code })}
                onProducir={() => onProducir({ id: l.id, code: l.code })}
                onDeshacer={() => setDetalleId(l.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {cargando && lotes.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Actualizando…
        </p>
      )}

      {armar && (
        <CtpLoteArmarModal
          trozas={trozas}
          crear={async (input) => {
            const r = await crearConTrozas({ ...input, trozaIds: [] });
            return { code: r.code };
          }}
          onIniciarInventario={(material) => { setMaterialInventario(material); setArmar(false); }}
          onListo={(texto, tono) => setAviso({ texto, tono })}
          onClose={() => setArmar(false)}
        />
      )}

      {/* Paso 2 del modo inventario: los paquetes que produjo esta madera,
          con el MISMO formulario que declara producción desde un lote real —
          el tope del 56 % y el rendimiento se ven igual, no hay una segunda
          versión de esta pantalla. */}
      {materialInventario && (
        <CtpRegistrarProduccionModal
          lote={null}
          titulo={`Inventario declarado — ${materialInventario.speciesCommon}`}
          descripcion={`${materialInventario.speciesCommon} · ${fmtM3(materialInventario.volumenConsumidoM3)} m³ consumidos (declarado, sin trozas reales)`}
          material={{
            especie: materialInventario.speciesCommon,
            especieCientifica: materialInventario.speciesScientific ?? null,
            piezas: 0,
            volumenM3: materialInventario.volumenConsumidoM3,
            permisos: [],
            origenes: [],
          }}
          fecha={materialInventario.fecha}
          productoInicial={materialInventario.productType}
          guardando={guardandoInventario}
          error={errorInventario}
          ctaLabel="Declarar el inventario"
          onConfirmar={(datos) => void confirmarInventario(datos)}
          onClose={() => { setMaterialInventario(null); setErrorInventario(null); }}
        />
      )}

      {detalle && (
        <CtpLoteDetalleModal
          lote={detalle}
          ahora={ahora}
          onQuitar={(trozaId) => quitarTroza(detalle.id, trozaId)}
          onEditar={(cambios) => editarLote(detalle.id, cambios)}
          onDeshacer={async () => {
            await deshacer(detalle.id);
            setAviso({ tono: "ok", texto: `Lote ${detalle.code} deshecho: sus piezas volvieron al patio.` });
            setDetalleId(null);
          }}
          onDeshacerForzado={async (motivo, forzar) => {
            const r = await deshacerForzado(detalle.id, motivo, forzar);
            setAviso({
              tono: "ok",
              texto: `Lote ${r.code} eliminado${r.corridaAnulada ? " y su corrida anulada" : ""}: sus piezas volvieron al patio.`,
            });
            setDetalleId(null);
          }}
          onProducir={() => {
            setDetalleId(null);
            onProducir({ id: detalle.id, code: detalle.code });
          }}
          onRecargar={recargar}
          onClose={() => setDetalleId(null)}
        />
      )}
    </div>
  );
}
