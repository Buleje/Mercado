"use client";

/**
 * «Hoy en el patio» — el día del patio en una pantalla (ADR-456).
 *
 * Lo mismo que el WhatsApp de las 19:00, pero para mirar cualquier día: cuántas
 * fotos, qué camiones y con qué guía, cuánta gente en la hora más movida, quién
 * estuvo sin marcar asistencia y qué pasó con la pila. Sale entero de
 * `/api/admin/camaras/resumen`: la pantalla no suma nada.
 */

import { useEffect, useRef, useState } from "react";
import { SectionTitle, StatCard } from "@buleje/design-system";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Truck,
  Users,
  UserX,
} from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import GentePorHora from "./GentePorHora";
import { ActividadYCamaras, CamionesDelDia, ChalecosDelDia, PilaDelDia } from "./ListasDelDia";
import { useResumenPatio } from "./use-resumen-patio";
import { BLOQUE, BTN, diaLegible, moverDia } from "./camaras-ui";

interface Props {
  activo: boolean;
  /** Cambia con «Actualizar» de la cabecera: vuelve a pedir el día. */
  recarga: number;
  onAsignarChaleco: (numero: string) => void;
}

export default function HoyEnElPatio({ activo, recarga, onAsignarChaleco }: Props) {
  const hoy = limaDateKey();
  const [fecha, setFecha] = useState(hoy);
  const { resumen: r, cargando, error, recargar } = useResumenPatio(fecha, activo);

  /* Sólo cuando se aprieta «Actualizar»: el día nuevo ya lo pide el hook, y al
     montar también (sin esto, volver a la vista pedía el día dos veces). */
  const recargaVista = useRef(recarga);
  useEffect(() => {
    if (recargaVista.current === recarga) return;
    recargaVista.current = recarga;
    if (activo) void recargar();
  }, [recarga, activo, recargar]);

  const esHoy = fecha === hoy;
  const titulo = esHoy ? "Hoy en el patio" : `El patio el ${diaLegible(fecha)}`;
  const pico = r?.personasPorHora.length
    ? r.personasPorHora.reduce((a, b) => (b.max > a.max ? b : a))
    : null;
  const conGuia = r?.camiones.filter((c) => c.etiquetaCruce).length ?? 0;
  const sinMarcar = r?.chalecos.filter((c) => c.sinMarcacion).length ?? 0;
  const conFotos = r?.porCamara.filter((c) => c.fotos > 0).length ?? 0;

  return (
    <div className="space-y-4" data-testid="camaras-hoy">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="mr-auto">
          {titulo}
          {esHoy && (
            <span className="ml-2 text-sm font-normal text-[var(--text-tertiary)]">
              {diaLegible(fecha)}
            </span>
          )}
        </SectionTitle>
        <div className="flex items-center gap-1" role="group" aria-label="Elegir el día">
          <button
            type="button"
            onClick={() => setFecha((f) => moverDia(f, -1))}
            aria-label="Día anterior"
            className={cn(BTN, "w-10 justify-center px-0")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setFecha(e.target.value);
            }}
            aria-label="Día del resumen"
            className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => setFecha((f) => moverDia(f, 1))}
            disabled={esHoy}
            aria-label="Día siguiente"
            className={cn(BTN, "w-10 justify-center px-0")}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          {!esHoy && (
            <button type="button" onClick={() => setFecha(hoy)} className={BTN}>
              Hoy
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]"
        >
          No se pudo leer el resumen del día: {error}
        </p>
      ) : !r ? (
        <p
          className="flex items-center gap-2 px-1 py-8 text-sm text-[var(--text-tertiary)]"
          aria-busy
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Armando el resumen del día…
        </p>
      ) : r.fotos === 0 ? (
        <div className={`${BLOQUE} flex flex-col items-center gap-2 py-10 text-center`}>
          <Camera className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-base font-bold text-[var(--text-primary)]">
            {esHoy ? "Hoy todavía no llegó ninguna foto" : "Ese día no llegó ninguna foto"}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {r.porCamara.length
              ? `Sin fotos no hay camiones, gente ni pila que contar. ${r.porCamara.map((c) => c.nombre).join(", ")}: revisa batería y datos si la esperabas.`
              : "Todavía no hay cámaras dadas de alta."}
          </p>
        </div>
      ) : (
        <>
          <div
            className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${cargando ? "opacity-60" : ""}`}
            aria-busy={cargando}
          >
            <StatCard
              label="Fotos"
              value={r.fotos}
              icon={Camera}
              subValue={
                r.sinLectura > 0
                  ? `${r.sinLectura} sin leer`
                  : `de ${conFotos} ${conFotos === 1 ? "cámara" : "cámaras"}`
              }
            />
            <StatCard
              label="Camiones"
              value={r.camiones.length}
              icon={Truck}
              subValue={`${conGuia} con guía o flete`}
            />
            <StatCard
              label="Más gente junta"
              value={pico ? pico.max : "—"}
              icon={Users}
              subValue={
                pico ? `a las ${String(pico.hora).padStart(2, "0")} h, en una foto` : "sin fotos"
              }
            />
            <StatCard
              label="Sin marcación"
              value={sinMarcar}
              icon={UserX}
              emphasis={sinMarcar > 0 ? "warning" : "neutral"}
              subValue={`de ${r.chalecos.length} ${r.chalecos.length === 1 ? "chaleco visto" : "chalecos vistos"}`}
            />
          </div>
          <GentePorHora filas={r.personasPorHora} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CamionesDelDia camiones={r.camiones} />
            <ChalecosDelDia chalecos={r.chalecos} onAsignar={onAsignarChaleco} />
            <PilaDelDia pila={r.pila} />
            <ActividadYCamaras actividades={r.actividades} porCamara={r.porCamara} />
          </div>
        </>
      )}
    </div>
  );
}
