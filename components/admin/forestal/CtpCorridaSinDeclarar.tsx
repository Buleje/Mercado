"use client";

/**
 * La corrida que ya consumió y todavía no declaró, CON SUS TROZAS a la vista.
 *
 * «Corridas sin declarar» abría un formulario en blanco: pedía producto y
 * cantidad sin mostrar una sola pieza de la madera que había entrado. El
 * operador que vuelve de la sierra a cerrar la jornada tiene el atado adelante y
 * necesita ver contra qué está declarando — cuántas trozas, de qué guías y por
 * cuántos m³— antes de escribir lo que salió.
 *
 * Así que elegir una corrida abre ESTA tabla, arriba de la del libro, con las
 * mismas columnas del LO-CTP. Las piezas van en `soloLectura`: ya entraron a la
 * sierra y eso es un hecho registrado, no una casilla que se destilda. Lo que
 * todavía se puede elegir es lo que le QUEDA al lote, y para eso está el atajo
 * del pie, que lleva al panel donde se tildan las trozas de la corrida
 * siguiente (ADR-349).
 *
 * Y se declara **en paquetes**, con el mismo formulario del SNIFFS que usa la
 * producción desde el lote: código, presentación, piezas y medidas, con el
 * volumen calculado y el tope del 56 % vivo mientras se carga (ADR-358). Antes
 * esta puerta pedía una cantidad suelta — dos formas de declarar lo mismo, y la
 * de acá se saltaba el techo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { origenesDeTrozas } from "@/lib/forestal/produccion-paquetes";
import { pieTablarDe, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpRegistrarProduccionModal, {
  type MaterialAConsumir,
  type ProduccionRegistrada,
} from "./CtpRegistrarProduccionModal";
import CtpSumarALaCorrida from "./CtpSumarALaCorrida";
import CtpTrozasDelLote from "./CtpTrozasDelLote";
import { Btn, formatDate } from "./ctp-shared";
import type { CtpEntry } from "./ctp-section-shared";

/** Lo que le queda al lote de esta corrida sin aserrar. */
export interface RestoDelLote {
  loteId: string;
  code: string;
  /** Las piezas mismas, no sólo cuántas: acá se eligen una por una (ADR-364). */
  trozas: TrozaConsumible[];
  volumenM3: number;
}

export default function CtpCorridaSinDeclarar({
  corrida,
  trozas,
  lote,
  resto,
  cargando,
  onListo,
  onError,
  onAviso,
  onSumarPiezas,
  onProducirResto,
  onCerrar,
}: {
  corrida: CtpEntry;
  /** Las piezas que ESTA corrida se comió (`consumidaEnId === corrida.id`). */
  trozas: TrozaConsumible[];
  /** El lote del que salió, si todavía existe: sólo aporta sus fechas al modal. */
  lote?: LoteAserrio | null;
  resto?: RestoDelLote | null;
  cargando?: boolean;
  /** Declaró: recargar la tabla del libro y contar qué pasó. */
  onListo: (mensaje: string, detalle: string) => void;
  /**
   * El error sube. Al declarar, la corrida deja de estar pendiente y este panel
   * se desmonta: un aviso adentro se iría con él (misma lección que ADR-343).
   */
  onError: (mensaje: string) => void;
  /** Pasó algo digno de contar pero la corrida sigue abierta: el panel se queda. */
  onAviso?: (mensaje: string, detalle: string) => void;
  /** Sumar piezas del lote a ESTA corrida (ADR-364): el turno que entra en
   *  tandas es una sola corrida. Devuelve cuánto entró. */
  onSumarPiezas?: (input: { loteId: string; trozaIds: string[] }) => Promise<{
    piezas: number;
    volumenM3: number;
    volumenTotalM3: number;
  }>;
  onProducirResto?: (loteId: string) => void;
  onCerrar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sumando, setSumando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = Number(corrida.volumeInputM3 ?? 0);
  /**
   * Los m³ de las piezas marcadas vs. los que declaró la corrida.
   *
   * Casi siempre son el mismo número —la corrida se abre desde el lote— pero no
   * tienen por qué: una corrida importada o cargada a mano puede tener volumen
   * sin piezas. Mostrar los dos y no uno evita que la tabla parezca decir que
   * entraron 0 m³ cuando el libro dice 5.13.
   */
  const volumenPiezas = useMemo(
    () => Math.round(trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
    [trozas],
  );

  /**
   * El material de la declaración es **el que dice el libro**, no el que suman
   * las piezas.
   *
   * `volumeInputM3` es el denominador del rendimiento y del tope del 56 % que ya
   * quedó escrito al consumir: recalcularlo desde la tabla daría un segundo
   * número para el mismo hecho, y el que manda es el asentado. Las piezas sí
   * aportan lo que el asiento no tiene: cuántas son y qué títulos las amparan.
   */
  const material: MaterialAConsumir = useMemo(
    () => ({
      especie: corrida.speciesCommon ?? "Sin especie",
      especieCientifica: corrida.speciesScientific ?? trozas[0]?.especieCientifica ?? null,
      piezas: trozas.length,
      volumenM3: entrada,
      permisos: [...new Set(trozas.map((t) => (t.permiso ?? "").trim()).filter(Boolean))],
      origenes: origenesDeTrozas(trozas),
    }),
    [corrida.speciesCommon, corrida.speciesScientific, trozas, entrada],
  );

  /**
   * Declarar lo que salió. Acá NO se consume: eso ya pasó cuando se cargó la
   * sierra, y esta corrida existe justamente porque quedó a medias (ADR-340).
   */
  async function declarar(datos: ProduccionRegistrada) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          action: "declarar_produccion",
          id: corrida.id,
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
      if (!r.ok) throw new Error(json?.message ?? json?.error ?? `El servidor respondió ${r.status}`);

      invalidarCtp("/forestal/");
      setAbierto(false);
      const rend = entrada > 0 ? ` · rendimiento ${Math.round((datos.volumen / entrada) * 1000) / 10} %` : "";
      onListo(
        `Corrida N° ${corrida.lineNo} cerrada`,
        `Declaró ${datos.volumen.toFixed(4)} m³ en ${datos.paquetes.length} paquete(s)${rend}. ` +
          "Ya se puede despachar de esta corrida.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onError(msg);
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Sumar la tanda que entra ahora (ADR-364). El aviso va como toast del padre
   * y no acá: el panel se re-arma con la corrida ya engordada y un cartel
   * interno se perdería en ese re-render.
   */
  async function sumar(trozaIds: string[]) {
    if (!onSumarPiezas || !resto) return;
    setSumando(true);
    setError(null);
    try {
      const r = await onSumarPiezas({ loteId: resto.loteId, trozaIds });
      /* `onAviso` y no `onListo`: la corrida sigue abierta y el panel tiene que
         quedarse — cerrarlo acá obligaría a volver a buscarla en el menú para
         declarar lo que salga. */
      onAviso?.(
        `Corrida N° ${corrida.lineNo}: ${r.piezas} troza${r.piezas === 1 ? "" : "s"} más a la sierra`,
        `Entraron ${r.volumenM3.toFixed(4)} m³ más — la corrida va por ${r.volumenTotalM3.toFixed(4)} m³ ` +
          "y sigue abierta para declarar lo que salga.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onError(msg);
    } finally {
      setSumando(false);
    }
  }

  /* Elegir la corrida trae la vista acá: el panel se dibuja debajo de los KPIs y
     la barra, y sin esto se apretaba el botón y no pasaba nada visible. Mismo
     gesto que el panel del lote. */
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const id = requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" }),
    );
    return () => cancelAnimationFrame(id);
  }, [corrida.id]);

  return (
    /* `scroll-mt-20` y no `-4`: la cabecera del panel admin es sticky y mide
       61 px — con menos margen, `scrollIntoView` deja el título debajo de ella
       y el operador cree que se abrió otra cosa. */
    <section
      ref={panelRef}
      aria-label={`Corrida N° ${corrida.lineNo} sin declarar`}
      className="scroll-mt-20 space-y-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-4"
    >
      <header className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white"
        >
          <Boxes className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--text-primary)]">
            Corrida N° {corrida.lineNo}
            {corrida.materiaPrimaRef && (
              <span className="font-normal text-[var(--text-secondary)]"> · lote {corrida.materiaPrimaRef}</span>
            )}
          </p>
          <p className="font-mono text-sm tabular-nums text-[var(--text-tertiary)]">
            {formatDate(corrida.entryDate)} · {corrida.speciesCommon ?? "Sin especie"} · entraron{" "}
            <b className="text-[var(--text-secondary)]">{entrada.toFixed(4)} m³</b> ·{" "}
            {pieTablarDe(entrada).toLocaleString("es-PE")} pt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={() => { setError(null); setAbierto(true); }}>
            <Boxes className="h-4 w-4" />
            Declarar producción
          </Btn>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar la corrida"
            title="Cerrar la corrida"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {/* La misma lista del formato, en modo lectura: es la madera que hay que
          mirar mientras se declara lo que salió. */}
      <CtpTrozasDelLote
        trozas={trozas}
        soloLectura
        titulo="Trozas que entraron a esta corrida"
        fechaConsumo={corrida.entryDate}
        cargando={cargando}
        /* Sin causa inventada: la lista del patio viene acotada, así que «no
           hay piezas a la vista» NO prueba que la corrida se haya cargado sólo
           por volumen. Se dice lo que se sabe —lo que el libro tiene anotado— y
           el operador saca la conclusión con el dato, no con una suposición. */
        vacio={`Esta corrida no tiene piezas marcadas a la vista. En el libro figura con ${entrada.toFixed(4)} m³ de materia prima.`}
      />

      {/* Cuando las piezas no suman lo que la corrida declaró, se dice: el
          rendimiento se calcula sobre el volumen del libro, no sobre la tabla. */}
      {trozas.length > 0 && Math.abs(volumenPiezas - entrada) > 0.01 && (
        <p className="rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Las piezas suman <b className="font-mono tabular-nums">{volumenPiezas.toFixed(4)} m³</b> y la corrida
          declaró <b className="font-mono tabular-nums">{entrada.toFixed(4)} m³</b>. El rendimiento se calcula
          sobre lo declarado.
        </p>
      )}

      {/* Lo que SÍ se elige: la madera que le queda al lote, con las DOS salidas
          nombradas (ADR-364) — sumarla a esta corrida (la misma jornada) o abrir
          una nueva. Antes había un solo camino y era siempre el segundo. */}
      {resto && resto.trozas.length > 0 && (
        <CtpSumarALaCorrida
          lineNo={corrida.lineNo}
          loteCode={resto.code}
          trozas={resto.trozas}
          fechaConsumo={corrida.entryDate}
          guardando={sumando}
          onSumar={(ids) => void sumar(ids)}
          onCorridaNueva={() => onProducirResto?.(resto.loteId)}
        />
      )}

      {/* Con el modal cerrado el error se muestra acá; con el modal abierto lo
          muestra él, y repetirlo en los dos lugares lo hace parecer dos fallas. */}
      {!abierto && error && (
        <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {/* El MISMO formulario del SNIFFS que usa la producción desde el lote: se
          declara en paquetes, con el tope del 56 % a la vista (ADR-349/358). */}
      {abierto && (
        <CtpRegistrarProduccionModal
          lote={lote ?? null}
          material={material}
          fecha={corrida.entryDate.slice(0, 10)}
          guardando={guardando}
          error={error}
          titulo={`Declarar la producción de la corrida N° ${corrida.lineNo}`}
          descripcion={
            `${material.especie} · entró ${entrada.toFixed(4)} m³` +
            (corrida.materiaPrimaRef ? ` · lote ${corrida.materiaPrimaRef}` : "")
          }
          onConfirmar={(datos) => void declarar(datos)}
          onClose={() => setAbierto(false)}
        />
      )}
    </section>
  );
}
