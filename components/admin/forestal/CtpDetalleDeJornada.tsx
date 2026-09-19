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
 */

import { type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BarChart3, X } from "@buleje/design-system/icons";
import { BlockTitle, Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import {
  clasificacionCorta,
  SIN_CLASIFICACION,
  SIN_DUENO,
  SIN_ESPECIE,
  type DetalleDeJornada,
} from "@/lib/forestal/detalle-de-jornada";
import type { JornadaDeProduccion } from "./hooks/use-jornadas-produccion";
import { useUbicarFlotante } from "./hooks/use-ubicar-flotante";

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
}

/* 560 y no 448: a 1440 × 900 el botón «Ver qué salió ese día» quedaba debajo del scroll del panel con lugar de sobra. */
const ALTO_MAXIMO = 560;

const ENFOCABLES = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-2.5 border-t border-[var(--rule-soft)] pt-2">
      <Kicker as="h5" className="block">
        {titulo}
      </Kicker>
      <ul className="mt-1 flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

function Renglon({
  nombre,
  cifras,
  titulo,
  apagado = false,
}: {
  nombre: ReactNode;
  cifras?: string;
  titulo?: string;
  apagado?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-2 text-sm" title={titulo}>
      <span className={cn("min-w-0 truncate", apagado ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>
        {nombre}
      </span>
      {cifras && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{cifras}</span>
      )}
    </li>
  );
}

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
}: Props) {
  const lugar = useUbicarFlotante(clave, columna, ALTO_MAXIMO);
  if (!lugar) return null;

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

        <Bloque titulo="Dueño de la madera">
          {detalle.duenos.map((d) => (
            <Renglon
              key={d.etiqueta}
              nombre={d.etiqueta}
              apagado={d.etiqueta === SIN_DUENO}
              cifras={plural(d.corridas, "corrida", "corridas")}
            />
          ))}
        </Bloque>

        {detalle.permisos.length > 0 && (
          <Bloque titulo={detalle.permisos.length === 1 ? "Permiso" : "Permisos"}>
            {detalle.permisos.map((p) => (
              <Renglon key={p} nombre={<span className="font-mono text-xs">{p}</span>} titulo={p} />
            ))}
          </Bloque>
        )}

        {detalle.lineas.length > 0 && (
          <Bloque titulo={detalle.lineas.length === 1 ? "Línea" : "Líneas"}>
            <Renglon nombre={detalle.lineas.join(" · ")} />
          </Bloque>
        )}

        {detalle.sinMateriaPrima > 0 && (
          /* Neutro y no de aviso (decidido en el navegador el 09-14): con la
             regla de `corridaSinOrigen` son 14 de 14 corridas de Blas, y un
             amarillo en todos los días enseña a no mirarlo. Pendientes ya lo
             reclama; acá es un dato del día. */
          <p
            className="mt-2.5 rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5 text-xs text-[var(--text-secondary)]"
            title="No le llega consumo de trozas ni un reproceso: sin eso no se sabe de qué guía salió. Es la misma regla que «corridas sin origen» en Consumos."
          >
            <span>
              <b className="tabular-nums">{detalle.sinMateriaPrima}</b> de {plural(jornada.corridas, "corrida", "corridas")}{" "}
              sin trozas vinculadas
            </span>
          </p>
        )}

        <Bloque titulo={ocultas > 0 ? `Corridas (${detalle.corridas.length} de ${jornada.corridas})` : "Corridas"}>
          {detalle.corridas.map((c) => (
            <Renglon
              key={c.lineNo}
              titulo={c.materiaPrimaRef ? `Materia prima: ${c.materiaPrimaRef}` : undefined}
              nombre={
                <>
                  <b className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">N.º {c.lineNo}</b>{" "}
                  <span className={c.especie ? undefined : "text-[var(--text-tertiary)]"}>
                    {c.especie ?? "sin especie"}
                  </span>
                  {c.materiaPrimaRef && (
                    <span className="text-xs text-[var(--text-tertiary)]"> · {c.materiaPrimaRef}</span>
                  )}
                </>
              }
              cifras={`${fmtM3(c.m3)} m³`}
            />
          ))}
          {ocultas > 0 && (
            <li className="text-xs text-[var(--text-tertiary)]">y {plural(ocultas, "otra", "otras")} en el resumen</li>
          )}
        </Bloque>

        <button
          type="button"
          onClick={onVerResumen}
          className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)] bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-primary/15 dark:text-[var(--accent)]"
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Ver qué salió ese día
        </button>
      </div>
    </div>,
    lugar.destino,
  );
}
