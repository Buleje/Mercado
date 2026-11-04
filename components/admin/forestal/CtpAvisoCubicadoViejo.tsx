"use client";

/**
 * «Lo cubicado es del sáb 01-11 (hace 3 días) — 12 piezas» (radar 2026-09-15).
 *
 * Va arriba del cubicador de «Producir sin lote». Las piezas sobreviven a cerrar
 * el modal; sin esto, la jornada del sábado podía declararse con la fecha del
 * lunes ante SERFOR. Dos salidas: tomar la fecha a la que pertenecen, o borrar
 * y empezar de cero (con confirmación: son piezas cubicadas a mano). Si lo
 * cubicado es del mismo día que la fecha elegida, no se dibuja nada.
 *
 * La decisión es de `lib/forestal/cubicado-de-otro-dia.ts`; lo guardado, de
 * `hooks/libreta-produccion.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { avisoDeCubicadoViejo, diaMes, textoDelAviso } from "@/lib/forestal/cubicado-de-otro-dia";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import {
  confirmarSinFechaLibretaProduccion,
  leerCuandoLibretaProduccion,
  recordarJornadaVigente,
} from "./hooks/libreta-produccion";

export default function CtpAvisoCubicadoViejo({
  fecha,
  piezas,
  libreta,
  onUsarFecha,
  onEmpezarDeCero,
}: {
  /** La fecha de jornada elegida en el modal. */
  fecha: string;
  /** Lo que hay cubicado ahora. */
  piezas: readonly PiezaCubicada[];
  /** Cambia cada vez que el cubicador se vuelve a montar: hay que releer lo guardado. */
  libreta: number;
  /** Pone esa fecha de jornada (también la recuerda junto a lo cubicado). */
  onUsarFecha: (iso: string) => void;
  /** Vacía la libreta y vuelve a montar el cubicador. */
  onEmpezarDeCero: () => void;
}) {
  const { confirm } = useConfirm();
  /* Sube al confirmar una fecha: lo guardado cambió y hay que releerlo. */
  const [version, setVersion] = useState(0);
  /* La jornada elegida viaja con la primera pieza que se cubique desde ahora. */
  useEffect(() => {
    recordarJornadaVigente(fecha);
    return () => recordarJornadaVigente(null);
  }, [fecha]);
  const cantidad = useMemo(() => piezas.reduce((a, p) => a + p.cantidad, 0), [piezas]);
  const aviso = useMemo(
    () => avisoDeCubicadoViejo({ cuando: leerCuandoLibretaProduccion(), cantidad, fecha }),
    // `libreta` y `version` no se usan adentro: son la señal de que lo guardado cambió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cantidad, fecha, libreta, version],
  );
  if (!aviso) return null;

  const piezasTxt = `${fmtPiezas(cantidad)} ${cantidad === 1 ? "pieza" : "piezas"}`;
  const empezarDeCero = async () => {
    const ok = await confirm({
      title: "¿Empezar de cero?",
      description: `Se borran las ${piezasTxt} que hay cubicadas acá. No se puede deshacer.`,
      intent: "danger",
      confirmLabel: "Sí, borrar",
    });
    if (ok) onEmpezarDeCero();
  };

  return (
    <div
      role="status"
      data-aviso-cubicado={aviso.tipo}
      className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3"
    >
      <CalendarClock
        className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        aria-hidden
      />
      <p className="min-w-0 flex-1 basis-60 text-sm font-semibold text-[var(--text-primary)]">
        {textoDelAviso(aviso, piezasTxt)}
      </p>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {aviso.tipo === "otro-dia" ? (
          <button
            type="button"
            onClick={() => onUsarFecha(aviso.usarFecha)}
            className={button({ variant: "secondary", className: "max-sm:flex-1" })}
          >
            Usar fecha {diaMes(aviso.usarFecha)}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              confirmarSinFechaLibretaProduccion(fecha);
              setVersion((n) => n + 1);
            }}
            className={button({ variant: "secondary", className: "max-sm:flex-1" })}
          >
            Es de la fecha {diaMes(fecha)}
          </button>
        )}
        <button
          type="button"
          onClick={() => void empezarDeCero()}
          className={button({ variant: "secondary", className: "max-sm:flex-1" })}
        >
          Empezar de cero
        </button>
      </div>
    </div>
  );
}
