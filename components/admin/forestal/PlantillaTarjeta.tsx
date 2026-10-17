"use client";

/**
 * Una plantilla en la lista de «Usar una plantilla»: nombre, permiso, destino,
 * qué bloques trae y cuándo se usó. El clic la elige (vista previa); el «⋯»
 * la gestiona: renombrar, duplicar, actualizar con la guía de ahora, borrar.
 */

import { Copy, Pencil, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { ROTULO_BLOQUE, resumenPlantilla, type EstadoPermiso, type PlantillaGuia } from "@/lib/forestal/gtf-plantillas";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { limaDateKey } from "@/lib/utils";
import type { PlantillasGuia } from "./hooks/use-plantillas-guia";

const AVISO: Partial<Record<EstadoPermiso["tipo"], string>> = {
  vencido: "Permiso vencido",
  no_existe: "Permiso borrado",
  sin_trozas: "Sin trozas",
  cambia: "Otro permiso",
};

function cuandoSeUso(p: PlantillaGuia): string {
  if (!p.usadaEn) return "Sin usar todavía";
  const dia = limaDateKey(p.usadaEn);
  return `Usada el ${dia ? etiquetaLarga(dia) : "—"} · ${p.usos} ${p.usos === 1 ? "vez" : "veces"}`;
}

export default function PlantillaTarjeta({
  p,
  pl,
  estado,
  onElegir,
  onError,
}: {
  p: PlantillaGuia;
  pl: PlantillasGuia;
  estado: EstadoPermiso;
  onElegir: () => void;
  onError: (msg: string | null) => void;
}) {
  const { confirm, prompt } = useConfirm();
  const r = resumenPlantilla(p);
  const aviso = AVISO[estado.tipo];

  const intentar = async (paso: () => Promise<unknown>) => {
    onError(null);
    try {
      await paso();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const acciones: MenuAccion[] = [
    {
      id: "renombrar",
      label: "Cambiar el nombre",
      icon: Pencil,
      onSelect: () =>
        void intentar(async () => {
          const nombre = await prompt({ title: "Cambiar el nombre", label: "Nombre", defaultValue: p.nombre, required: true, confirmLabel: "Guardar", intent: "info" });
          if (nombre?.trim() && nombre.trim() !== p.nombre) await pl.renombrar(p, nombre.trim());
        }),
    },
    { id: "duplicar", label: "Duplicar", hint: "Una copia para cambiarle algo", icon: Copy, onSelect: () => void intentar(() => pl.duplicar(p)) },
    {
      id: "actualizar",
      label: "Actualizar con lo de ahora",
      hint: "Sus mismos bloques, con lo que dice esta guía",
      icon: RefreshCw,
      onSelect: () =>
        void intentar(async () => {
          const ok = await confirm({
            title: `¿Actualizar «${p.nombre}»?`,
            description: `Se guardan de nuevo ${r.bloques.map((b) => ROTULO_BLOQUE[b].toLowerCase()).join(", ")} con lo que tiene escrito esta guía.`,
            intent: "warning",
            confirmLabel: "Actualizar",
          });
          if (ok) await pl.actualizarConAhora(p);
        }),
    },
    {
      id: "borrar",
      label: "Borrar",
      icon: Trash2,
      tone: "danger",
      onSelect: () =>
        void intentar(async () => {
          const ok = await confirm({
            title: `¿Borrar «${p.nombre}»?`,
            description: "No se puede deshacer. Las guías que ya hiciste con ella no cambian.",
            intent: "danger",
            confirmLabel: "Sí, borrar",
          });
          if (ok) await pl.borrar(p);
        }),
    },
  ];

  return (
    <li data-qa="plantilla-tarjeta" className="flex items-stretch gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]">
      <button type="button" onClick={onElegir} className="grid min-w-0 flex-1 gap-1 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-words text-sm font-bold text-[var(--text-primary)]">{p.nombre}</span>
          {aviso && (
            <span
              className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${
                estado.tipo === "cambia"
                  ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                  : "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/12"
              }`}
            >
              {aviso}
            </span>
          )}
        </span>
        {(r.permiso || r.destino) && (
          <span className="break-words text-xs text-[var(--text-secondary)]">
            {[r.permiso, r.destino].filter(Boolean).join(" → ")}
          </span>
        )}
        <span className="text-xs text-[var(--text-tertiary)]">
          {r.bloques.map((b) => ROTULO_BLOQUE[b]).join(" · ")}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">{cuandoSeUso(p)}</span>
      </button>
      <div className="flex shrink-0 items-start p-1">
        <ActionMenu label={`Opciones de «${p.nombre}»`} actions={acciones} soloIcono size="md" className="w-12!" />
      </div>
    </li>
  );
}
