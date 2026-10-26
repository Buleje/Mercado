"use client";

/**
 * «Por bloque o zona» en «Registro y saldo» (Brandon 24-10): dónde está cada
 * especie del registro —el Bloque 1 con 30 árboles de Bolaina, el Bloque 2 con
 * 18— y si esa suma dice lo mismo que lo registrado. Es el DETALLE: el saldo
 * sigue por especie (ADR-459) y nada de acá lo mueve.
 *
 * Sin reparto, una línea con «Repartir por bloques»; con reparto, una tarjeta
 * por bloque y el aviso si no cuadra. El editor: `LothPlantacionBloquesEditar`.
 *
 * Con el saldo (25-10, `porBloque` del servidor), cada tarjeta trae su saldo,
 * sus guías y el aviso rojo si se pasa; lo del libro que no se sabe de qué
 * bloque salió va aparte («Sin bloque asignado»), nunca repartido a ojo.
 */

import { useState } from "react";
import { AlertTriangle, LayoutGrid, Pencil } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { cuadreConElRegistro, subtotalDelBloque, TOLERANCIA_M3, type BloqueDelPlan, type DescuadreDeEspecie } from "@/lib/forestal/loth-plan-bloques";
import type { SaldoPorBloques } from "@/lib/forestal/loth-plan-bloques-saldo";
import { Btn } from "./ctp-shared";
import { BloquePlan } from "./loth-plan-ui";
import type { Species } from "./loth-plan-shared";
import { usePlanBloques } from "./hooks/use-plan-bloques";
import { ID_BLOQUES } from "./hooks/use-ir-a-preliminares";
import LothPlantacionBloquesEditar from "./LothPlantacionBloquesEditar";
import LothPlanBloqueTarjeta from "./LothPlanBloqueTarjeta";
import LothPlanBloquesSinAsignar from "./LothPlanBloquesSinAsignar";

const m3 = (v: number) => `${formatNumber(v, 3)} m³`;

/**
 * «Bolaina: 19,500 m³ en los bloques y 20,000 m³ registrados». Sólo se dice lo
 * que no cuadra: si los m³ son iguales y difieren los árboles, va sólo lo de los
 * árboles («19,500 y 19,500» es ruido que esconde la diferencia).
 */
export function textoDescuadre(d: DescuadreDeEspecie): string {
  if (d.registrado == null) return `${d.especie} está en los bloques (${m3(d.enBloques)}) pero no en el registro`;
  if (d.enBloques === 0) return `${d.especie} está en el registro (${m3(d.registrado)}) pero en ningún bloque`;
  const partes: string[] = [];
  if (Math.abs(d.diferenciaM3) > TOLERANCIA_M3) partes.push(`${m3(d.enBloques)} en los bloques y ${m3(d.registrado)} registrados`);
  if (d.arbolesEnBloques != null && d.arbolesRegistrados != null && d.arbolesEnBloques !== d.arbolesRegistrados) {
    partes.push(`${formatNumber(d.arbolesEnBloques, 0)} árboles en los bloques y ${formatNumber(d.arbolesRegistrados, 0)} registrados`);
  }
  return `${d.especie}: ${partes.join(" · ")}`;
}

export function AvisoDescuadre({ descuadres }: { descuadres: readonly DescuadreDeEspecie[] }) {
  if (descuadres.length === 0) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <b>El reparto no cuadra con lo registrado.</b> {descuadres.map(textoDescuadre).join(" · ")}.
      </span>
    </div>
  );
}

/** Lo que el saldo trae para la sección (todo opcional: sin saldo, la tarjeta de siempre). */
export interface SaldoDeLosBloquesProps {
  porBloque?: SaldoPorBloques | null;
  /** «Corregir» en una tarjeta que se pasa: las preliminares a corregir. */
  onVerPreliminares?: (ids: string[]) => void;
  /** Se guardó el reparto: el saldo por bloque se relee. */
  onRepartoCambio?: () => void;
}

export default function LothPlantacionBloques({
  planId,
  species,
  soloConBloques = false,
  porBloque,
  onVerPreliminares,
  onRepartoCambio,
}: {
  planId: string;
  species: Species[];
  /** Bosque natural: sin reparto no se pinta nada (ni el «Repartir por bloques»). */
  soloConBloques?: boolean;
} & SaldoDeLosBloquesProps) {
  const { bloques, leido, error, guardar } = usePlanBloques(planId);
  const [editando, setEditando] = useState(false);
  const descuadres = cuadreConElRegistro(bloques, species);
  const guardarYReleer = async (xs: BloqueDelPlan[]) => {
    const r = await guardar(xs);
    if (r.ok) onRepartoCambio?.();
    return r;
  };
  const conSaldo = porBloque != null && porBloque.bloques.length > 0;
  const editor = editando && (
    <LothPlantacionBloquesEditar
      reparto={bloques}
      species={species}
      onGuardar={guardarYReleer}
      onClose={() => setEditando(false)}
    />
  );

  if (error) {
    return (
      <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {error}
      </p>
    );
  }
  /* Mientras no se leyó, nada: un aviso de «sin reparto» que después aparece lleno es un salto. */
  if (!leido) return null;

  if (bloques.length === 0) {
    if (species.length === 0 || soloConBloques) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-2">
        <LayoutGrid className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="text-sm text-[var(--text-secondary)]">Sin reparto por bloque o zona.</span>
        <InfoTip
          title="Por bloque o zona"
          what="Si tu registro viene por bloques, anota cuántos árboles, hectáreas y m³ de cada especie hay en cada bloque."
          affects="Es el detalle: el saldo sigue por especie y no cambia."
          example="Bolaina: Bloque 1 con 30 árboles y 12 m³, Bloque 2 con 18 árboles y 7,5 m³."
        />
        <Btn size="sm" onClick={() => setEditando(true)} className="ml-auto">
          <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Repartir por bloques
        </Btn>
        {editor}
      </div>
    );
  }

  return (
    <BloquePlan
      id="loth-plantacion-bloques"
      titulo="Por bloque o zona"
      sub={
        <>
          <span className="font-mono tabular-nums">{bloques.length}</span> {bloques.length === 1 ? "bloque" : "bloques"}
          {descuadres.length === 0 ? " · cuadra con lo registrado" : null}
        </>
      }
      acciones={
        <>
          <InfoTip
            title="Por bloque o zona"
            what="Dónde está cada especie del registro: sus árboles, hectáreas y m³ en cada bloque."
            affects="Es el detalle: el saldo de arriba sigue por especie. Si la suma de los bloques no dice lo mismo que el registro, sale un aviso."
            example="Bolaina 12 m³ en el Bloque 1 y 7,5 m³ en el Bloque 2 = 19,5 m³ registrados."
          />
          <Btn size="sm" onClick={() => setEditando(true)}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Cambiar el reparto
          </Btn>
        </>
      }
    >
      <div id={ID_BLOQUES} className="scroll-mt-4 space-y-3 p-3">
        <AvisoDescuadre descuadres={descuadres} />
        {conSaldo && (
          <p className="flex items-center gap-1 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            No te pases del volumen autorizado de cada bloque.
            <InfoTip
              title="Saldo por bloque"
              what="Autorizado del bloque − usado = saldo. «Usado» es lo registrado en el libro cuya GTF tiene su preliminar con este bloque; «Preliminar», lo pendiente de registrar."
              affects="Si lo usado más lo preliminar pasa lo autorizado de una especie del bloque, sale en rojo para corregir. El freno del despacho mide por especie del plan y no cambia."
              example="Bloque 2: tornillo 30 m³ autorizados, preliminar de 43,261 m³ → se pasa por 13,261 m³."
            />
          </p>
        )}
        <ul className={`grid gap-3 ${conSaldo ? "lg:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
          {conSaldo &&
            porBloque.bloques.map((s) => (
              <LothPlanBloqueTarjeta
                key={s.nombre}
                saldo={s}
                reparto={bloques.find((b) => b.nombre.trim() === s.nombre)}
                excesos={porBloque.excesos.filter((x) => x.bloque === s.nombre)}
                onVerPreliminares={onVerPreliminares}
              />
            ))}
          {!conSaldo && bloques.map((b) => {
            const s = subtotalDelBloque(b);
            return (
              <li key={b.nombre} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{b.nombre}</span>
                  <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                    {m3(s.m3)}
                    {s.ha != null && ` · ${formatNumber(s.ha, 2)} ha`}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {b.especies.map((e) => (
                    <li key={e.speciesCommon} className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-[var(--text-primary)]">{e.speciesCommon}</span>
                      <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                        {e.arboles != null && `${formatNumber(e.arboles, 0)} ${e.arboles === 1 ? "árbol" : "árboles"} · `}
                        {e.superficieHa != null && `${formatNumber(e.superficieHa, 2)} ha · `}
                        {m3(e.volumenM3)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        {conSaldo && <LothPlanBloquesSinAsignar sinBloque={porBloque.sinBloque} noCuadra={porBloque.noCuadra} />}
      </div>
      {editor}
    </BloquePlan>
  );
}
