"use client";

/**
 * El semáforo del plan en una pastilla (Brandon 24-10, opción A «Semáforo
 * antimulta»): color + qué hacer («Al día», «Revisa», «Riesgo de multa») y,
 * al lado, «Ficha al X %» (opción B). El detalle —cada razón y lo que le falta
 * a la ficha con de dónde sale el requisito— va en el ⓘ, no en pantalla.
 *
 * La forma dice lo mismo que el color: en oscuro el ámbar del panel es coral
 * y casi no se distingue del rojo, así que cada nivel lleva su propio ícono
 * (escudo = riesgo de multa, triángulo = revisa, visto = al día).
 *
 * Lo cuentan `semaforoDelPlan` y `fichaDelPlan` (vía `semaforoDeLaPantalla`):
 * esto sólo lo dibuja.
 */

import { AlertTriangle, CheckCircle2, MinusCircle, ShieldAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { textoFicha, type FichaDelPlan } from "@/lib/forestal/loth-plan-ficha";
import type { ColorSemaforo, NivelRazon, SemaforoPlan } from "@/lib/forestal/loth-plan-semaforo";

const TONO: Record<ColorSemaforo, { caja: string; icono: typeof CheckCircle2 }> = {
  verde: {
    caja: "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/12",
    icono: CheckCircle2,
  },
  ambar: {
    caja: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/12",
    icono: AlertTriangle,
  },
  rojo: {
    caja: "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/12",
    icono: ShieldAlert,
  },
  neutro: {
    caja: "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    icono: MinusCircle,
  },
};

const ROTULO_NIVEL: Record<NivelRazon, string> = { rojo: "Urgente", ambar: "Revisa", info: "Para saber" };

export default function LothPlanSemaforo({ semaforo, ficha, className = "" }: {
  semaforo: SemaforoPlan;
  /** Sin ficha (plan cerrado, o todavía cargando) no se muestra el «al X %». */
  ficha?: FichaDelPlan | null;
  className?: string;
}) {
  const t = TONO[semaforo.color];
  const Icono = t.icono;
  const fichaTexto = ficha && semaforo.color !== "neutro" ? textoFicha(ficha) : null;
  const resumen = fichaTexto ? `${semaforo.titulo} · ${fichaTexto}` : semaforo.titulo;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`} data-semaforo-plan={semaforo.color}>
      <span
        title={resumen}
        className={`inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full border px-3 text-sm font-bold ${t.caja}`}
      >
        <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{semaforo.titulo}</span>
        {fichaTexto && (
          <span className="shrink-0 font-semibold text-[var(--text-secondary)]" data-ficha-pct={ficha?.pct}>
            · {fichaTexto}
          </span>
        )}
      </span>
      <InfoTip
        title={`Semáforo del plan: ${semaforo.titulo}`}
        ariaLabel={`Por qué el plan está en «${semaforo.titulo}»`}
        ancho="w-96"
        body={<DetalleSemaforo semaforo={semaforo} ficha={ficha ?? null} />}
      />
    </span>
  );
}

/**
 * La versión de una línea, para la tarjeta de la grilla de planes: la tarjeta
 * entera es un botón y un ⓘ adentro sería un botón dentro de otro. Dice la
 * peor razón; el resto, en el `title` y al abrir el plan.
 */
export function LothPlanSemaforoLinea({ semaforo, ficha }: { semaforo: SemaforoPlan; ficha?: FichaDelPlan | null }) {
  const t = TONO[semaforo.color];
  const Icono = t.icono;
  const fichaTexto = ficha && semaforo.color !== "neutro" ? textoFicha(ficha) : null;
  const primera = semaforo.razones.find((r) => r.nivel !== "info") ?? null;
  const todas = semaforo.razones.map((r) => `${ROTULO_NIVEL[r.nivel]}: ${r.texto}`).join("\n");
  return (
    <span
      data-semaforo-plan={semaforo.color}
      title={todas || semaforo.titulo}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${t.caja}`}
    >
      <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
      <strong className="shrink-0 font-bold">{semaforo.titulo}</strong>
      {fichaTexto && <span className="shrink-0 font-semibold text-[var(--text-secondary)]">· {fichaTexto}</span>}
      {primera && <span className="min-w-0 truncate text-[var(--text-secondary)]">· {primera.texto}</span>}
    </span>
  );
}

/** Lo que va dentro del ⓘ: sólo `<span>` (regla del panel). */
function DetalleSemaforo({ semaforo, ficha }: { semaforo: SemaforoPlan; ficha: FichaDelPlan | null }) {
  const faltan = ficha?.faltan ?? [];
  return (
    <span className="block space-y-2 text-sm">
      {semaforo.razones.length === 0 ? (
        <span className="block">Vigente, con saldo y sin plazos por vencer: nada que te exponga a una observación.</span>
      ) : (
        semaforo.razones.map((r, i) => (
          <span key={`${r.clave}-${i}`} className="block">
            <strong>{ROTULO_NIVEL[r.nivel]}:</strong> {r.texto}
          </span>
        ))
      )}
      {faltan.length > 0 && (
        <span className="block border-t border-[var(--rule-base)] pt-2">
          <strong className="block">Lo que le falta a la ficha ({ficha?.llenos} de {ficha?.total})</strong>
          {faltan.map((f) => (
            <span key={f.id} className="mt-1 block">
              <span className="font-semibold">{f.falta}.</span>{" "}
              <span className="text-[var(--text-tertiary)]">{f.fuente}</span>
            </span>
          ))}
        </span>
      )}
      <span className="block text-sm text-[var(--text-tertiary)]">
        Rojo = te pueden multar hoy · ámbar = revísalo antes de que pase · verde = al día. Junta la vigencia, el saldo
        por especie (guías y tala), la ficha y los papeles del permiso. El plazo de 15 días es del libro entero: tiene su
        propio aviso.
      </span>
    </span>
  );
}
