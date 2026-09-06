"use client";

/**
 * Cargar la sierra desde la pestaña Consumos (ADR-340).
 *
 * El orden del aserradero: se elige el lote, el día, y qué piezas entran. Antes
 * esto sólo se podía declarar hacia atrás —al registrar la corrida— así que la
 * madera que ya estaba aserrándose no figuraba en ningún lado hasta que alguien
 * supiera cuánto había salido.
 *
 * Lo que se ofrece son las piezas **recepcionadas y libres**: sin guía recibida
 * no hay madera que consumir (ADR-339), y una pieza ya apartada en otro lote no
 * se puede tomar dos veces.
 *
 * El filtro de la pila lo maneja la vista (ADR-345): acá llegan las filas ya
 * acotadas. Este componente es la ACCIÓN — qué se eligió, el acta y el consumo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Flame, PackageOpen } from "@buleje/design-system/icons";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarDe, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { labelProductoConsumible } from "@/lib/forestal/lote-programacion";
import CtpTrozasIngresadas from "./CtpTrozasIngresadas";
import CtpConsumirLoteModal, { type ConfirmacionConsumo } from "./CtpConsumirLoteModal";
import CtpCuadrarGuiaModal from "./CtpCuadrarGuiaModal";
import CtpBarraSeleccion from "./ctp-barra-seleccion";
import { Btn } from "./ctp-shared";
import type { EstadoLotesAserrio } from "./hooks/use-lotes-aserrio";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export default function CtpCargarSierra({
  lote,
  fecha,
  estado,
  filas,
  libres,
  totalPatio,
  filtrando,
  seleccion,
  onSeleccion,
  onConsumido,
}: {
  /** El lote elegido en el filtro. */
  lote: LoteAserrio;
  /** Día del consumo (`AAAA-MM-DD`), el del filtro. */
  fecha: string;
  estado: EstadoLotesAserrio;
  /** Las piezas que la vista dejó a la vista, ya acotadas a este lote. */
  filas: TrozaConsumible[];
  libres: TrozaConsumible[];
  totalPatio: number;
  filtrando: boolean;
  seleccion: Set<string>;
  onSeleccion: (ids: Set<string>) => void;
  /**
   * Avisa a la vista para que recargue. `accion` distingue el toast: "adjuntar"
   * no consumió nada, sólo apartó piezas — decirle "Consumo registrado" sería
   * mentir sobre lo que pasó.
   */
  onConsumido: (mensaje: string, tono: "ok" | "aviso", accion?: "consumo" | "adjuntar") => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  /** La guía que se está cuadrando desde el acta (ADR-353). */
  const [cuadre, setCuadre] = useState<{ woodEntryId: string; gtfNumber: string | null } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [adjuntando, setAdjuntando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Lo tildado ahora — sólo de lo que se puede elegir. */
  const elegidas = useMemo(() => libres.filter((t) => seleccion.has(t.id)), [libres, seleccion]);
  /** Las que ya están en ESTE lote esperando la sierra entran igual al consumo. */
  const yaEnElLote = useMemo(
    () => estado.trozas.filter((t) => t.loteAserrioId === lote.id && !t.consumidaEnId),
    [estado.trozas, lote.id],
  );
  const idsYaEnElLote = useMemo(() => new Set(yaEnElLote.map((t) => t.id)), [yaEnElLote]);

  /* Las apartadas llegan TILDADAS, una sola vez por lote: si se re-aplicara en
     cada render, destildar una sería imposible — volvería sola. */
  const preseleccionado = useRef<string | null>(null);
  useEffect(() => {
    if (preseleccionado.current === lote.id) return;
    preseleccionado.current = lote.id;
    onSeleccion(new Set(yaEnElLote.map((t) => t.id)));
  }, [lote.id, yaEnElLote, onSeleccion]);

  /**
   * Lo que entra a la sierra es **lo tildado**, y nada más (ADR-356).
   *
   * Antes era `yaEnElLote + elegidas`: el lote iba entero sí o sí. Ahora se
   * puede aserrar la mitad hoy y dejar la otra mitad apartada para mañana.
   */
  const alConsumo: TrozaConsumible[] = elegidas;
  const volumen = alConsumo.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
  /** Lo tildado que todavía NO es del lote: es lo único que "Adjuntar sin
   *  consumir" puede mandar — lo que ya está adentro no hay nada que adjuntar. */
  const nuevasParaAdjuntar = useMemo(
    () => elegidas.filter((t) => !idsYaEnElLote.has(t.id)),
    [elegidas, idsYaEnElLote],
  );

  async function consumir(datos: ConfirmacionConsumo) {
    setGuardando(true);
    setError(null);
    try {
      const r = await estado.consumirEnPatio({
        loteId: lote.id,
        trozaIds: datos.trozaIds,
        fecha: datos.fecha,
        observaciones: datos.observaciones,
      });
      const rech = r.rechazadas;
      onConsumido(
        `Consumí ${r.piezas} troza${r.piezas === 1 ? "" : "s"} · ${fmtM3(r.volumenM3)} m³ en el lote ${lote.code}. ` +
          `Quedó abierta la corrida N° ${r.corrida.lineNo}: declarale la producción.` +
          (rech.length > 0
            ? ` No entraron ${rech.length}: ${rech.slice(0, 3).map((x) => `${x.codigo ?? "?"} (${x.motivo})`).join(", ")}`
            : ""),
        rech.length > 0 ? "aviso" : "ok",
      );
      onSeleccion(new Set());
      setConfirmando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  /**
   * ADJUNTAR SIN CONSUMIR (Brandon, 2026-09-01): arma el lote de a poco, sin
   * cerrarlo. Es la manera real de dejar trozas para otro día — `consumirEnPatio`
   * adjunta Y consume junto, así que lo tildado se cierra apenas se firma. Acá
   * en cambio las piezas quedan APARTADAS: el lote sigue "abierto" y este mismo
   * combo las vuelve a ofrecer la próxima vez, para tildar sólo una parte y
   * consumir esa (misma fecha o distinta) mientras el resto sigue esperando.
   */
  async function adjuntarSinConsumir() {
    if (nuevasParaAdjuntar.length === 0) return;
    setAdjuntando(true);
    setError(null);
    try {
      const r = await estado.agregarTrozas(lote.id, nuevasParaAdjuntar.map((t) => t.id));
      onConsumido(
        `Adjunté ${r.agregadas} troza${r.agregadas === 1 ? "" : "s"} al lote ${lote.code}: quedan apartadas, sin consumir todavía.` +
          (r.rechazadas.length > 0
            ? ` No entraron ${r.rechazadas.length}: ${r.rechazadas.slice(0, 3).map((x) => `${x.codigo ?? "?"} (${x.motivo})`).join(", ")}`
            : ""),
        r.rechazadas.length > 0 ? "aviso" : "ok",
        "adjuntar",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdjuntando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Cargando el lote <b className="font-mono text-[var(--text-primary)]">{lote.code}</b> ·{" "}
          <b className="text-[var(--text-primary)]">{lote.speciesCommon}</b>
          {yaEnElLote.length > 0 && (
            <>
              {" "}
              · ya tiene <b className="font-mono">{yaEnElLote.length}</b> pieza
              {yaEnElLote.length === 1 ? "" : "s"} apartada{yaEnElLote.length === 1 ? "" : "s"}
            </>
          )}
        </p>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          {alConsumo.length} pza · {fmtM3(volumen)} m³ · {pieTablarDe(volumen).toLocaleString("es-PE")} pt
        </span>
      </header>

      {/* "Revisar y consumir" adjunta Y consume junto: el lote se cierra apenas
          se firma (Brandon, 2026-09-01: "el mismo lote seguirá ahí para
          escoger otras trozas otro día"). "Adjuntar sin consumir" es el
          camino para dejar reserva sin salir de esta pantalla. */}
      {yaEnElLote.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)]">
          &ldquo;Revisar y consumir&rdquo; cierra el lote con lo que tildaste. Si querés
          tildar de más y dejar una parte apartada para otro día, usá{" "}
          <b className="text-[var(--text-secondary)]">Adjuntar sin consumir</b> — el lote
          sigue abierto y volvés a elegirlo la próxima vez.
        </p>
      )}

      {/* La tabla del patio es la MISMA que se mira sin lote elegido: acá sólo
          se le encienden los tildes y llega acotada a la especie del lote
          (ADR-342). Dos listas para la misma madera se contradicen. */}
      <CtpTrozasIngresadas
        filas={filas}
        libres={libres}
        totalPatio={totalPatio}
        filtrando={filtrando}
        cargando={estado.cargando}
        seleccion={seleccion}
        onSeleccion={onSeleccion}
        seleccionable
        loteId={lote.id}
        onSacarDelLote={(trozaId) => {
          /* Recuperación: apartar no es consumir. Mientras el lote no entre a
             la sierra, la madera sigue siendo del patio y tiene que poder
             salir para armar otro lote. */
          const next = new Set(seleccion);
          next.delete(trozaId);
          onSeleccion(next);
          void estado.quitarTroza(lote.id, trozaId).catch((e) => setError(e instanceof Error ? e.message : String(e)));
        }}
        acotadaA={`${lote.speciesCommon}${lote.tipoProductoConsumir ? ` · ${labelProductoConsumible(lote.tipoProductoConsumir)}` : ""}`}
      />

      {/* Sin nada tildado, el botón apagado dice qué falta hacer. Con selección
          manda la barra del pie, que lleva la cuenta acumulada al lado de la
          acción: el operador decide por m³ mientras tilda, y el total vivía a
          doscientas filas de scroll de donde está mirando. */}
      {alConsumo.length === 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Btn variant="primary" disabled>
            <Flame className="h-4 w-4" />
            Revisar y consumir
          </Btn>
        </div>
      )}

      {alConsumo.length > 0 && (
        <CtpBarraSeleccion
          cifras={[
            { label: "Trozas", valor: `${alConsumo.length}` },
            { label: "Volumen", valor: `${fmtM3(volumen)} m³`, fuerte: true },
            { label: "Pie tablar", valor: `${pieTablarDe(volumen).toLocaleString("es-PE")} pt` },
            ...(yaEnElLote.length > 0
              ? [{ label: "Del lote", valor: `${elegidas.filter((t) => idsYaEnElLote.has(t.id)).length}` }]
              : []),
          ]}
          onLimpiar={() => onSeleccion(new Set())}
          accionLabel="Revisar y consumir"
          accionIcon={Flame}
          onAccion={() => { setError(null); setConfirmando(true); }}
          accionesSecundarias={
            nuevasParaAdjuntar.length > 0
              ? [
                  {
                    label: adjuntando ? "Adjuntando…" : "Adjuntar sin consumir",
                    icon: PackageOpen,
                    disabled: adjuntando,
                    onClick: () => void adjuntarSinConsumir(),
                  },
                ]
              : undefined
          }
        />
      )}

      {confirmando && (
        <CtpConsumirLoteModal
          lote={lote}
          trozas={alConsumo}
          fecha={fecha}
          yaEnElLote={idsYaEnElLote}
          guardando={guardando}
          error={error}
          onConfirmar={(datos) => void consumir(datos)}
          onCuadrar={(woodEntryId, gtfNumber) => {
            /* El cuadre REEMPLAZA el acta (misma regla que ficha↔documento,
               ADR-350): apilar dos modales obliga a cerrar dos veces, y al
               volver el acta tiene que recalcular con los números nuevos. */
            setConfirmando(false);
            setCuadre({ woodEntryId, gtfNumber });
          }}
          onClose={() => setConfirmando(false)}
        />
      )}

      {cuadre && (
        <CtpCuadrarGuiaModal
          gtfNumber={cuadre.gtfNumber ?? "—"}
          subtitulo={`Desde el acta del lote ${lote.code}`}
          entryIds={[cuadre.woodEntryId]}
          onCuadrada={() => {
            /* El patio guarda `guiaVolumenM3`/`guiaConsumidoM3` por troza: sin
               recargarlo, el acta volvería a abrirse con el tope viejo y
               seguiría bloqueando una guía ya cuadrada. */
            void estado.recargar();
            onConsumido("Guía cuadrada · el acta ya toma los números nuevos", "ok");
          }}
          onClose={() => setCuadre(null)}
        />
      )}

      {!confirmando && error && (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 rotate-45" aria-hidden />
          {error}
        </p>
      )}
    </section>
  );
}
