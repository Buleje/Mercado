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
  Loader2,
  Truck,
  Users,
  UserX,
} from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import { useKpisPlegables } from "../kpis-plegables";
import GentePorHora from "./GentePorHora";
import { ActividadYCamaras, CamionesDelDia, ChalecosDelDia, PilaDelDia } from "./ListasDelDia";
import { useResumenPatio } from "./use-resumen-patio";
import { useResumenPersonas } from "./use-resumen-personas";
import ResumenPersonasHoy from "./ResumenPersonasHoy";
import SelectorDia from "./SelectorDia";
import TrozasALaVista from "./TrozasALaVista";
import { BLOQUE, diaLegible } from "./camaras-ui";

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
  /* Personas DISTINTAS (por la ropa, ADR-479): la pastilla lleva a «Personas». */
  const personas = useResumenPersonas(fecha, activo);
  const recargarPersonas = personas.recargar;

  /* Sólo cuando se aprieta «Actualizar»: el día nuevo ya lo pide el hook, y al
     montar también (sin esto, volver a la vista pedía el día dos veces). */
  const recargaVista = useRef(recarga);
  useEffect(() => {
    if (recargaVista.current === recarga) return;
    recargaVista.current = recarga;
    if (!activo) return;
    void recargar();
    void recargarPersonas();
  }, [recarga, activo, recargar, recargarPersonas]);

  const esHoy = fecha === hoy;
  const titulo = esHoy ? "Hoy en el patio" : `El patio el ${diaLegible(fecha)}`;
  const pico = r?.personasPorHora.length
    ? r.personasPorHora.reduce((a, b) => (b.max > a.max ? b : a))
    : null;
  const conGuia = r?.camiones.filter((c) => c.etiquetaCruce).length ?? 0;
  const sinMarcar = r?.chalecos.filter((c) => c.sinMarcacion).length ?? 0;
  const conFotos = r?.porCamara.filter((c) => c.fotos > 0).length ?? 0;

  /* Las cuatro cifras del día se pliegan (Brandon 05-10). Sin fotos no hay cifras que plegar. */
  const kpis = useKpisPlegables({
    claveMemoria: "camaras-hoy",
    resumen: r && r.fotos > 0
      ? `${r.fotos} ${r.fotos === 1 ? "foto" : "fotos"} · ${r.camiones.length} ${r.camiones.length === 1 ? "camión" : "camiones"} · ${sinMarcar} sin marcación`
      : undefined,
    tarjetas: r && r.fotos > 0 ? [
      <StatCard
        key="fotos"
        label="Fotos"
        value={r.fotos}
        icon={Camera}
        subValue={
          r.sinLectura > 0
            ? `${r.sinLectura} sin leer`
            : `de ${conFotos} ${conFotos === 1 ? "cámara" : "cámaras"}`
        }
      />,
      <StatCard
        key="camiones"
        label="Camiones"
        value={r.camiones.length}
        icon={Truck}
        subValue={`${conGuia} con guía o flete`}
      />,
      <StatCard
        key="pico"
        label="Más gente junta"
        value={pico ? pico.max : "—"}
        icon={Users}
        subValue={
          pico ? `a las ${String(pico.hora).padStart(2, "0")} h, en una foto` : "sin fotos"
        }
      />,
      <StatCard
        key="sin-marcar"
        label="Sin marcación"
        value={sinMarcar}
        icon={UserX}
        emphasis={sinMarcar > 0 ? "warning" : "neutral"}
        subValue={`de ${r.chalecos.length} ${r.chalecos.length === 1 ? "chaleco visto" : "chalecos vistos"}`}
      />,
    ] : [],
  });

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
        <ResumenPersonasHoy resumen={personas.resumen} esHoy={esHoy} enlace />
        {kpis.boton}
        <SelectorDia fecha={fecha} hoy={hoy} onCambiar={setFecha} etiqueta="Día del resumen" />
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
          <div className={cargando ? "opacity-60" : undefined} aria-busy={cargando}>{kpis.panel}</div>
          <GentePorHora filas={r.personasPorHora} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CamionesDelDia camiones={r.camiones} />
            <ChalecosDelDia chalecos={r.chalecos} onAsignar={onAsignarChaleco} />
            <PilaDelDia pila={r.pila} />
            <ActividadYCamaras actividades={r.actividades} porCamara={r.porCamara} />
          </div>
        </>
      )}

      {/* Los marcadores de la testa (ADR-480): no dependen de las fotos del día. */}
      <TrozasALaVista fecha={fecha} esHoy={esHoy} activo={activo} />
    </div>
  );
}
