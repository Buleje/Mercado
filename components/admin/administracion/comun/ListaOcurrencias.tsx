"use client";

/**
 * ListaOcurrencias — lo que toca en un día, una fila por actividad: estado,
 * nombre, hora, el detalle que da la fuente («6 de 8 marcados») con su barra,
 * el enlace para ir a hacerlo y «Hecha» a mano. Lo secundario (posponer, no
 * tocaba, deshacer) va en «⋯». La usan Hoy y el panel del día del calendario.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Ban,
  CalendarClock,
  Check,
  MoreHorizontal,
  Pencil,
  SkipForward,
  Undo2,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import { cn } from "@/lib/utils";
import type { EstadoManual, FechaKey, OcurrenciaDTO } from "@/lib/agenda/tipos";
import { ESTILO_ESTADO, PUNTO_COLOR, estaResuelta } from "./estado-ocurrencia";
import { fechaLarga, fechaRelativa, hoyKey } from "./fechas";
import { MarcarModal, diaParaPosponer } from "./MarcarModal";

export const CLASE_CHIP_ESTADO = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";

interface Props {
  ocurrencias: readonly OcurrenciaDTO[];
  /** Muestra el día en cada fila (lista de atrasadas). */
  conFecha?: boolean;
  vacio?: ReactNode;
  etiqueta: string;
}

export function ListaOcurrencias({ ocurrencias, conFecha = false, vacio, etiqueta }: Props) {
  const [abierta, setAbierta] = useState<{ o: OcurrenciaDTO; modo: EstadoManual } | null>(null);
  if (ocurrencias.length === 0) return <>{vacio ?? null}</>;
  return (
    <>
      <ul aria-label={etiqueta} className="divide-y divide-[var(--rule-soft)]">
        {ocurrencias.map((o) => (
          <FilaOcurrencia key={`${o.actividadId}-${o.fecha}`} o={o} conFecha={conFecha} onModal={(modo) => setAbierta({ o, modo })} />
        ))}
      </ul>
      {abierta && <MarcarModal ocurrencia={abierta.o} modo={abierta.modo} onCerrar={() => setAbierta(null)} />}
    </>
  );
}

function irSinRecargar(e: MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void irAEnlace(href);
}

function FilaOcurrencia({ o, conFecha, onModal }: { o: OcurrenciaDTO; conFecha: boolean; onModal: (modo: EstadoManual) => void }) {
  const { colorDe, marcar, desmarcar } = useAgenda();
  const [ocupada, setOcupada] = useState(false);
  const hoy = hoyKey();
  const estilo = ESTILO_ESTADO[o.estado];
  const Icono = estilo.icon;
  const resuelta = estaResuelta(o.estado);
  const puedeHecha = !resuelta && o.fecha <= hoy;

  const correr = async (accion: () => Promise<boolean>) => {
    setOcupada(true);
    await accion();
    setOcupada(false);
  };
  const hecha = () => correr(() => marcar({ actividadId: o.actividadId, fecha: o.fecha, estado: "hecha" }, `«${o.nombre}» quedó hecha`));
  const manana = diaParaPosponer(o.fecha, hoy);

  const menu: MenuAccion[] = [];
  if (puedeHecha) menu.push({ id: "hecha-nota", label: "Hecha, con una nota…", icon: Pencil, onSelect: () => onModal("hecha") });
  if (o.estado !== "hecha") {
    menu.push({
      id: "posponer-manana",
      label: `Posponer al ${fechaLarga(manana)}`,
      icon: SkipForward,
      onSelect: () => void correr(() => marcar({ actividadId: o.actividadId, fecha: o.fecha, estado: "pospuesta", posponerA: manana }, `Pasó al ${fechaLarga(manana)}`)),
    });
    menu.push({ id: "posponer", label: "Posponer a otro día…", icon: CalendarClock, onSelect: () => onModal("pospuesta") });
    menu.push({ id: "omitir", label: "Este día no tocaba…", hint: "No cuenta como atrasada", icon: Ban, onSelect: () => onModal("omitida") });
  }
  if (o.origen === "manual") {
    menu.push({ id: "deshacer", label: "Deshacer la marca", hint: "Vuelve a lo que diga la fuente", icon: Undo2, onSelect: () => void correr(() => desmarcar(o.actividadId, o.fecha)) });
  }

  /* Sin lugar (el panel del día, el celular) los botones bajan a su propia
     línea en vez de exprimir el nombre a una palabra por renglón. */
  return (
    <li className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 py-3", ocupada && "opacity-60")} aria-busy={ocupada}>
      <Icono className={cn("mt-0.5 size-5 shrink-0", estilo.texto)} aria-hidden="true" />
      <div className="min-w-0 flex-[1_1_12rem] space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-semibold text-[var(--text-primary)]">
            <span className={cn("mr-2 inline-block size-2 rounded-full align-middle", PUNTO_COLOR[colorDe(o.actividadId)])} aria-hidden="true" />
            {o.nombre}
          </span>
          {o.hora && <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{o.hora}</span>}
          <span className={cn(CLASE_CHIP_ESTADO, estilo.chip)}>{estilo.label}</span>
          {conFecha && <span className="text-sm text-[var(--text-tertiary)]">{fechaRelativa(o.fecha, hoy)}</span>}
        </div>
        <Detalle o={o} />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {puedeHecha && (
          <button
            type="button"
            data-qa="agenda-hecha"
            className={button({ variant: "secondary", className: "max-sm:w-12 max-sm:px-0" })}
            onClick={() => void hecha()}
            disabled={ocupada}
            title={`Marcar «${o.nombre}» como hecha`}
          >
            <Check className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Hecha</span>
          </button>
        )}
        <a
          href={o.href}
          onClick={(e) => irSinRecargar(e, o.href)}
          className={button({ variant: "ghost", size: "icon" })}
          aria-label={`Ir a hacerlo: ${o.nombre}`}
          title="Ir a hacerlo"
        >
          <ArrowUpRight className="size-5" aria-hidden="true" />
        </a>
        {menu.length > 0 && (
          <ActionMenu label="Más" icon={MoreHorizontal} actions={menu} soloIcono size="md" className="w-12 shrink-0" title={`Más de «${o.nombre}»`} />
        )}
      </div>
    </li>
  );
}

function Detalle({ o }: { o: OcurrenciaDTO }) {
  const estilo = ESTILO_ESTADO[o.estado];
  const pct = o.avance && o.avance.total > 0 ? Math.min(100, Math.round((o.avance.hecho / o.avance.total) * 100)) : null;
  const pie: string[] = [];
  if (o.estado === "pospuesta" && o.posponerA) pie.push(`Pasa al ${fechaLarga(o.posponerA as FechaKey)}`);
  if (o.origen === "manual" && o.marcadoPor) pie.push(`Marcó ${o.marcadoPor}`);
  if (o.origen === "sin_fuente" && !estaResuelta(o.estado)) pie.push("La marcas tú");
  if (!o.detalle && pct === null && pie.length === 0 && !o.nota) return null;
  return (
    <div className="space-y-1 text-sm text-[var(--text-secondary)]">
      {(o.detalle || pct !== null) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {o.detalle && <span>{o.detalle}</span>}
          {pct !== null && o.avance && (
            <span
              role="progressbar"
              aria-label={`${o.avance.hecho} de ${o.avance.total}`}
              aria-valuemin={0}
              aria-valuemax={o.avance.total}
              aria-valuenow={o.avance.hecho}
              className="block h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            >
              <span className={cn("block h-full rounded-full", estilo.punto)} style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
      )}
      {pie.length > 0 && <div className="text-[var(--text-tertiary)]">{pie.join(" · ")}</div>}
      {o.nota && <div className="italic text-[var(--text-tertiary)]">«{o.nota}»</div>}
    </div>
  );
}
