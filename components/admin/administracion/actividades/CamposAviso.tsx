"use client";

/**
 * CamposAviso — a qué hora y por dónde avisa una actividad, quién la hace, su
 * color en el calendario, una nota y si está prendida.
 */
import { useId } from "react";
import { AREA_TEXTO, CAMPO_ALTO, claseChip } from "@/components/admin/planificacion/piezas/clases";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import { MAX_NOTA_AGENDA } from "@/lib/agenda/schemas";
import { CANALES_AGENDA, COLORES_AGENDA, ROLES_RESPONSABLE_AGENDA, type RolResponsableAgenda } from "@/lib/agenda/tipos";
import { NOMBRE_COLOR, PUNTO_COLOR } from "../comun/estado-ocurrencia";
import { CANAL_UI, ROL_UI } from "../comun/reglas";
import type { Borrador } from "./use-actividad-form";
import { Casilla } from "@/components/ui-system/Casilla";

type Cambiar = <K extends keyof Borrador>(campo: K, valor: Borrador[K]) => void;

export function CamposAviso({ b, cambiar }: { b: Borrador; cambiar: Cambiar }) {
  const id = useId();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hora del aviso (opcional)" hint="Vacío = a primera hora">
          <input type="time" className={CAMPO_ALTO} value={b.hora} onChange={(e) => cambiar("hora", e.target.value)} />
        </Field>
        <Field label="Quién la hace" hint="El cajero o almacenero sólo ve las suyas">
          <select
            className={CAMPO_ALTO}
            value={b.responsableRol ?? ""}
            onChange={(e) => cambiar("responsableRol", (e.target.value || null) as RolResponsableAgenda | null)}
          >
            <option value="">Cualquiera que administre</option>
            {ROLES_RESPONSABLE_AGENDA.map((r) => (
              <option key={r} value={r}>
                {ROL_UI[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        <span id={`${id}-canales`} className="block text-sm font-semibold text-[var(--text-secondary)]">
          Por dónde te avisa
        </span>
        <div role="group" aria-labelledby={`${id}-canales`} className="flex flex-wrap gap-2">
          {CANALES_AGENDA.map((c) => {
            const activo = b.canales.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={activo}
                title={CANAL_UI[c].hint}
                className={claseChip(activo)}
                onClick={() => cambiar("canales", activo ? b.canales.filter((x) => x !== c) : [...b.canales, c])}
              >
                {CANAL_UI[c].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <span id={`${id}-color`} className="block text-sm font-semibold text-[var(--text-secondary)]">
          Color en el calendario
        </span>
        <div role="radiogroup" aria-labelledby={`${id}-color`} className="flex flex-wrap gap-1">
          {COLORES_AGENDA.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={b.color === c}
              aria-label={NOMBRE_COLOR[c]}
              title={NOMBRE_COLOR[c]}
              onClick={() => cambiar("color", c)}
              className={cn(
                "inline-flex size-12 items-center justify-center rounded-full border-2 transition-colors",
                b.color === c ? "border-[var(--text-primary)]" : "border-transparent hover:border-[var(--rule-strong)]",
              )}
            >
              <span className={cn("size-6 rounded-full", PUNTO_COLOR[c])} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <Field label="Nota (opcional)" hint={`${b.nota.length}/${MAX_NOTA_AGENDA}`}>
        <textarea
          className={AREA_TEXTO}
          value={b.nota}
          maxLength={MAX_NOTA_AGENDA}
          placeholder="Ej.: la planilla está en el cajón de la oficina"
          onChange={(e) => cambiar("nota", e.target.value)}
        />
      </Field>

      <label className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--rule-base)] px-3 text-sm text-[var(--text-primary)]">
        <Casilla checked={b.activo} onChange={(e) => cambiar("activo", e.target.checked)} />
        <span className="font-semibold">Prendida</span>
        <span className="text-[var(--text-tertiary)]">{b.activo ? "Sale en Hoy, en el calendario y en los avisos" : "Apagada: no avisa ni sale en el calendario"}</span>
      </label>
    </div>
  );
}
