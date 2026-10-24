"use client";

/**
 * La tabla de Equipo › Personal, separada de `PersonalView` (19-10) al sumarle
 * la columna «Contrato»: la pestaña Equipo › Contratos se mudó acá. Cada
 * persona muestra el contrato que pide atención antes (por vencer, vigente,
 * por firmar…) con su vencimiento; todos se ven en su ficha. Sin contrato y
 * con permiso: «Hacer contrato» abre el creador con sus datos ya puestos.
 */
import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { abreLaFicha } from "@/lib/admin/enlaces-panel";
import { hrefHacerContrato, type ContratoDePersona } from "@/lib/rrhh/contratos-por-persona";
import { TIPO_LABELS } from "@/lib/types/contracts";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";
import { cn } from "@/lib/utils";
import { CLASE_CHIP } from "../rrhh-form";
import { CLASE_FOCUS_FILA, COLABORADOR_ESTADO_META, filaClicableProps, formatearFecha } from "../rrhh-ui";
import { claseEstadoContrato, etiquetaEstadoContrato } from "./FichaContratos";
import { columnasFiltroPersonal } from "./filtros-columnas-personal";

/** ¿El nombre de la fila es enlace a la ficha? (`EnlacePanel`, según la tabla de hipervínculos). */
const NOMBRE_ES_ENLACE = abreLaFicha("colaborador");

interface Props {
  filas: ColaboradorDTO[];
  onAbrir: (id: string) => void;
  /** `null` = no se pudieron leer los contratos (o no corresponde): sin columna. */
  contratos: Map<string, ContratoDePersona> | null;
  puedeHacerContrato: boolean;
}

function CeldaContrato({ c, id, puedeHacer }: { c: ContratoDePersona | undefined; id: string; puedeHacer: boolean }) {
  if (!c) {
    if (!puedeHacer) return <span className="text-[var(--text-tertiary)]">Sin contrato</span>;
    const href = hrefHacerContrato(id);
    return (
      <a
        href={href}
        onClick={(e) => {
          // La fila abre la ficha: este enlace no.
          e.preventDefault();
          e.stopPropagation();
          irAEnlace(href);
        }}
        className="inline-flex min-h-12 items-center font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
      >
        Hacer contrato
      </a>
    );
  }
  const { principal: p } = c;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={cn(CLASE_CHIP, claseEstadoContrato(c.estado))}>{etiquetaEstadoContrato(c.estado)}</span>
        {p.fechaVencimiento && <span className="whitespace-nowrap text-sm tabular-nums text-[var(--text-secondary)]">vence {formatearFecha(p.fechaVencimiento)}</span>}
      </span>
      <span className="text-sm text-[var(--text-tertiary)]">
        {TIPO_LABELS[p.tipo] ?? p.tipo} · {p.numero}
        {c.otros > 0 && ` · +${c.otros} más`}
      </span>
    </span>
  );
}

export default function TablaPersonal({ filas, onAbrir, contratos, puedeHacerContrato }: Props) {
  /* Autofiltros de Excel (23-10) sobre lo que ya dejaron los chips y el buscador de arriba. */
  const columnas = useMemo(() => columnasFiltroPersonal(contratos), [contratos]);
  const ft = useFiltrosTabla(filas, columnas);
  /* Título arriba y embudo abajo en todas: al lado, Documento/Celular/Ingreso lo bajaban solas (medido 23-10). */
  const cabeza = (label: string, id: string) => (
    <span className="inline-flex flex-col items-start gap-1 [&>span]:ml-0">
      {label}
      <FiltroEnCabecera id={id} f={ft} compacto />
    </span>
  );
  return (
    <>
    {/* Sin chips, en escritorio la barra no ocupa nada: el margen sólo cuando hay algo. */}
    <BarraFiltrosTabla f={ft} sinConteo className="max-sm:mb-2 has-[[role=list]]:mb-2" />
    <DataTable zebra>
      <thead className="[&_th]:align-top">
        <tr>
          <th>{cabeza("Nombre", "nombre")}</th>
          <th>{cabeza("Puesto", "puesto")}</th>
          <th>{cabeza("Estado", "estado")}</th>
          {contratos && <th>{cabeza("Contrato", "contrato")}</th>}
          <th>{cabeza("Documento", "documento")}</th>
          <th>{cabeza("Celular", "celular")}</th>
          <th>{cabeza("Ingreso", "ingreso")}</th>
        </tr>
      </thead>
      <tbody>
        {ft.filtradas.length === 0 && <SinCoincidenciasFila colSpan={contratos ? 7 : 6} />}
        {ft.filtradas.map((c) => {
          const meta = COLABORADOR_ESTADO_META[c.estado];
          return (
            <tr
              key={c.id}
              onClick={() => onAbrir(c.id)}
              /* El nombre ya es el enlace a la ficha (teclado y lector de
                 pantalla llegan por ahí): la fila sólo es atajo del mouse.
                 Una fila-botón con un enlace adentro = dos paradas de Tab
                 y un enlace que el lector no anuncia (nested-interactive). */
              {...(NOMBRE_ES_ENLACE ? {} : { ...filaClicableProps(() => onAbrir(c.id)), "aria-label": `Abrir la ficha de ${c.nombre}` })}
              className={cn("cursor-pointer", !NOMBRE_ES_ENLACE && CLASE_FOCUS_FILA)}
            >
              <td className="font-semibold">
                <EnlacePanel cosa="colaborador" id={c.id} apariencia="heredada">
                  {c.nombre}
                </EnlacePanel>
                {c.apodo && <span className="ml-1 font-normal text-[var(--text-tertiary)]">«{c.apodo}»</span>}
              </td>
              <td>{c.puesto?.nombre ?? <span className="text-[var(--text-tertiary)]">Sin puesto</span>}</td>
              <td><span className={cn(CLASE_CHIP, meta.claseChip)}>{meta.label}</span></td>
              {contratos && (
                <td>
                  {/* Un cesado sin contrato no necesita uno nuevo. */}
                  <CeldaContrato c={contratos.get(c.id)} id={c.id} puedeHacer={puedeHacerContrato && c.estado !== "CESADO"} />
                </td>
              )}
              <td className="whitespace-nowrap font-mono">{c.documento ? `${c.tipoDocumento ?? ""} ${c.documento}`.trim() : <span className="font-sans text-[var(--text-tertiary)]">—</span>}</td>
              <td>{c.celular ?? <span className="text-[var(--text-tertiary)]">—</span>}</td>
              <td>{c.fechaIngreso ? formatearFecha(c.fechaIngreso) : <span className="text-[var(--text-tertiary)]">No se sabe</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
    </>
  );
}
