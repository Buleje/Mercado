"use client";

/**
 * Cómo se ve un campo esencial del alta del plan y el contador del pie.
 *
 * · Obligatorio (sólo el titular: es lo único que el servidor exige) → borde
 *   de acento y la pastilla «Obligatorio».
 * · Recomendado (lo que el plan necesita para funcionar bien, pero se puede
 *   guardar sin eso) → pastilla de contorno «Recomendado».
 *
 * Nada se marca en rojo antes de tocar «Crear»: recién con el intento, el
 * obligatorio vacío se pinta de error y el recomendado vacío, de advertencia.
 * Reglas por tipo: `lib/forestal/loth-plan-esenciales.ts`.
 */

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "@buleje/design-system/icons";
import { idEsencial, textoContador, type Esencial, type ResumenEsenciales } from "@/lib/forestal/loth-plan-esenciales";
import { cls } from "./loth-plan-ui";

const BORDE_BASE = "border-[var(--rule-base)]";

/** La clase del control: la misma `cls` de siempre, con el borde que le toca. */
export function clsEsencial(e: Esencial | undefined, marcar: boolean, extra = ""): string {
  if (!e) return `${cls} ${extra}`;
  let borde = BORDE_BASE;
  if (marcar && !e.lleno) {
    borde = e.nivel === "obligatorio"
      ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10"
      : "border-[var(--data-warning-500)]";
  } else if (e.nivel === "obligatorio") {
    borde = "border-[var(--accent)]";
  }
  return `${cls.replace(BORDE_BASE, borde)} ${extra}`;
}

function Pastilla({ nivel }: { nivel: Esencial["nivel"] }) {
  return nivel === "obligatorio" ? (
    <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-px text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent-dark)] dark:text-[var(--accent)]">
      Obligatorio
    </span>
  ) : (
    <span className="rounded-full border border-[var(--rule-base)] px-1.5 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
      Recomendado
    </span>
  );
}

/**
 * Un campo del formulario que puede ser esencial. Sin `esencial`, es el mismo
 * campo de siempre. El control hijo lleva `id={idEsencial(campo)}`.
 */
export function CampoPlan({
  label,
  campo,
  esencial,
  marcar,
  children,
}: {
  label: string;
  campo: Esencial["campo"];
  esencial?: Esencial;
  /** ¿Ya se intentó crear? Recién ahí se marca lo vacío. */
  marcar: boolean;
  children: ReactNode;
}) {
  const id = idEsencial(campo);
  const falta = Boolean(esencial && marcar && !esencial.lleno);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </label>
        {esencial && <Pastilla nivel={esencial.nivel} />}
      </div>
      {children}
      {falta && esencial && (
        <span
          id={`${id}-falta`}
          className={`mt-1 block text-xs font-semibold ${
            esencial.nivel === "obligatorio"
              ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          }`}
        >
          {esencial.nivel === "obligatorio" ? "Falta: " : "Recomendado: "}
          {esencial.motivo}
        </span>
      )}
    </div>
  );
}

/** Lleva el foco al control de un esencial (y lo centra en el modal). */
export function irAlEsencial(e: Esencial | null) {
  if (!e || typeof document === "undefined") return;
  const el = document.getElementById(idEsencial(e.campo));
  if (!el) return;
  /* Las especies son un bloque: el foco va a su primer campo. */
  const foco = el.matches("input, select, textarea, button") ? el : el.querySelector<HTMLElement>("input, select, textarea, button");
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  (foco ?? el).focus?.({ preventScroll: true });
}

/** «Te faltan 2 de 4 esenciales»: junto al botón Crear, y lleva al primero que falta. */
export function ContadorEsenciales({ resumen, intento }: { resumen: ResumenEsenciales; intento: boolean }) {
  if (resumen.total === 0) return null;
  const completo = resumen.faltan === 0;
  const tono = completo
    ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
    : intento && resumen.faltanObligatorios > 0
      ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
  const Icono = completo ? CheckCircle2 : AlertCircle;
  const contenido = (
    <>
      <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{textoContador(resumen)}</span>
      {resumen.faltanObligatorios > 0 && (
        <span className="font-normal text-[var(--text-tertiary)]">
          ({resumen.faltanObligatorios === 1 ? "1 obligatorio" : `${resumen.faltanObligatorios} obligatorios`})
        </span>
      )}
    </>
  );
  if (completo) {
    return (
      <span role="status" className={`mr-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold ${tono}`}>
        {contenido}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => irAlEsencial(resumen.primero)}
      title={resumen.primero ? `Ir a «${resumen.primero.rotulo}»` : undefined}
      aria-live="polite"
      className={`mr-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-left text-sm font-semibold underline-offset-2 transition-colors hover:bg-[var(--surface-sunken)] hover:underline ${tono}`}
    >
      {contenido}
    </button>
  );
}
