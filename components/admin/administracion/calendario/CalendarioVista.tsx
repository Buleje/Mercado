"use client";

/**
 * CalendarioVista — la agenda como Google Calendar (ADR-501 §1): el mes o la
 * semana, con ‹ Hoy › para moverse, y al lado el día elegido con sus
 * actividades, tareas, vencimientos y notas. Mes/Semana es una sección
 * (`?sub=mes|semana`) y se recuerda como el resto del panel.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "@buleje/design-system/icons";
import { ErrorAlert } from "@buleje/design-system";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda, useCalendarioAgenda } from "@/hooks/use-agenda";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import type { FechaKey } from "@/lib/agenda/tipos";
import { EncabezadoAgenda } from "../comun/EncabezadoAgenda";
import { diasDesde, grillaDelMes, hoyKey, inicioDeMes, inicioDeSemana, sumarDias, sumarMeses, tituloMes, tituloSemana } from "../comun/fechas";
import { GrillaMes } from "./GrillaMes";
import { cn } from "@/lib/utils";
import { PanelDelDia } from "./PanelDelDia";
import { VistaSemana } from "./VistaSemana";

const MODO = ["mes", "semana"] as const;
type Modo = (typeof MODO)[number];
const SECCIONES = [
  { clave: "mes" as const, rotulo: "Mes" },
  { clave: "semana" as const, rotulo: "Semana" },
];
const ID_PANEL = "agenda-calendario";

const AYUDA = {
  what: "Cada día con lo que toca: las actividades que prendiste (con su estado), las tareas que vencen, los vencimientos de adelantos y entregas, y tus notas del día.",
  affects: "El color del chip es el estado: verde hecha, azul a medias, turquesa por hacer, rojo atrasada, gris más adelante. El punto de la izquierda es el color de la actividad.",
  example: "Toca un día para ver su detalle al lado y dejarle una nota. Con las flechas del teclado te mueves de día en día.",
};

export default function CalendarioVista() {
  const { colorDe } = useAgenda();
  const { vista: modo, irA } = useSubvistaModulo<Modo>("administracion-calendario", MODO, "mes");
  const hoy = hoyKey();
  const [elegido, setElegido] = useState<FechaKey>(hoy);

  const mes = inicioDeMes(elegido);
  const lunes = inicioDeSemana(elegido);
  const dias = useMemo(() => (modo === "mes" ? grillaDelMes(mes) : diasDesde(lunes, 7)), [modo, mes, lunes]);
  const { dias: datos, cargando, error, recargar } = useCalendarioAgenda(dias[0], dias[dias.length - 1]);

  const mover = (paso: -1 | 1) => setElegido(modo === "mes" ? sumarMeses(elegido, paso) : sumarDias(elegido, paso * 7));
  const titulo = modo === "mes" ? tituloMes(mes) : tituloSemana(lunes);
  const unidad = modo === "mes" ? "mes" : "semana";

  return (
    <div className="space-y-4">
      <EncabezadoAgenda
        titulo={titulo}
        ayuda={AYUDA}
        secciones={
          <BarraDeSecciones secciones={SECCIONES} activa={modo} onCambiar={(m) => irA(m)} etiqueta="Ver el calendario por" idPanel={ID_PANEL} />
        }
        acciones={
          <div className="flex items-center gap-1" role="group" aria-label="Moverse en el calendario">
            <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={() => mover(-1)} aria-label={`${unidad === "mes" ? "Mes" : "Semana"} anterior`} title={`${unidad === "mes" ? "Mes" : "Semana"} anterior`}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button type="button" className={button({ variant: "secondary" })} onClick={() => setElegido(hoy)} disabled={elegido === hoy}>
              Hoy
            </button>
            <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={() => mover(1)} aria-label={`${unidad === "mes" ? "Mes" : "Semana"} siguiente`} title={`${unidad === "mes" ? "Mes" : "Semana"} siguiente`}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        }
      />

      {error && (
        <ErrorAlert
          title="No se pudo traer el calendario"
          description={error}
          action={
            <button type="button" className={button({ variant: "secondary" })} onClick={recargar}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        />
      )}

      <div
        id={ID_PANEL}
        role="tabpanel"
        aria-labelledby={idPestanaDeSeccion(ID_PANEL, modo)}
        aria-busy={cargando}
        /* La semana necesita el ancho entero: con el panel al lado, a 1280
           cada día medía 84 px y partía las palabras («Servi cio»). */
        className={cn("grid items-start gap-4", modo === "mes" ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "2xl:grid-cols-[minmax(0,1fr)_20rem]")}
      >
        <div className="min-w-0">
          {modo === "mes" ? (
            <GrillaMes dias={dias} mes={mes} datos={datos} hoy={hoy} elegido={elegido} onElegir={setElegido} colorDe={colorDe} />
          ) : (
            <VistaSemana dias={dias} datos={datos} hoy={hoy} elegido={elegido} onElegir={setElegido} colorDe={colorDe} />
          )}
        </div>
        <PanelDelDia fecha={elegido} dia={datos.get(elegido)} cargando={cargando} />
      </div>
    </div>
  );
}
