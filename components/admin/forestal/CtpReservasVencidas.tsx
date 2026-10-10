"use client";

/**
 * Reservas vencidas en la campana de avisos del libro, con su arreglo al lado.
 *
 * Una reserva (ADR-418) no se suelta sola al vencer: queda en rojo en su fila de
 * Productos disponibles. Pero eso sólo se ve mirando ESA fila, y mientras tanto
 * la madera sigue «para Juancho» y nadie más la ofrece. Acá sale sola, una por
 * fila, y se resuelve sin cambiar de pestaña:
 *
 *  · **Liberar** — la madera vuelve a estar libre (la misma `liberar_apartado`
 *    del modal, con el motivo escrito solo para el historial).
 *  · **Extender** — un clic la lleva a hoy + 7 días; «otra fecha» deja elegir.
 *    Es `cambiar_apartado` con sólo el plazo: no se suelta y se vuelve a tomar,
 *    que perdería la fecha original y abriría un hueco para que otro la aparte.
 *
 * No es un indicador (memoria `deuda-no-es-indicador`): pide trabajo, así que no
 * va a la grilla de KPIs y no se dibuja cuando no hay ninguna.
 *
 * Los botones sólo salen a quien el servidor deja escribir (`puedePedir` con el
 * MISMO array del PATCH): el almacenero ve la reserva —es madera frenada y le
 * sirve saberlo— pero no un botón que le respondería 403 en inglés.
 */

import { useState } from "react";
import { ArrowRight, Bookmark, CalendarClock, CheckCircle2, Loader2, Unlock } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import {
  detalleReservaVencida,
  plazoPropuesto,
  resumenReservasVencidas,
  textoReservaVencida,
  type ReservaVencida,
} from "@/lib/forestal/reservas-vencidas";
import { Btn, I } from "./ctp-shared";
import { useApartado } from "./hooks/use-apartado";

/** Queda en el historial de la reserva: quién la soltó ya lo guarda el servidor. */
const MOTIVO_LIBERAR = "Reserva vencida: liberada desde los avisos del libro.";

const ROTULO =
  "mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

export default function CtpReservasVencidas({
  reservas,
  onResuelta,
  onVer,
  ahora,
  className = "",
}: {
  reservas: readonly ReservaVencida[];
  /** Saca la fila de la lista y vuelve a leer las vencidas. */
  onResuelta: (id: string) => void;
  /** Lleva a Productos disponibles, para mirar la madera antes de decidir. */
  onVer?: () => void;
  /** El «hoy» del plazo propuesto. Por defecto el reloj; se pasa para probarlo. */
  ahora?: Date;
  /** El margen lo decide quien la ubica: no se dibuja nada cuando no hay reservas. */
  className?: string;
}) {
  /* El resultado vive acá y no en la fila: la fila desaparece al resolverse, y
     el «listo» tiene que seguir a la vista para saber qué pasó. */
  const [aviso, setAviso] = useState<string | null>(null);
  const rol = useMiRol();
  const puedeCambiar = puedePedir("PATCH /api/admin/forestal/ctp", rol);
  /* Con el rol todavía cargando (`null`) no hay botones, pero tampoco se afirma
     que falte permiso: a un admin le parpadearía «lo hace el dueño». */
  const sinPermiso = rol != null && !puedeCambiar;

  if (reservas.length === 0 && !aviso) return null;
  return (
    <section aria-label="Reservas vencidas" className={className}>
      {reservas.length > 0 && (
        <>
          <p className={ROTULO}>
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> {resumenReservasVencidas(reservas.length)}
          </p>
          {sinPermiso && (
            <p className="mb-2 text-sm text-[var(--text-secondary)]">
              Liberar o extender una reserva lo hace el dueño o el administrador: avísale para que la
              suelte o le dé más plazo.
            </p>
          )}
          <ul className="space-y-2">
            {reservas.map((r) => (
              <FilaReserva
                key={r.id}
                reserva={r}
                ahora={ahora}
                puedeCambiar={puedeCambiar}
                onVer={onVer}
                onHecho={(mensaje) => {
                  setAviso(mensaje);
                  onResuelta(r.id);
                }}
              />
            ))}
          </ul>
        </>
      )}
      {aviso && (
        <p
          role="status"
          className="mt-2 flex items-start gap-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {aviso}
        </p>
      )}
    </section>
  );
}

function FilaReserva({
  reserva: r,
  ahora,
  puedeCambiar,
  onVer,
  onHecho,
}: {
  reserva: ReservaVencida;
  ahora?: Date;
  /** Sin permiso de escritura se lee la reserva, sin botones. */
  puedeCambiar: boolean;
  onVer?: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const hoy = limaDateKey(ahora ?? new Date());
  const [fecha, setFecha] = useState(() => plazoPropuesto(ahora ?? new Date()));
  const [otraFecha, setOtraFecha] = useState(false);
  const { enviando, error, liberar, cambiar } = useApartado();
  const queCosa = r.paqueteCodigo ? `el paquete ${r.paqueteCodigo}` : `la corrida N° ${r.lineNo}`;
  /* El `min` del input no frena lo tipeado a mano: sin esto el servidor lo
     rechazaría con un 422 después del clic. */
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= hoy;
  const ocupado = enviando !== null;

  async function soltar() {
    if (await liberar(r.id, MOTIVO_LIBERAR)) {
      onHecho(`Reserva liberada: ${queCosa} de ${r.para} vuelve a estar libre.`);
    }
  }

  async function extender() {
    if (!fechaValida) return;
    if (await cambiar(r.id, { hasta: fecha })) {
      onHecho(`Reserva extendida: ${queCosa} sigue para ${r.para} hasta el ${diaConNombre(fecha)}.`);
    }
  }

  return (
    <li className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2.5 dark:bg-[var(--data-warning-500)]/12">
      <p className="text-sm font-bold text-[var(--text-primary)]">{textoReservaVencida(r)}</p>
      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
        {detalleReservaVencida(r)}
        {onVer && (
          <>
            {" · "}
            <button
              type="button"
              onClick={onVer}
              className="inline-flex items-center gap-1 font-bold text-[var(--accent-dark)] underline decoration-dotted underline-offset-4 dark:text-[var(--accent)]"
            >
              Ver en Productos disponibles <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
      </p>

      {puedeCambiar && (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn size="sm" variant="primary" disabled={ocupado || !fechaValida} onClick={() => void extender()}>
          {enviando === "cambiar" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CalendarClock className="h-4 w-4" aria-hidden />
          )}
          {fechaValida ? `Extender al ${diaConNombre(fecha)}` : "Extender"}
        </Btn>
        <Btn size="sm" variant="danger" disabled={ocupado} onClick={() => void soltar()}>
          {enviando === "liberar" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Unlock className="h-4 w-4" aria-hidden />
          )}
          Liberar
        </Btn>
        {otraFecha ? (
          <input
            type="date"
            value={fecha}
            min={hoy}
            onChange={(e) => setFecha(e.target.value)}
            aria-label={`Nueva fecha límite de la reserva de ${r.para}`}
            className={`${I} h-9! w-auto! font-mono tabular-nums`}
          />
        ) : (
          <Btn size="sm" variant="ghost" disabled={ocupado} onClick={() => setOtraFecha(true)}>
            Otra fecha
          </Btn>
        )}
      </div>
      )}
      {!fechaValida && otraFecha && (
        <p className="mt-1 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          Elige una fecha de hoy en adelante.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </li>
  );
}
