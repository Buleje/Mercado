"use client";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";

/**
 * Lo que la ficha de una zona del croquis sabe por su COMPONENTE de la
 * leyenda (03-10): qué es («Maquinaria · N° 15 del plano»), sus notas y lo
 * que se puede hacer con eso — una máquina lleva a Activos, una cámara al
 * módulo Cámaras (a la de nombre parecido, si hay una). Sin datos inventados:
 * sin vínculo, solo el enlace al módulo.
 */

import { ExternalLink } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { categoriaMeta, formatoComponente, guardaMadera } from "@/lib/forestal/croquis-componentes";
import type { PlantaZona } from "@/lib/forestal/planta-zona-types";
import { ICONO_CATEGORIA, MuestraFormato } from "./CtpPlantaCroquisLeyendaCategorias";
import { useCroquisCamara } from "./hooks/use-croquis-camara";

const ENLACE = "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] hover:no-underline";

function EnlaceCamara({ nombre }: { nombre: string }) {
  const { cargando, camara, total } = useCroquisCamara(nombre);
  const href = camara ? `/admin?tab=camaras&camara=${encodeURIComponent(camara.id)}` : "/admin?tab=camaras";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EnlacePanel apariencia="heredada" href={href} className={ENLACE} data-enlace-camara={camara?.id ?? ""}>
        <ExternalLink className="h-4 w-4" />
        {camara ? `Ver la cámara «${camara.nombre}»` : "Ver la cámara"}
      </EnlacePanel>
      {!cargando && !camara && (
        <InfoTip
          title="Cámara del plano"
          what={total ? "Ninguna cámara del módulo tiene un nombre parecido a esta zona: el enlace abre la lista de Cámaras." : "El módulo Cámaras todavía no tiene cámaras cargadas (o tu usuario no las ve)."}
          affects="Ponle a la cámara un nombre o lugar con las mismas palabras del plano (ej. «Cámara 2 almacén») y el enlace irá directo a ella."
        />
      )}
    </div>
  );
}

export default function CtpPlantaCroquisFichaComponente({ zona }: { zona: PlantaZona }) {
  const comp = zona.componente;
  if (!comp) return null;
  const meta = categoriaMeta(comp.categoria);
  const Icono = ICONO_CATEGORIA[comp.categoria];
  const sinMadera = !guardaMadera(zona);

  return (
    <div className="space-y-2" data-ficha-componente={comp.categoria}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <MuestraFormato formato={formatoComponente(comp)} />
        <Icono className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
        <strong className="text-[var(--text-primary)]">{meta.label}</strong>
        {comp.numero != null && <span className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[var(--text-secondary)]">N° {comp.numero} del plano</span>}
        {comp.nombre && comp.nombre !== zona.nombre && <span className="text-[var(--text-secondary)]">{comp.nombre}</span>}
      </p>
      {comp.categoria !== "madera" && zona.notas && <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">{zona.notas}</p>}
      {comp.categoria === "maquinaria" && (
        <EnlacePanel apariencia="heredada" href="/admin?tab=activos" className={ENLACE}><ExternalLink className="h-4 w-4" />Ver en Activos y maquinaria</EnlacePanel>
      )}
      {comp.categoria === "seguridad" && <EnlaceCamara nombre={comp.nombre || zona.nombre || zona.codigo} />}
      {sinMadera && (
        <p className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          Aquí no se ubica madera
          <InfoTip title="Zona sin madera" what={`Es ${meta.label.toLowerCase()} en la leyenda del plano: no aparece como destino al ubicar una pila o una troza.`} affects="Si de verdad apilas madera ahí, cambia qué es (o su tipo) en «Editar zona»." />
        </p>
      )}
    </div>
  );
}
