"use client";

/**
 * Una tarjeta de «Por bloque o zona» con su saldo (Brandon 25-10 → 26-10 «que
 * cada cosa se diferencie»): cada bloque con su tono y su insignia, el estado en
 * una palabra (Se pasa · Preliminar pendiente · Cuadra · Sin uso), lo autorizado,
 * las hectáreas y lo disponible en cifra grande, la barra del bloque entero y,
 * por especie, su barra apilada; el aviso rojo si se pasa, y sus guías.
 *
 * Todo viene calculado del servidor (`porBloque` del saldo): acá sólo se pinta.
 */

import { useState } from "react";
import { BadgeStatus } from "@buleje/design-system";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Clock, MinusCircle } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { subtotalDelBloque, type BloqueDelPlan } from "@/lib/forestal/loth-plan-bloques";
import { textoDeExceso, type EspecieEnElBloque, type ExcesoDeBloque, type SaldoDelBloque } from "@/lib/forestal/loth-plan-bloques-saldo";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { Btn } from "./ctp-shared";
import LothPlanBloqueGuias from "./LothPlanBloqueGuias";
import LothPlanBloqueEspecieFila from "./LothPlanBloqueEspecieFila";
import { BarraDeTramos, CifraGrande, CifrasEnLinea, InsigniaDelBloque, varDeTono } from "./LothPlanBloqueBarra";
import { ESTADO_DEL_BLOQUE, estadoDelBloque, idDeBloque, insigniaDelBloque, tramosDelBloque, type EstadoDelBloque } from "./loth-plan-bloque-visual";

const NUM = "font-mono tabular-nums";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

/* El texto del badge en su tono «-ink» (el del DS, `--data-warning` sobre su 12 %, da 1,9:1 en claro). */
const TINTA_DEL_ESTADO: Record<EstadoDelBloque, string> = {
  se_pasa: "text-[var(--data-error-ink)]",
  preliminar: "text-[var(--data-warning-ink)]",
  cuadra: "text-[var(--data-success-ink)]",
  sin_uso: "",
};

const ICONO_DEL_ESTADO: Record<EstadoDelBloque, typeof AlertTriangle> = {
  se_pasa: AlertTriangle,
  preliminar: Clock,
  cuadra: CheckCircle2,
  sin_uso: MinusCircle,
};

type Cifras = Pick<EspecieEnElBloque, "autorizadoM3" | "usadoM3" | "pendienteM3" | "quedaM3" | "quedaSiSeRegistranM3"> & {
  excede?: boolean;
  excedeHoy?: boolean;
};

/** Autorizado · Usado · Preliminar · Saldo · Si se registran (y «Esta guía» en la ventana). `ultima` cambia el rótulo de la última cifra. Lo usa la ventana de la preliminar. */
export function CifrasDelBloque({ c, estaGuiaM3, columnas = "grid-cols-3 sm:grid-cols-5", ultima = "Si se registran" }: { c: Cifras; estaGuiaM3?: number; columnas?: string; ultima?: string }) {
  const items: { k: string; t: string; v: number; rojo?: boolean; fuerte?: boolean }[] = [
    { k: "aut", t: "Autorizado", v: c.autorizadoM3 },
    { k: "usado", t: "Usado", v: c.usadoM3 },
    { k: "pend", t: estaGuiaM3 == null ? "Preliminar" : "Otras prelim.", v: c.pendienteM3 - (estaGuiaM3 ?? 0) },
    ...(estaGuiaM3 == null ? [] : [{ k: "esta", t: "Esta guía", v: estaGuiaM3, fuerte: true }]),
    { k: "queda", t: "Saldo", v: c.quedaM3, rojo: c.excedeHoy },
    { k: "si", t: ultima, v: c.quedaSiSeRegistranM3, rojo: c.excede, fuerte: true },
  ];
  return (
    <dl className={`grid gap-x-3 gap-y-1 ${columnas}`}>
      {items.map((i) => (
        <div key={i.k} className="flex min-w-0 flex-col justify-between">
          {/* Sin truncar: «Si se registran» baja a dos líneas y la cifra queda alineada abajo. */}
          <dt className="text-xs leading-tight text-[var(--text-tertiary)]">{i.t}</dt>
          <dd className={`${NUM} text-sm ${i.fuerte ? "font-bold" : "font-medium"} ${i.rojo ? ROJO : "text-[var(--text-primary)]"}`}>{fmtM3(i.v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** «30 árboles · 1,20 ha» del reparto, si se anotaron. */
function metaDelReparto(reparto: BloqueDelPlan | undefined, clave: string): string | null {
  const e = reparto?.especies.find((x) => claveEspecie(x.speciesCommon) === clave);
  if (!e) return null;
  const partes = [
    e.arboles != null ? `${formatNumber(e.arboles, 0)} ${e.arboles === 1 ? "árbol" : "árboles"}` : null,
    e.superficieHa != null ? `${formatNumber(e.superficieHa, 2)} ha` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

export default function LothPlanBloqueTarjeta({
  saldo,
  reparto,
  excesos,
  tono,
  onVerPreliminares,
}: {
  saldo: SaldoDelBloque;
  /** El reparto de ese bloque (árboles y hectáreas). */
  reparto?: BloqueDelPlan;
  excesos: readonly ExcesoDeBloque[];
  /** El tono del bloque (`tonoDelBloque(i)`): franja, insignia y tramo «usado». */
  tono: string;
  /** «Corregir»: lleva a las preliminares que lo hacen pasar. */
  onVerPreliminares?: (ids: string[]) => void;
}) {
  const [verGuias, setVerGuias] = useState(false);
  const t = saldo.total;
  const ids = [...new Set(excesos.flatMap((x) => x.preliminarIds))];
  const especies = saldo.especies.filter((e) => e.enElReparto || e.usadoM3 > 0 || e.pendienteM3 > 0);
  /* Lo que se pasa una especie no lo tapa lo libre de otra: «Disponible» suma sin negativos y lo pasado va aparte, en rojo. */
  const pasadas = saldo.especies.filter((e) => e.excede).map((e) => e.especie);
  const estado = estadoDelBloque(saldo);
  const sub = reparto ? subtotalDelBloque(reparto) : null;
  const meta = [
    `${especies.length} ${especies.length === 1 ? "especie" : "especies"}`,
    sub?.arboles != null ? `${formatNumber(sub.arboles, 0)} ${sub.arboles === 1 ? "árbol" : "árboles"}` : null,
  ].filter(Boolean);
  return (
    <li
      id={idDeBloque(saldo.nombre)}
      data-testid="bloque-saldo"
      data-bloque={saldo.nombre}
      data-excede={saldo.excede ? "si" : "no"}
      data-estado={estado}
      style={varDeTono(tono)}
      className={`relative scroll-mt-4 overflow-hidden rounded-xl border bg-[var(--surface-canvas)] ${
        saldo.excede ? "border-[var(--data-error-500)] ring-1 ring-[var(--data-error-500)]" : "border-[var(--rule-base)]"
      }`}
    >
      {/* La franja del tono: el bloque se reconoce antes de leer el nombre. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: "var(--bloque)" }} />
      <div className="space-y-3 py-3 pl-5 pr-3">
        <div className="flex items-start gap-3">
          <InsigniaDelBloque texto={insigniaDelBloque(saldo.nombre)} tono={tono} grande />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight text-[var(--text-primary)]">{saldo.nombre}</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{meta.join(" · ")}</p>
          </div>
          <BadgeStatus variant={ESTADO_DEL_BLOQUE[estado].variante} label={ESTADO_DEL_BLOQUE[estado].texto} icon={ICONO_DEL_ESTADO[estado]} className={`shrink-0 ${TINTA_DEL_ESTADO[estado]}`} />
        </div>
        <dl className={`grid gap-2 ${sub?.ha != null ? "grid-cols-3" : "grid-cols-2"}`}>
          <CifraGrande t="Autorizado" v={fmtM3(t.autorizadoM3)} unidad="m³" />
          {sub?.ha != null && <CifraGrande t="Superficie" v={formatNumber(sub.ha, 2)} unidad="ha" />}
          {t.seExcedeM3 > 0 ? (
            <CifraGrande t="Se pasa" v={fmtM3(t.seExcedeM3)} unidad="m³" rojo testid="bloque-se-pasa" nota={pasadas.join(", ")} />
          ) : (
            <CifraGrande t="Disponible" v={fmtM3(t.disponibleM3)} unidad="m³" />
          )}
        </dl>
        <div className="space-y-1.5">
          <BarraDeTramos
            t={tramosDelBloque(saldo.especies)}
            alto="h-4"
            etiqueta={`${saldo.nombre}: usado ${fmtM3(t.usadoM3)}, preliminar ${fmtM3(t.pendienteM3)}, disponible ${fmtM3(t.disponibleM3)} de ${fmtM3(t.autorizadoM3)} m³${t.seExcedeM3 > 0 ? `, se pasa ${fmtM3(t.seExcedeM3)}` : ""}`}
          />
          <CifrasEnLinea
            items={[
              { k: "usado", t: "Usado", v: t.usadoM3, tramo: "usado" },
              { k: "pend", t: "Preliminar", v: t.pendienteM3, tramo: "preliminar" },
              { k: "queda", t: "Saldo hoy", v: t.quedaM3 },
              /* «Disponible» ya está en cifra grande; si se pasa, la cifra grande es lo pasado y acá va lo disponible. */
              ...(t.seExcedeM3 > 0 ? [{ k: "disp", t: "Disponible", v: t.disponibleM3, tramo: "libre" as const, fuerte: true }] : []),
            ]}
          />
        </div>
        <ul className="space-y-3 rounded-lg border border-[var(--rule-soft)] p-3">
          {especies.map((e) => (
            <LothPlanBloqueEspecieFila key={e.clave} e={e} meta={metaDelReparto(reparto, e.clave)} />
          ))}
        </ul>
        {excesos.length > 0 && (
          <div role="status" className="flex flex-wrap items-start gap-2 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2 py-1.5 text-sm dark:bg-[var(--data-error-500)]/12">
            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${ROJO}`} aria-hidden="true" />
            <ul className={`min-w-0 flex-1 font-medium ${ROJO}`}>
              {excesos.map((x) => (
                <li key={x.clave}>{textoDeExceso(x, fmtM3)}</li>
              ))}
            </ul>
            <Btn
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => (ids.length > 0 && onVerPreliminares ? onVerPreliminares(ids) : setVerGuias(true))}
            >
              {ids.length > 0 && onVerPreliminares ? "Corregir" : "Ver guías"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Btn>
          </div>
        )}
        <div>
          <Btn variant="ghost" size="sm" onClick={() => setVerGuias((v) => !v)} aria-expanded={verGuias}>
            <ChevronDown className={`h-4 w-4 transition-transform ${verGuias ? "rotate-180" : ""}`} aria-hidden="true" />
            Guías de este bloque ({saldo.guias.length})
          </Btn>
          {verGuias && <LothPlanBloqueGuias guias={saldo.guias} />}
        </div>
      </div>
    </li>
  );
}
