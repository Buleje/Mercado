/**
 * PermisoSemaforo — el permiso, a simple vista: verde/amarillo/rojo con lo
 * que queda por producir (Brandon 2026-09-25, «Semáforo del permiso en el
 * chip»). Dos vistas del MISMO `SemaforoPermiso` (`lib/forestal/semaforo-permiso.ts`):
 *
 *  · `PermisoSemaforoBoton`: la barrita/punto que va DENTRO del botón del
 *    chip, junto al código. Cede espacio en el mismo lenguaje que el titular
 *    (memoria `contrato-activo-en-la-banda`): a menos de 1024 px o con la
 *    banda apretada (`@max-[40rem]/acciones`) sólo queda el punto de color —
 *    el texto sigue existiendo para el lector de pantalla (`sr-only`, no
 *    `hidden`: no desaparece, se deja de VER).
 *  · `PermisoSemaforoLinea`: la línea completa que va en el menú, arriba de
 *    «Ver volumen y trazabilidad».
 *
 * Ninguna de las dos depende sólo del color: el tramo siempre trae su
 * PALABRA (holgado/ajustado/por acabarse/excedido/sin ingreso), en el texto
 * visible, el `sr-only` y el `title` del botón — accesibilidad para quien no
 * distingue el rojo del verde.
 */

import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { SemaforoPermiso } from "@/lib/forestal/semaforo-permiso";

const NOMBRE_NIVEL: Record<SemaforoPermiso["nivel"], string> = {
  sinIngreso: "Sin ingreso",
  holgado: "Holgado",
  ajustado: "Ajustado",
  porAcabarse: "Por acabarse",
  excedido: "Excedido",
};

const COLOR_NIVEL: Record<SemaforoPermiso["nivel"], { punto: string; texto: string }> = {
  sinIngreso: { punto: "bg-[var(--text-tertiary)]", texto: "text-[var(--text-tertiary)]" },
  holgado: { punto: "bg-[var(--data-success-500)]", texto: "text-[var(--data-success-ink)]" },
  ajustado: { punto: "bg-[var(--data-warning-500)]", texto: "text-[var(--data-warning-ink)]" },
  porAcabarse: { punto: "bg-[var(--data-error-500)]", texto: "text-[var(--data-error-ink)]" },
  excedido: { punto: "bg-[var(--data-error-500)]", texto: "text-[var(--data-error-ink)]" },
};

/** Lo que dice el tramo, sin el nombre (eso lo agrega quien lo use). */
function fraseDerivacion(s: SemaforoPermiso): string {
  if (s.nivel === "sinIngreso") return "Sin guías de ingreso: no hay techo que medir.";
  if (s.nivel === "excedido") {
    return `se produjo ≈${fmtPt(s.excesoPt ?? 0)} pt aserr. de más que el techo de ≈${fmtPt(s.aserrablePt)} pt aserr. que da la madera ingresada (56 %).`;
  }
  return `queda ≈${fmtPt(s.saldoPt)} pt aserr. de ≈${fmtPt(s.aserrablePt)} pt aserr. que da la madera ingresada (techo del 56 %).`;
}

/** Una línea, con la palabra del tramo — para el `title` del chip. */
export function fraseSemaforoPermiso(s: SemaforoPermiso): string {
  if (s.nivel === "sinIngreso") return fraseDerivacion(s);
  return `${NOMBRE_NIVEL[s.nivel]}: ${fraseDerivacion(s)}`;
}

/** «queda 72 %» / «excedido» — lo que se ve cuando hay lugar en el botón. */
function etiquetaCorta(s: SemaforoPermiso): string {
  return s.nivel === "excedido" ? "excedido" : `queda ${s.quedaPct} %`;
}

export function PermisoSemaforoBoton({ semaforo }: { semaforo: SemaforoPermiso }) {
  // Sin ingreso no hay techo que medir: el botón no muestra barra ni punto
  // (el `title` del chip igual dice por qué — lo arma `fraseSemaforoPermiso`).
  if (semaforo.nivel === "sinIngreso") return null;
  const color = COLOR_NIVEL[semaforo.nivel];
  const ancho = Math.max(0, Math.min(100, semaforo.quedaPct ?? 0));
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
      {/* Completo: la barrita, con el ancho de lo que queda. */}
      <span
        aria-hidden="true"
        className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--surface-sunken)] max-lg:hidden @max-[40rem]/acciones:hidden"
      >
        <span className={`block h-full rounded-full ${color.punto}`} style={{ width: `${ancho}%` }} />
      </span>
      {/* Compacto: sólo el punto de color — el rótulo sigue de largo, sólo se deja de ver. */}
      <span
        aria-hidden="true"
        className={`hidden h-2 w-2 shrink-0 rounded-full max-lg:inline-block @max-[40rem]/acciones:inline-block ${color.punto}`}
      />
      <span
        className={`whitespace-nowrap text-[length:var(--ts-2xs)] font-bold tabular-nums max-lg:sr-only @max-[40rem]/acciones:sr-only ${color.texto}`}
      >
        {etiquetaCorta(semaforo)}
      </span>
    </span>
  );
}

export function PermisoSemaforoLinea({ semaforo }: { semaforo: SemaforoPermiso }) {
  const color = COLOR_NIVEL[semaforo.nivel];
  return (
    <p className="mb-1.5 flex items-start gap-2 px-2.5 text-xs text-[var(--text-secondary)]">
      <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color.punto}`} />
      <span>
        <span className={`font-bold ${color.texto}`}>{NOMBRE_NIVEL[semaforo.nivel]}</span>
        {": "}
        {fraseDerivacion(semaforo)}
      </span>
    </p>
  );
}
