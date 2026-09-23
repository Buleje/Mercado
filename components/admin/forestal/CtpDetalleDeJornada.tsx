"use client";

/**
 * CtpDetalleDeJornada — el panel flotante con el detalle de un día de la tira.
 *
 * Pedido de Brandon (2026-09-14): *«al pasar el mouse o tener un ícono de cada
 * día se pueda ver un menú del detalle, así flotante, de dueño, especies,
 * clasificación y demás detalles»*.
 *
 * Es un vistazo, no el resumen: cabe en 20 rem y responde «¿esto que voy a
 * cargar ya está?». El resumen completo (por especie y producto, con traer al
 * cubicado) sigue a un botón.
 *
 * ## En un portal, dentro del diálogo
 *
 * `useUbicarFlotante` lo porta al `[role=dialog]` más cercano con `fixed`: en
 * «Declarar producción» la tira vive dentro de un cuerpo con overflow y un
 * `absolute` quedaba recortado. Como deja de ser hijo del casillero en el DOM:
 *  · lleva `data-detalle-de` con la clave del casillero, que es lo que miran
 *    el clic afuera y la pérdida de foco (`contains` ya no alcanza);
 *  · repite el entrar/salir del mouse, así ir del casillero al panel no lo
 *    cierra aunque el navegador cuente un «salir»;
 *  · Tab desde el ícono entra al panel y Shift+Tab vuelve (el portal queda al
 *    final del diálogo y el orden natural lo saltaría).
 * El `z-[56]` es local al diálogo (`Dialog.Content` y el fondo `z-[60]` abren
 * su propio contexto): queda encima del cuerpo, que usa hasta `z-50`.
 *
 * ## Sin scroll (Brandon, 2026-09-23: «que se vea todo sin necesidad de scrollear»)
 *
 * Medido con el día real más cargado de Blas (lunes 07/09: 6 especies, 3
 * clasificaciones, dueño, permiso y línea): en 20 rem el contenido pedía 794 px
 * en una caja de 558 y el pie «sin trozas vinculadas» quedaba debajo del
 * scroll. Ahora pide 35 rem cuando hay más de tres renglones que mostrar y, si
 * entran, Especies y Clasificación van lado a lado; dueño, permiso y línea van
 * en UNA franja; las corridas, en dos columnas. A 400 px (una
 * columna) entra igual: lo que se ahorró son títulos y renglones, no letra.
 */

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Loader2, Trash2, X } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import {
  clasificacionCorta,
  SIN_CLASIFICACION,
  SIN_ESPECIE,
  type DetalleDeJornada,
} from "@/lib/forestal/detalle-de-jornada";
import type { JornadaDeProduccion } from "./hooks/use-jornadas-produccion";
import { useUbicarFlotante } from "./hooks/use-ubicar-flotante";
import { Bloque, FranjaDelDia, plural, Renglon } from "./CtpDetalleDeJornadaPartes";

interface Props {
  id: string;
  /** La del casillero (`data-casillero`): ancla y dueño del panel. */
  clave: string;
  jornada: JornadaDeProduccion;
  detalle: DetalleDeJornada;
  /** 0 = lunes … 6 = domingo: de qué lado abre para no salirse de la pantalla. */
  columna: number;
  onEntrar: () => void;
  onSalir: () => void;
  /** Cierra y devuelve el foco al ícono. */
  onCerrar: () => void;
  /** Devuelve el foco al ícono sin cerrar (Shift+Tab en el primer control). */
  onVolverAlAncla: () => void;
  onVerResumen: () => void;
  /** Anular lo declarado ese día. En táctil es la única puerta (no hay «pasar el mouse»). */
  onAnular?: () => void;
  anulando?: boolean;
}

/* El tope es una red, no el diseño: el contenido del día real más cargado mide
   ~560 px en una columna, y el alto de verdad lo recorta el espacio visible. */
const ALTO_MAXIMO = 720;
/** 35 rem: lo que pide un día con muchas especies o clasificaciones. */
const ANCHO_AMPLIO = 560;
/** Desde acá entran dos columnas de renglones «Cachimbo · 480 PT · 1.133 m³». */
const ANCHO_DOS_COLUMNAS = 480;

const ENFOCABLES = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function CtpDetalleDeJornada({
  id,
  clave,
  jornada,
  detalle,
  columna,
  onEntrar,
  onSalir,
  onCerrar,
  onVolverAlAncla,
  onVerResumen,
  onAnular,
  anulando = false,
}: Props) {
  const muchos = detalle.especies.length + detalle.clasificaciones.length > 3;
  /* Lo que mide el contenido entero: con eso el panel sube si abajo no entra. */
  const cajaRef = useRef<HTMLDivElement>(null);
  const [altoNecesario, setAltoNecesario] = useState<number>();
  const lugar = useUbicarFlotante(clave, columna, ALTO_MAXIMO, muchos ? ANCHO_AMPLIO : undefined, altoNecesario);
  const anchoActual = lugar?.ancho;
  useLayoutEffect(() => {
    const caja = cajaRef.current;
    if (!caja?.scrollHeight) return;
    /* `scrollHeight` no cuenta el borde y `maxHeight` sí (border-box): sin
       sumarlo quedaban 2 px de scroll (medido a 400 px). */
    const alto = caja.scrollHeight + (caja.offsetHeight - caja.clientHeight);
    setAltoNecesario((prev) => (prev === alto ? prev : alto));
  }, [detalle, anchoActual]);
  if (!lugar) return null;
  const dosColumnas = lugar.ancho >= ANCHO_DOS_COLUMNAS;

  /* Tab en el borde del panel vuelve a la tira: Shift+Tab en el primero, al
     ícono; Tab en el último, cierra y deja el foco en el ícono. */
  const onTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const enfocables = [...e.currentTarget.querySelectorAll<HTMLElement>(ENFOCABLES)];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === enfocables[0] || activo === e.currentTarget)) {
      e.preventDefault();
      onVolverAlAncla();
    } else if (!e.shiftKey && activo === enfocables[enfocables.length - 1]) {
      e.preventDefault();
      onCerrar();
    }
  };

  const dia = etiquetaLarga(jornada.dia);
  const ocultas = jornada.corridas - detalle.corridas.length;
  const totales = [
    plural(jornada.corridas, "corrida", "corridas"),
    jornada.pt >= 1 ? `${fmtPt(jornada.pt)} PT` : null,
    `${fmtM3(jornada.m3)} m³`,
    jornada.piezas > 0 ? `${fmtPiezas(jornada.piezas)} pza` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return createPortal(
    <div
      id={id}
      role="dialog"
      aria-label={`Detalle del ${dia}`}
      tabIndex={-1}
      data-detalle-panel
      data-detalle-de={clave}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onEntrar();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onSalir();
      }}
      onKeyDown={onTecla}
      style={{ left: lugar.left, width: lugar.ancho, top: lugar.top, bottom: lugar.bottom }}
      className={cn(
        /* El padding transparente es el puente con el casillero: un hueco de
           margen haría «salir» al mouse en el camino. */
        "fixed z-[56] text-left outline-none",
        lugar.arriba ? "pb-1.5" : "pt-1.5",
      )}
    >
      <div
        ref={cajaRef}
        style={{ maxHeight: lugar.maxAlto }}
        className="overflow-y-auto overscroll-contain rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <BlockTitle className="first-letter:uppercase">{dia}</BlockTitle>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{totales}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el detalle"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Especies | Clasificación: lado a lado si entran. */}
        <div className={cn("grid gap-x-5", dosColumnas && "grid-cols-2")}>
          <Bloque titulo="Especies">
            {detalle.especies.map((e) => (
              <Renglon
                key={e.especie}
                nombre={e.especie}
                apagado={e.especie === SIN_ESPECIE}
                /* «0 PT» se lee como «nada»: la corrida chica se dice en m³. */
                cifras={e.pt >= 1 ? `${fmtPt(e.pt)} PT · ${fmtM3(e.m3)} m³` : `${fmtM3(e.m3)} m³`}
              />
            ))}
          </Bloque>

          <Bloque titulo="Clasificación">
            {detalle.clasificaciones.map((c) => (
              <Renglon
                key={c.producto}
                nombre={clasificacionCorta(c.producto)}
                titulo={c.producto}
                apagado={c.producto === SIN_CLASIFICACION}
                cifras={[c.piezas > 0 ? `${fmtPiezas(c.piezas)} pza` : null, `${fmtM3(c.m3)} m³`]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </Bloque>
        </div>

        <FranjaDelDia detalle={detalle} />

        {detalle.sinMateriaPrima > 0 && (
          /* Neutro y no de aviso (decidido en el navegador el 09-14): con la
             regla de `corridaSinOrigen` son 14 de 14 corridas de Blas, y un
             amarillo en todos los días enseña a no mirarlo. Pendientes ya lo
             reclama; acá es un dato del día. */
          <p
            className="mt-2 rounded-lg bg-[var(--surface-sunken)] px-2 py-1 text-xs text-[var(--text-secondary)]"
            title="No le llega consumo de trozas ni un reproceso: sin eso no se sabe de qué guía salió. Es la misma regla que «corridas sin origen» en Consumos."
          >
            <span>
              <b className="tabular-nums">{detalle.sinMateriaPrima}</b> de {plural(jornada.corridas, "corrida", "corridas")}{" "}
              sin trozas vinculadas
            </span>
          </p>
        )}

        {/* Una corrida cuyo asiento dice otras piezas que sus paquetes (23-09:
            N° 29 de Blas, 156 contra 336). El día cuenta las de los paquetes;
            esto dice cuál corregir. Ámbar y no neutro: acá SÍ hay un error. */}
        {(detalle.piezasSinCuadrar ?? []).length > 0 && (
          <p className="mt-2 rounded-lg bg-[var(--data-warning-50)] px-2 py-1 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            {(detalle.piezasSinCuadrar ?? []).map((c) => (
              <span key={c.lineNo} className="block">
                N° <b className="tabular-nums">{c.lineNo}</b>: el asiento dice{" "}
                <b className="tabular-nums">{c.asiento}</b> piezas y sus paquetes{" "}
                <b className="tabular-nums">{c.paquetes}</b> — el día cuenta las de los paquetes.
              </span>
            ))}
          </p>
        )}

        <Bloque
          titulo={ocultas > 0 ? `Corridas (${detalle.corridas.length} de ${jornada.corridas})` : "Corridas"}
          /* En dos columnas si entran: una corrida es un renglón corto. Tres
             columnas cortaban la especie («Pangu…», medido a 560 px). */
          listaClassName={cn("grid gap-x-5", dosColumnas && "grid-cols-2")}
        >
          {detalle.corridas.map((c) => (
            <Renglon
              key={c.lineNo}
              titulo={
                [c.especie ?? "sin especie", c.materiaPrimaRef ? `materia prima: ${c.materiaPrimaRef}` : null]
                  .filter(Boolean)
                  .join(" · ")
              }
              nombre={
                <>
                  <b className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">N.º {c.lineNo}</b>{" "}
                  <span className={c.especie ? undefined : "text-[var(--text-tertiary)]"}>
                    {c.especie ?? "sin especie"}
                  </span>
                  {/* Un código corto («17-2026») se ve; un texto largo («Sin lote —
                      cubicado en el Libro») queda en el globo: a 560 px se
                      cortaba en «Sin lote — cubicado en el L…». */}
                  {c.materiaPrimaRef && c.materiaPrimaRef.length <= 14 && (
                    <span className="text-xs text-[var(--text-tertiary)]"> · {c.materiaPrimaRef}</span>
                  )}
                </>
              }
              cifras={`${fmtM3(c.m3)} m³`}
            />
          ))}
          {ocultas > 0 && (
            <li className="col-span-full text-xs text-[var(--text-tertiary)]">
              y {plural(ocultas, "otra", "otras")} en el resumen
            </li>
          )}
        </Bloque>

        {/* «Ver qué salió» va ÚLTIMO: Tab en el último control del panel
            cierra y vuelve al ícono, y es la acción de todos los días. */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {onAnular && (
            <button
              type="button"
              onClick={onAnular}
              disabled={anulando}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--data-error-500)]/50 px-2.5 py-1.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 disabled:opacity-60 dark:text-[var(--data-error-500)]"
            >
              {anulando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Anular el día
            </button>
          )}
          <button
            type="button"
            onClick={onVerResumen}
            className="inline-flex min-h-9 grow items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)] bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-primary/15 dark:text-[var(--accent)]"
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Ver qué salió ese día
          </button>
        </div>
      </div>
    </div>,
    lugar.destino,
  );
}
