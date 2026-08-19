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
import { Archive, Boxes, Layers, Loader2, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { corridasAMedioDeclarar, origenesDeTrozas } from "@/lib/forestal/produccion-paquetes";
import { cuposDeGuia, motivoDeCupo } from "@/lib/forestal/consumo-trozas";
import CtpCuadrarGuiaModal from "./CtpCuadrarGuiaModal";
import CtpProduccionPendiente from "./CtpProduccionPendiente";
import CtpBarraSeleccion from "./ctp-barra-seleccion";
import { pieTablarDe, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import CtpRegistrarProduccionModal, {
  type MaterialAConsumir,
  type ProduccionRegistrada,
} from "./CtpRegistrarProduccionModal";
import CtpTrozasDelLote from "./CtpTrozasDelLote";
import { Btn, I } from "./ctp-shared";
import type { EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";

/**
 * El turno a medio cargar, guardado por lote.
 *
 * El operador tilda veinte trozas, lo llaman, cierra el panel — y al volver
 * tenía que empezar de nuevo. La selección es trabajo, no un estado efímero.
 *
 * ⚠️ Se guarda **a mano** en cada cambio, NO con un `useEffect([seleccion])`:
 * la carga vive en un efecto (necesita las trozas ya traídas del servidor) y un
 * efecto que persista correría antes, escribiendo vacío encima de lo guardado.
 * Es exactamente el bug que borró los precios por especie del cubicador.
 */
const CLAVE_SELECCION = "buleje-ctp-produccion-seleccion";

function leerSeleccionGuardada(loteId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(`${CLAVE_SELECCION}:${loteId}`);
    const ids: unknown = crudo ? JSON.parse(crudo) : null;
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    /* Storage lleno, JSON corrupto o modo privado: se arranca con el lote entero,
       que es el default de siempre. Nunca vale romper la pantalla por una caché. */
    return [];
  }
}

function guardarSeleccion(loteId: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    if (ids.length === 0) window.localStorage.removeItem(`${CLAVE_SELECCION}:${loteId}`);
    else window.localStorage.setItem(`${CLAVE_SELECCION}:${loteId}`, JSON.stringify(ids));
  } catch {
    /* Sin persistencia se sigue trabajando igual: es una comodidad, no un dato. */
  }
}

export default function CtpProduccionDeLote({
  lote,
  preseleccion,
  lotes,
  onLote,
  estado,
  onListo,
  onAviso,
  onError,
  onCerrar,
  onCerrarLote,
}: {
  lote: LoteAserrio;
  /**
   * Piezas que ya vienen elegidas (llegan desde otra pantalla). Sin esto, el
   * panel tilda TODO el lote y el operador que eligió tres perdía su elección al
   * llegar acá.
   */
  preseleccion?: readonly string[];
  /** Los lotes abiertos: alimentan el selector de la barra (formato SNIFFS). */
  lotes?: LoteAserrio[];
  /** Cambiar de lote sin salir del panel. */
  onLote?: (id: string) => void;
  estado: EstadoLotesAserrio;
  /** Salir del lote sin producir: el panel se abre desde el CTA y tiene que
   *  tener puerta de salida además de volver a elegirlo en el menú. */
  onCerrar?: () => void;
  /**
   * Cerrar el LOTE (no el panel): lo que quedó no va a aserrarse y vuelve al
   * patio. Distinto de deshacerlo — el lote y sus corridas siguen en el libro.
   */
  onCerrarLote?: (motivo: string) => Promise<{ liberadas: number; volumenM3: number }>;
  /** Avisa a la vista: recargar la tabla del libro y contar lo que pasó. */
  onListo: (mensaje: string, detalle: string) => void;
  /**
   * Pasó algo que NO cierra el panel: se amplió una corrida del lote y todavía
   * quedan trozas por aserrar. Con `onListo` el panel se cerraría justo cuando el
   * operador viene a seguir (ADR-365).
   */
  onAviso?: (mensaje: string, detalle: string) => void;
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
  /** Confirmación de cierre del lote: motivo obligatorio, inline y no modal. */
  const [cerrandoLote, setCerrandoLote] = useState(false);
  const [motivoCierre, setMotivoCierre] = useState("");
  const [cerrando, setCerrando] = useState(false);

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

  /**
   * Las corridas de ESTE lote que ya declararon y todavía admiten más (ADR-365).
   *
   * Es el caso de Brandon: se aserraron tres de cuatro trozas, se declararon
   * 3 m³ de los 5 que permitía esa madera, y al otro día sale el resto. Volver a
   * elegir trozas consumiría madera que no entró — lo que falta se agrega a la
   * corrida que ya existe.
   */
  const pendientes = useMemo(
    () =>
      corridasAMedioDeclarar(
        (lote.corridas ?? [])
          .filter((c) => c.viva)
          .map((c) => ({
            id: c.id,
            lineNo: c.lineNo,
            entryDate: c.entryDate,
            productType: c.productType,
            speciesCommon: c.speciesCommon ?? lote.speciesCommon,
            volumeInputM3: c.volumeInputM3,
            quantity: c.quantity,
            unit: c.unit,
            status: c.status,
            materiaPrimaRef: lote.code,
          })),
      ),
    [lote.corridas, lote.code, lote.speciesCommon],
  );

  /* Las apartadas llegan TILDADAS: es lo que el operador armó en el patio y lo
     que espera producir. Se preseleccionan una sola vez por lote —si se
     re-aplicara en cada render, destildar una sería imposible: volvería sola. */
  const preseleccionado = useRef<string | null>(null);
  /** Ya se restauró la selección de este lote: recién ahí se puede persistir. */
  const restaurado = useRef(false);
  useEffect(() => {
    /* La clave incluye la preselección: entrar dos veces al MISMO lote con
       elecciones distintas tiene que re-aplicarlas, y sólo comparar el id las
       ignoraba la segunda vez. */
    const clave = `${lote.id}|${(preseleccion ?? []).join(",")}`;
    if (preseleccionado.current === clave) return;
    preseleccionado.current = clave;
    /* Tres orígenes, en este orden: lo que otra pantalla eligió (explícito y
       reciente), lo que quedó a medio tildar la vez pasada, y el lote entero.
       Los tres se acotan a las piezas que de verdad siguen libres: una guardada
       que ya entró a otra corrida no puede volver tildada. */
    const vivas = new Set(yaEnElLote.map((t) => t.id));
    const dePantalla = (preseleccion ?? []).filter((id) => vivas.has(id));
    const guardadas = dePantalla.length > 0 ? [] : leerSeleccionGuardada(lote.id).filter((id) => vivas.has(id));
    const inicial =
      dePantalla.length > 0 ? dePantalla : guardadas.length > 0 ? guardadas : yaEnElLote.map((t) => t.id);
    setSeleccion(new Set(inicial));
    restaurado.current = true;
  }, [lote.id, yaEnElLote, preseleccion]);

  /**
   * Todo cambio de selección se guarda acá, en el mismo gesto que lo produce.
   * `restaurado` evita escribir antes de la restauración —el orden que rompió el
   * cubicador— y `lote.id` va en la clave para no mezclar turnos.
   */
  const elegir = (s: Set<string>) => {
    setSeleccion(s);
    if (restaurado.current) guardarSeleccion(lote.id, [...s]);
  };

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
   * Lo que NO entra hoy y se queda en el lote (ADR-356).
   *
   * La capacidad existía desde siempre —un lote de 4 puede aserrarse 3 hoy y 1
   * mañana— pero la pantalla no lo decía en ningún lado: las cuatro venían
   * tildadas y nada sugería que se podían dejar. El operador que quería partir
   * el turno no tenía cómo enterarse de que ya podía.
   */
  const quedan = useMemo(
    () => yaEnElLote.filter((t) => !seleccion.has(t.id)),
    [yaEnElLote, seleccion],
  );
  const volumenQueda = useMemo(
    () => Math.round(quedan.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
    [quedan],
  );

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
   * El lote se cierra y su madera libre vuelve al patio. El aviso sube al padre
   * (toast): cerrar desmonta este panel, y un cartel adentro se iría con él.
   */
  async function cerrarElLote() {
    if (!onCerrarLote || motivoCierre.trim().length < 3) return;
    setCerrando(true);
    setError(null);
    try {
      await onCerrarLote(motivoCierre.trim());
      setCerrandoLote(false);
      setMotivoCierre("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onError(msg);
    } finally {
      setCerrando(false);
    }
  }

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
      /* El turno se cerró: lo guardado dejó de valer y lo que quede en el lote
         se ofrece entero en la corrida siguiente. */
      guardarSeleccion(lote.id, []);
      restaurado.current = false;
      preseleccionado.current = null;
      setSeleccion(new Set());
      setAbierto(false);
      onListo(
        `Producción del lote ${lote.code} registrada`,
        `Corrida N° ${consumo.corrida.lineNo}: consumió ${consumo.volumenM3.toFixed(4)} m³ y produjo ` +
          `${datos.volumen.toFixed(4)} m³ en ${datos.paquetes.length} paquete(s).` +
          /* Lo que sobró se NOMBRA: sin esto, el operador que aserró 3 de 4 no
             tenía forma de saber que la cuarta seguía esperándolo. */
          (quedan.length > 0
            ? ` Quedan ${quedan.length} troza${quedan.length === 1 ? "" : "s"} (${volumenQueda.toFixed(4)} m³) ` +
              `en el lote para la corrida siguiente.`
            : ` El lote quedó consumido.`),
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
    /* `scroll-mt-20`: la cabecera sticky del admin mide 61 px y con `-4` el
       título del lote quedaba tapado justo después del salto. */
    <section ref={panelRef} className="scroll-mt-20 space-y-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-4">
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
            Declarar producción
          </Btn>
          {/* Cerrar el LOTE (no el panel): lo que queda no va a entrar a la
              sierra y vuelve al patio. Sólo tiene sentido con madera libre. */}
          {onCerrarLote && yaEnElLote.length > 0 && (
            <Btn
              variant="secondary"
              disabled={cerrando}
              title="El resto no va a aserrarse: vuelve al patio y el lote deja de figurar como pendiente"
              onClick={() => setCerrandoLote(true)}
            >
              <Archive className="h-4 w-4" />
              Cerrar el lote
            </Btn>
          )}
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

      {/**
       * Cerrar el lote es irreversible en la práctica (hay que rearmarlo) y
       * mueve madera al patio: se confirma con el motivo a la vista, inline y no
       * en un modal sobre otro modal.
       */}
      {cerrandoLote && (
        <div className="space-y-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 p-3">
          <p className="text-sm text-[var(--text-primary)]">
            <b>Cerrar {lote.code}:</b> sus{" "}
            <b className="font-mono tabular-nums">{yaEnElLote.length}</b> troza
            {yaEnElLote.length === 1 ? "" : "s"} sin aserrar vuelven al patio y el lote deja de figurar como
            pendiente. Lo que ya se aserró queda en el libro.
          </p>
          <input
            autoFocus
            value={motivoCierre}
            onChange={(e) => setMotivoCierre(e.target.value)}
            placeholder="Motivo (se guarda en el historial): se vendió en rollo, cambió el pedido…"
            className={I}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Btn variant="secondary" disabled={cerrando} onClick={() => { setCerrandoLote(false); setMotivoCierre(""); }}>
              Cancelar
            </Btn>
            <Btn
              variant="danger"
              disabled={motivoCierre.trim().length < 3 || cerrando}
              onClick={() => void cerrarElLote()}
            >
              {cerrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              Cerrar el lote
            </Btn>
          </div>
        </div>
      )}

      {/**
       * El patio no entró entero en la lectura: puede faltar madera de este
       * lote en la lista de abajo. Se dice — una lista incompleta que se ve
       * completa es peor que un error, porque nadie la sospecha.
       */}
      {estado.patioTruncado && (
        <p className="rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          El patio tiene <b className="font-mono tabular-nums">{estado.patioTruncado.hay}</b> piezas y se
          leyeron <b className="font-mono tabular-nums">{estado.patioTruncado.leidas}</b>: puede faltar
          alguna de este lote en la lista. Buscá por código para encontrarla.
        </p>
      )}

      {/**
       * Lo que este lote ya aserró y todavía no terminó de declarar, ARRIBA de
       * la tabla de trozas: el operador que vuelve al día siguiente entra por el
       * lote, y lo primero que tiene que ver es que puede completar la corrida de
       * ayer sin tocar una sola troza (ADR-365).
       */}
      <CtpProduccionPendiente
        corridas={pendientes}
        trozas={estado.trozas}
        titulo={`Corridas del lote ${lote.code} a medio declarar`}
        piezasLibres={yaEnElLote.length}
        onListo={async (msg, detalle) => {
          /* Recargar ANTES de avisar: el margen que acaba de cambiar es lo que
             decide si este bloque sigue en pantalla. */
          await estado.recargar();
          (onAviso ?? onListo)(msg, detalle);
        }}
        onError={onError}
      />

      {/* La regla, dicha antes de la tabla y no descubierta por accidente: el
          lote NO tiene que entrar entero. */}
      {yaEnElLote.length > 1 && (
        <p className="px-1 text-sm text-[var(--text-tertiary)]">
          No hace falta que entre el lote entero:{" "}
          <b className="text-[var(--text-secondary)]">destildá las que no van hoy</b> y se quedan apartadas
          para la corrida siguiente.
        </p>
      )}

      {/* La lista del formato: las trozas de ESTE lote, para tildar cuáles van. */}
      <CtpTrozasDelLote
        trozas={yaEnElLote}
        seleccion={seleccion}
        onSeleccion={elegir}
        fechaConsumo={fechaConsumo}
        cargando={estado.cargando}
        vacio="Este lote no tiene trozas apartadas. Agregale piezas del patio en «Lotes de aserrío»."
      />

      {/* Y el contador vivo de lo que va a quedar: mientras se tilda, el
          operador ve las dos mitades — la que entra y la que espera. */}
      {quedan.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <Layers className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          Entran <b className="font-mono tabular-nums text-[var(--text-primary)]">{alConsumo.length}</b> a la
          sierra y <b className="font-mono tabular-nums text-[var(--text-primary)]">{quedan.length}</b> troza
          {quedan.length === 1 ? "" : "s"} ({volumenQueda.toFixed(4)} m³) se qued
          {quedan.length === 1 ? "a" : "an"} en{" "}
          <b className="font-mono text-[var(--text-primary)]">{lote.code}</b> para la corrida siguiente.
        </p>
      )}

      {/* Sin nada tildado, el botón apagado dice qué falta hacer. Con selección
          manda la barra del pie, que lleva la cuenta acumulada —piezas, m³, pie
          tablar— al lado de la acción: se decide por volumen mientras se tilda,
          y el total vivía a doscientas filas de scroll de donde está el ojo. */}
      {alConsumo.length === 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Btn variant="primary" disabled>
            <Boxes className="h-4 w-4" />
            Declarar producción
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
          onLimpiar={() => elegir(new Set())}
          accionLabel="Declarar producción"
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
          /* Las que se están por consumir: el modal las despliega bajo pedido
             para no tener que cerrarlo y volver a la tabla de atrás. */
          trozas={alConsumo}
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
