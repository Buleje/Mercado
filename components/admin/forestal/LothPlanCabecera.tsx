"use client";

/**
 * La cabecera del Plan de manejo: qué plan se está mirando, sus datos de
 * carátula en una línea y los indicadores.
 *
 * COMPACTA (Brandon 17-10: «compactar el Libro TH… los botones al lado de las
 * pestañas, indicadores chicos»). Dentro del libro:
 *
 *   · el permiso lo elige el CHIP de la banda (`useLothPermiso`): el selector
 *     propio repetía esa elección una fila más abajo. Con «Todos los permisos»
 *     la vista muestra la grilla «Varios» (la decide `LothPlanView`);
 *   · el título, el ⓘ, «Indicadores» y «Opciones» van al riel de las pestañas
 *     (`VistaHeader` + `useKpisPlegables`): la vista no gasta una fila en
 *     decir cómo se llama;
 *   · la carátula, una línea con «Ver ficha» (`LothPlanIdentidadLinea`);
 *   · los indicadores, plegables y recordados como en el resto del libro.
 *
 * Fuera del libro (sin chip) queda el selector de siempre, con «Varios».
 *
 * Una PLANTACIÓN (ADR-459) mide otra cosa: no hay censo ni volumen autorizado
 * que cruzar, hay m³ REGISTRADOS y por dónde van. Sus cifras —registrado ·
 * talado · en pie · despachado— salen de la misma cascada que la tabla de la
 * pestaña «Registro y saldo», y la carátula la pone esa pestaña (con «Editar»),
 * no esta cabecera: dos fichas del mismo registro a dos alturas sobran.
 */

import type { ReactNode } from "react";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { VistaHeader } from "@/components/admin/shared/module-primitives";
import { formatNumber } from "@/lib/format";
import type { Aprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import { permisoConSigla } from "@/lib/forestal/loth-tipos-plan";
import { agruparPlanesPorTitular } from "@/lib/forestal/loth-planes-por-titular";
import { type Plan } from "./loth-plan-shared";
import { useKpisPlegables } from "./kpis-plegables";
import LothAprovechamientoBanda from "./LothAprovechamientoBanda";
import { LothPlanIdentidadLinea } from "./LothPlanIdentidad";
import { CifraLinea } from "./loth-plan-ui";
import { resumenPlan, useTarjetasPlan, type KpisPlan } from "./LothPlanIndicadores";

export type { KpisPlan };

/** Las cifras de una plantación: lo registrado y por dónde va (m³, de `cascadaDelPlan`). */
export interface KpisPlantacion {
  registrado: number;
  talado: number;
  /** registrado − talado; negativo = se taló de más. */
  enPie: number;
  despachado: number;
  enPatio: number;
  especies: number;
  pctTalado: number | null;
  excedido: boolean;
  /** m³ que el libro taló de especies que NO están en el registro: no descuentan de nada (ADR-459). */
  taladoSinRegistrar?: number;
}

/** El valor de «Varios» en el selector: no es un id de plan. */
const OPCION_VARIOS = "__varios__";

const AYUDA =
  "El permiso aprobado: lo autorizado por especie, el censo y el avance de la tala. El permiso se elige en el chip de arriba; con «Todos los permisos» ves la grilla de todos los planes.";

export default function LothPlanCabecera({ plans, planId, onPlan, varios = false, onVarios, plan, kpis, kpisPlantacion, aprovechamiento, opciones }: {
  plans: Plan[];
  planId: string | null;
  onPlan: (id: string | null) => void;
  /** «Varios»: la grilla de todos los planes en vez de uno (la dibuja la vista). */
  varios?: boolean;
  /** Sólo fuera del libro: dentro, «Varios» es el chip en «Todos». */
  onVarios?: (v: boolean) => void;
  plan: Plan | null;
  kpis: KpisPlan | null;
  /** Con esto, la cabecera es la de una plantación: estas cuatro cifras y sin carátula. */
  kpisPlantacion?: KpisPlantacion | null;
  /** La banda «Aprovechamiento» (`analizarAprovechamiento`): barra, ritmo, exceso y especies. */
  aprovechamiento?: Aprovechamiento | null;
  opciones: MenuAccion[];
}) {
  const enLibro = useEnElLibro();
  const a = aprovechamiento ?? null;
  const bosque = !varios && !kpisPlantacion ? kpis : null;
  const tarjetasBosque = useTarjetasPlan(bosque, plan, a != null);
  const tarjetas: ReactNode[] = varios ? [] : kpisPlantacion ? tarjetasPlantacion(kpisPlantacion, a) : tarjetasBosque;
  const indicadores = useKpisPlegables({
    claveMemoria: "loth-plan",
    tarjetas,
    resumen: varios ? undefined : kpisPlantacion ? resumenPlantacion(kpisPlantacion) : bosque ? resumenPlan(bosque) : undefined,
    encabezado: bosque && a ? <LothAprovechamientoBanda a={a} especies={bosque.especies} /> : undefined,
    compactoEnMovil: true,
  });

  return (
    <section aria-label="Plan de manejo" className="space-y-3">
      <VistaHeader titulo="Plan de manejo" meta={varios ? `${plans.length} planes` : undefined} hint={AYUDA}>
        {!enLibro && <SelectorFueraDelLibro plans={plans} planId={planId} onPlan={onPlan} varios={varios} onVarios={onVarios} />}
        {indicadores.boton}
        <ActionMenu
          label="Opciones"
          title="Informe de ejecución, anexo del POA, importar censo y nuevo plan"
          actions={opciones}
          size="md"
          compactoEnMovil
          soloIcono={enLibro}
          className={enLibro ? "w-12!" : ""}
        />
      </VistaHeader>

      {/* Los mismos datos, en una línea; «Ver ficha» abre los tres grupos. */}
      {!varios && plan && !kpisPlantacion && <LothPlanIdentidadLinea plan={plan} />}

      {indicadores.panel}
    </section>
  );
}

/**
 * Fuera del libro no hay chip de permiso: el selector de siempre, agrupado por
 * titular y con «Varios». Dentro del libro no se pinta (el chip manda).
 */
function SelectorFueraDelLibro({ plans, planId, onPlan, varios, onVarios }: {
  plans: Plan[];
  planId: string | null;
  onPlan: (id: string | null) => void;
  varios: boolean;
  onVarios?: (v: boolean) => void;
}) {
  return (
    <select
      value={varios ? OPCION_VARIOS : planId ?? ""}
      onChange={(e) => {
        if (e.target.value === OPCION_VARIOS) return onVarios?.(true);
        onVarios?.(false);
        onPlan(e.target.value || null);
      }}
      aria-label="Elegir plan de manejo"
      className="h-12 min-w-0 max-w-full truncate rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 sm:max-w-[26rem]"
    >
      {plans.length === 0 && <option value="">Sin planes</option>}
      {/* Brandon 15-10: «escoger Varios y aparecen recuadros… de todos». */}
      {onVarios && plans.length > 1 && <option value={OPCION_VARIOS}>Varios — ver los {plans.length} planes</option>}
      {/* Agrupados por titular: los permisos de una misma comunidad nativa,
          juntos. El titular va en el rótulo del grupo Y en la opción,
          porque el select cerrado sólo muestra el texto de la opción. */}
      {agruparPlanesPorTitular(plans).map((g) => (
        <optgroup key={g.clave} label={g.planes.length > 1 ? `${g.titular} · ${g.planes.length} planes` : g.titular}>
          {g.planes.map((p) => (
            <option key={p.id} value={p.id}>
              {/* «Plantación 19-SEC/…» y no «PLANTACION 19-SEC/…»: la sigla como la dice la norma. */}
              {permisoConSigla(p.planType, p.planNumber)} — {p.titularName}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

const m3 = (v: number) => `${formatNumber(v, 3)} m³`;

/** El titular del botón cerrado de una plantación. */
function resumenPlantacion(k: KpisPlantacion): string {
  const pct = k.pctTalado == null ? "" : ` (${formatNumber(k.pctTalado, 1)}%)`;
  return `${formatNumber(k.talado, 1)} de ${formatNumber(k.registrado, 1)} m³ talados${pct} · ${formatNumber(k.enPie, 1)} m³ en pie`;
}

/**
 * Las cifras de una plantación. Con el análisis, UNA tarjeta: la banda
 * «Aprovechamiento» (registrado, talado, en pie, despachado y patio con su
 * barra, ritmo y especies). Sin él, las cuatro casillas sueltas.
 * En pie negativo = se taló más de lo registrado: va en rojo y lo dice.
 */
function tarjetasPlantacion(k: KpisPlantacion, a: Aprovechamiento | null): ReactNode[] {
  if (a) return [<LothAprovechamientoBanda key="banda" a={a} especies={k.especies} />];
  const especies = `${k.especies} ${k.especies === 1 ? "especie" : "especies"}${k.registrado > 0 ? ` · ≈ ${formatNumber(ptAserrableDeRolliza(k.registrado), 0)} pt` : ""}`;
  const sinReg = k.taladoSinRegistrar ?? 0;
  const pct = sinReg > 0.0001
    ? `+${formatNumber(sinReg, 3)} m³ de especies sin registrar`
    : k.pctTalado == null ? "sin m³ registrados" : `${formatNumber(k.pctTalado, 1)}% de lo registrado`;
  /* ≈pt aserrable (56 %): referencia de cuánto saldría de la sierra; el libro declara m³. */
  const pt = (v: number) => `≈ ${formatNumber(ptAserrableDeRolliza(v), 0)} pt`;
  const pie = k.enPie < 0 ? `se taló ${formatNumber(-k.enPie, 3)} m³ de más` : k.registrado > 0 ? `${pt(k.enPie)} por talar` : "sin m³ registrados";
  const patio = `${formatNumber(k.enPatio, 3)} m³ en patio`;
  return [
    <Casilla key="registrado" etiqueta="Registrado" valor={m3(k.registrado)} nota={especies} tono={k.especies === 0 ? "warn" : undefined} />,
    <Casilla key="talado" etiqueta="Talado" valor={m3(k.talado)} nota={pct} tono={k.excedido ? "danger" : sinReg > 0.0001 ? "warn" : undefined} />,
    <Casilla key="pie" etiqueta="En pie" valor={m3(k.enPie)} nota={pie} tono={k.enPie < 0 ? "danger" : undefined} />,
    <Casilla key="despachado" etiqueta="Despachado" valor={m3(k.despachado)} nota={patio} />,
  ];
}

/** Una cifra con su etiqueta: lo mínimo para que se pueda encontrar. */
function Casilla({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: "ok" | "warn" | "danger" }) {
  const borde =
    tono === "danger" ? "border-[var(--data-error-500)]/50"
      : tono === "warn" ? "border-[var(--data-warning-500)]/50"
        : "border-[var(--rule-base)]";
  return (
    <div className={`min-w-0 rounded-xl border bg-[var(--surface-raised)] px-3 py-2 ${borde}`}>
      <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {etiqueta}
      </span>
      <CifraLinea valor={valor} tono={tono} />
      {nota && <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]" title={nota}>{nota}</span>}
    </div>
  );
}
