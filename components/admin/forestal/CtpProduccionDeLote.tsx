"use client";

/**
 * Producir desde el lote, en la pestaña Producción (ADR-349).
 *
 * El camino del SNIFFS: se elige el **lote**, se ven sus trozas, se tildan las
 * que entran a la sierra y se registra la producción en paquetes. Hasta ahora
 * eso vivía partido —consumir en Consumos, declarar en Producción— y el operador
 * que viene de la sierra con el parte del turno tenía que recorrer dos pestañas
 * para anotar una sola jornada.
 *
 * Los dos actos siguen siendo dos en el libro (Sección 2 y Sección 3, cada una
 * con su fecha): lo que se junta es la PANTALLA, no el registro. Si la
 * declaración falla, la corrida queda abierta —consumió y no declaró— que es un
 * estado que el libro ya sabe mostrar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { origenesDeTrozas } from "@/lib/forestal/produccion-paquetes";
import { cuposDeGuia, motivoDeCupo } from "@/lib/forestal/consumo-trozas";
import CtpCuadrarGuiaModal from "./CtpCuadrarGuiaModal";
import CtpBarraSeleccion from "./ctp-barra-seleccion";
import { pieTablarDe, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import CtpRegistrarProduccionModal, {
  type MaterialAConsumir,
  type ProduccionRegistrada,
} from "./CtpRegistrarProduccionModal";
import CtpTrozasDelLote from "./CtpTrozasDelLote";
import { Btn, I } from "./ctp-shared";
import type { EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";

export default function CtpProduccionDeLote({
  lote,
  lotes,
  onLote,
  estado,
  onListo,
  onError,
  onCerrar,
}: {
  lote: LoteAserrio;
  /** Los lotes abiertos: alimentan el selector de la barra (formato SNIFFS). */
  lotes?: LoteAserrio[];
  /** Cambiar de lote sin salir del panel. */
  onLote?: (id: string) => void;
  estado: EstadoLotesAserrio;
  /** Salir del lote sin producir: el panel se abre desde el CTA y tiene que
   *  tener puerta de salida además de volver a elegirlo en el menú. */
  onCerrar?: () => void;
  /** Avisa a la vista: recargar la tabla del libro y contar lo que pasó. */
  onListo: (mensaje: string, detalle: string) => void;
  /**
   * Un error que hay que mostrar ARRIBA. Al consumir, el lote deja de estar
   * abierto y este bloque se desmonta: un aviso adentro se iría con él y el
   * operador vería la corrida abierta sin saber por qué.
   */
  onError: (mensaje: string) => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /** (2) Fecha de consumo del formato: se elige ANTES de registrar y viaja al
   *  modal como el día de la corrida. */
  const [fechaConsumo, setFechaConsumo] = useState(() => new Date().toISOString().slice(0, 10));
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Las trozas DE ESTE LOTE, y nada más (Brandon, 2026-08).
   *
   * Antes la tabla traía `trozasDelLote()`, que suma a las apartadas TODO el
   * patio libre de la misma especie: sirve para armar el lote, no para
   * producirlo. Con 26 piezas de Tornillo en el patio, un lote de 6 abría una
   * tabla de 26 y había que reconocer cuáles eran las suyas.
   *
   * Acá se produce lo que el lote tiene: de sus 6, se tildan las 3 que entran
   * hoy y las otras 3 quedan en el lote para la corrida siguiente. Sumarle
   * madera es el trabajo de la pestaña Lotes, que es donde se arma.
   */
  const yaEnElLote = useMemo(
    () => estado.trozas.filter((t) => t.loteAserrioId === lote.id && !t.consumidaEnId),
    [estado.trozas, lote.id],
  );

  /* Las apartadas llegan TILDADAS: es lo que el operador armó en el patio y lo
     que espera producir. Se preseleccionan una sola vez por lote —si se
     re-aplicara en cada render, destildar una sería imposible: volvería sola. */
  const preseleccionado = useRef<string | null>(null);
  useEffect(() => {
    if (preseleccionado.current === lote.id) return;
    preseleccionado.current = lote.id;
    setSeleccion(new Set(yaEnElLote.map((t) => t.id)));
  }, [lote.id, yaEnElLote]);

  /**
   * Elegir el lote TRAE la vista acá.
   *
   * El panel se dibuja debajo de los KPIs, la barra, los chips y la tarjeta del
   * lote: medido en un portátil, a 1164 px por debajo del borde de la pantalla.
   * Se apretaba el botón, se elegía el lote y no pasaba nada visible — la tabla
   * estaba, pero había que buscarla scrolleando a ciegas.
   *
   * `block: "start"` con el scroll suave del sistema, y salto seco si el
   * usuario pidió menos movimiento.
   */
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    /* En el frame siguiente: al montar, el panel todavía no tiene su alto y el
       navegador scrollea a una posición que después se corre. */
    const id = requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" }),
    );
    return () => cancelAnimationFrame(id);
  }, [lote.id]);

  /**
   * Lo que entra a la sierra es **lo tildado**, y nada más.
   *
   * Antes era `yaEnElLote + elegidas`: el lote entero iba sí o sí y no se podía
   * producir una parte. Ahora las apartadas se destildan y se quedan en el lote
   * para la corrida siguiente.
   */
  const alConsumo = useMemo(
    () => yaEnElLote.filter((t) => seleccion.has(t.id)),
    [yaEnElLote, seleccion],
  );
  const elegidas = alConsumo;

  /**
   * El tope de I2, ANTES de mandar (ADR-359).
   *
   * El acta de Consumos ya avisaba; acá se iba directo al servidor y el operador
   * recibía el error crudo del guard —«sólo tiene 4.161 sin consumir»— sin poder
   * hacer nada desde esta pantalla. El chequeo es el MISMO (`cuposDeGuia`), o
   * las dos pantallas dirían cosas distintas de la misma madera.
   */
  const cupos = useMemo(() => cuposDeGuia(alConsumo), [alConsumo]);
  const excesos = useMemo(() => cupos.filter((c) => c.exceso > 0), [cupos]);
  const [cuadre, setCuadre] = useState<{ woodEntryId: string; gtfNumber: string | null } | null>(null);

  const material: MaterialAConsumir = useMemo(
    () => ({
      especie: lote.speciesCommon,
      especieCientifica: lote.speciesScientific ?? alConsumo[0]?.especieCientifica ?? null,
      piezas: alConsumo.length,
      volumenM3: Math.round(alConsumo.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
      permisos: [...new Set(alConsumo.map((t) => (t.permiso ?? "").trim()).filter(Boolean))],
      /* Cuánto puso cada título habilitante: con eso el modal reparte lo
         producido entre los permisos que lo ampararon (ADR-358). */
      origenes: origenesDeTrozas(alConsumo),
    }),
    [alConsumo, lote.speciesCommon, lote.speciesScientific],
  );

  /**
   * Consumir y declarar, en ese orden.
   *
   * El consumo abre la corrida con su materia prima; la declaración le pone lo
   * que salió. Si la segunda falla, la primera **no se deshace**: la madera
   * entró a la sierra de verdad y borrar el consumo sería negar un hecho.
   */
  async function registrar(datos: ProduccionRegistrada) {
    setGuardando(true);
    setError(null);
    try {
      const consumo = await estado.consumirEnPatio({
        loteId: lote.id,
        trozaIds: elegidas.map((t) => t.id),
        fecha: datos.fecha,
        observaciones: datos.observaciones,
      });

      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          action: "declarar_produccion",
          id: consumo.corrida.id,
          quantity: datos.volumen,
          unit: "m3",
          lineaProduccion: datos.lineaProduccion,
          observations: datos.observaciones,
          pieces: datos.paquetes.reduce((a, p) => a + p.cantidad, 0),
          productType: datos.paquetes[0]?.productType ?? null,
          presentacion: datos.paquetes[0]?.presentacion ?? null,
          codigoProducto: datos.paquetes[0]?.codigo ?? null,
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
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          `${json?.message ?? json?.error ?? `El servidor respondió ${r.status}`} ` +
            `(la corrida N° ${consumo.corrida.lineNo} quedó abierta con su materia prima: declarale la producción desde la tabla).`,
        );
      }

      invalidarCtp("/forestal/");
      await estado.recargar();
      setSeleccion(new Set());
      setAbierto(false);
      onListo(
        `Producción del lote ${lote.code} registrada`,
        `Corrida N° ${consumo.corrida.lineNo}: consumió ${consumo.volumenM3.toFixed(4)} m³ y produjo ` +
          `${datos.volumen.toFixed(4)} m³ en ${datos.paquetes.length} paquete(s).`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onError(msg);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section ref={panelRef} className="scroll-mt-4 space-y-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-4">
      {/* La barra del formato: Lote · Fecha de consumo · Registrar Producción.
          Un selector y no un menú: el operador cambia de lote sin salir de la
          pantalla, y la lista de trozas de abajo lo sigue. */}
      <header className="flex flex-wrap items-end gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
        <label className="min-w-0 flex-1 sm:max-w-md">
          <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Lote
          </span>
          <select
            value={lote.id}
            onChange={(e) => onLote?.(e.target.value)}
            disabled={!onLote || (lotes ?? []).length === 0}
            className={`${I} font-medium disabled:cursor-not-allowed`}
          >
            {(lotes ?? [lote]).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.speciesScientific ? `${l.speciesScientific} ( ${l.speciesCommon.toUpperCase()} )` : l.speciesCommon}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full sm:w-56">
          <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Fecha de consumo
          </span>
          <input type="date" value={fechaConsumo} onChange={(e) => setFechaConsumo(e.target.value)} className={I} />
        </label>
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {material.piezas} pza · {material.volumenM3.toFixed(4)} m³
          </span>
          <Btn
            variant="primary"
            disabled={alConsumo.length === 0 || excesos.length > 0}
            title={alConsumo.length === 0 ? "Elegí las trozas que entran a la sierra" : undefined}
            onClick={() => { setError(null); setAbierto(true); }}
          >
            <Boxes className="h-4 w-4" />
            Registrar producción
          </Btn>
          {onCerrar && (
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar el panel del lote"
              title="Cerrar el panel del lote"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </header>

      {/* La lista del formato: las trozas de ESTE lote, para tildar cuáles van. */}
      <CtpTrozasDelLote
        trozas={yaEnElLote}
        seleccion={seleccion}
        onSeleccion={setSeleccion}
        fechaConsumo={fechaConsumo}
        cargando={estado.cargando}
        vacio="Este lote no tiene trozas apartadas. Agregale piezas del patio en «Lotes de aserrío»."
      />

      {/* Sin nada tildado, el botón apagado dice qué falta hacer. Con selección
          manda la barra del pie, que lleva la cuenta acumulada —piezas, m³, pie
          tablar— al lado de la acción: se decide por volumen mientras se tilda,
          y el total vivía a doscientas filas de scroll de donde está el ojo. */}
      {alConsumo.length === 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Btn variant="primary" disabled>
            <Boxes className="h-4 w-4" />
            Registrar producción
          </Btn>
        </div>
      )}

      {alConsumo.length > 0 && (
        <CtpBarraSeleccion
          cifras={[
            { label: "Trozas", valor: `${alConsumo.length}` },
            { label: "Volumen", valor: `${material.volumenM3.toFixed(4)} m³`, fuerte: true },
            { label: "Pie tablar", valor: `${pieTablarDe(material.volumenM3).toLocaleString("es-PE")} pt` },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
          accionLabel="Registrar producción"
          accionIcon={Boxes}
          accionDisabled={excesos.length > 0}
          /* El botón apagado sin decir por qué se lee como que la pantalla está
             rota: el motivo del tope va acá, y el detalle con su arreglo abajo. */
          aviso={excesos.length > 0 ? "Una guía se pasa de su tope — mirá el aviso de abajo" : null}
          onAccion={() => { setError(null); setAbierto(true); }}
        />
      )}

      {/* Lo que frena la producción, con su causa y el botón para arreglarlo
          (ADR-359). El total del lote puede estar bien y una de sus guías no. */}
      {excesos.map((c) => (
        <div
          key={c.woodEntryId}
          className="flex flex-wrap items-start gap-2 rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          <span className="flex-1">{motivoDeCupo(c)}</span>
          {c.descuadrado && (
            <Btn variant="secondary" onClick={() => setCuadre({ woodEntryId: c.woodEntryId, gtfNumber: c.gtfNumber })}>
              Cuadrar la guía
            </Btn>
          )}
        </div>
      ))}

      {cuadre && (
        <CtpCuadrarGuiaModal
          gtfNumber={cuadre.gtfNumber ?? "—"}
          subtitulo={`Desde la producción del lote ${lote.code}`}
          entryIds={[cuadre.woodEntryId]}
          onCuadrada={() => { void estado.recargar(); }}
          onClose={() => setCuadre(null)}
        />
      )}

      {!abierto && error && (
        <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {abierto && (
        <CtpRegistrarProduccionModal
          lote={lote}
          material={material}
          fecha={fechaConsumo}
          guardando={guardando}
          error={error}
          onConfirmar={(datos) => void registrar(datos)}
          onClose={() => setAbierto(false)}
        />
      )}
    </section>
  );
}
