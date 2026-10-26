"use client";

/**
 * El costado de «Registrar GTF preliminar» (Brandon 25-10): al elegir el bloque
 * en una fila, cuánto le autorizaron, cuánto se usó, cuánto tienen las otras
 * preliminares pendientes, el saldo y el saldo si se registran CON lo que se
 * está escribiendo, al vuelo; y las GTF que ya tiene ese bloque. Si se pasa,
 * aviso rojo (aviso, no bloqueo: la guía ya está hecha en papel).
 *
 * Sin bloques en el plan, el saldo del plan por especie. Las mismas funciones
 * puras del servidor (`previsualizarBloques`, `preliminarPorEspecie`).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { previsualizarBloques, textoDeExceso, type EspecieConUsos, type ExcesoDeBloque, type SaldoDelBloque, type SaldoPorBloques } from "@/lib/forestal/loth-plan-bloques-saldo";
import { lineasQueCuentan, preliminarPorEspecie, type GtfPreliminarVista, type LineaPreliminar } from "@/lib/forestal/loth-plan-preliminares";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { Btn } from "./ctp-shared";
import LothPlanBloqueGuias from "./LothPlanBloqueGuias";
import { CifrasDelBloque } from "./LothPlanBloqueTarjeta";

const NUM = "font-mono tabular-nums";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const VISIBLES = 4;

function AvisoRojo({ textos }: { textos: string[] }) {
  if (textos.length === 0) return null;
  return (
    <div role="status" data-testid="panel-bloque-aviso" className="flex items-start gap-2 rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-2 text-sm dark:bg-[var(--data-error-500)]/12">
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${ROJO}`} aria-hidden="true" />
      <span className={`min-w-0 ${ROJO}`}>
        {textos.map((t) => (
          <span key={t} className="block font-semibold">{t}</span>
        ))}
        <span className="block">Puedes guardarla igual; corrige o anula alguna antes de registrarla en SERFOR.</span>
      </span>
    </div>
  );
}

function BloqueEnLaVentana({ antes, con, excesos }: { antes: SaldoDelBloque; con: SaldoDelBloque; excesos: ExcesoDeBloque[] }) {
  const [todas, setTodas] = useState(false);
  const previas = new Map(antes.especies.map((e) => [e.clave, e.pendienteM3]));
  const especies = con.especies.filter((e) => e.enElReparto || e.pendienteM3 > 0);
  const guias = todas ? antes.guias : antes.guias.slice(0, VISIBLES);
  return (
    <div data-testid="panel-bloque-detalle" data-bloque={con.nombre} className="space-y-2">
      <p className="text-sm font-bold text-[var(--text-primary)]">{con.nombre}</p>
      {especies.map((e) => (
        <div key={e.clave} className="space-y-1">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">{e.especie}</p>
          <CifrasDelBloque c={e} estaGuiaM3={Math.max(0, e.pendienteM3 - (previas.get(e.clave) ?? 0))} columnas="grid-cols-3" />
        </div>
      ))}
      <AvisoRojo textos={excesos.map((x) => textoDeExceso(x, fmtM3))} />
      <div>
        <p className="text-xs font-semibold text-[var(--text-secondary)]">GTF ya agregadas a este bloque ({antes.guias.length})</p>
        <LothPlanBloqueGuias guias={guias} vacio="Ninguna todavía: ésta sería la primera." />
        {antes.guias.length > VISIBLES && (
          <Btn variant="ghost" size="sm" onClick={() => setTodas((v) => !v)} aria-expanded={todas}>
            <ChevronDown className={`h-4 w-4 transition-transform ${todas ? "rotate-180" : ""}`} aria-hidden="true" />
            {todas ? "Ver menos" : `Ver las ${antes.guias.length}`}
          </Btn>
        )}
      </div>
    </div>
  );
}

/** Sin bloques: el saldo del plan de las especies que se escriben (o de todas, si todavía ninguna). */
function SaldoDelPlan({ saldo, guias, lineas, exceptoId }: { saldo: readonly EspecieConUsos[]; guias: readonly GtfPreliminarVista[]; lineas: readonly LineaPreliminar[]; exceptoId?: string }) {
  const otras = lineasQueCuentan(guias, exceptoId);
  const antes = new Map(preliminarPorEspecie(saldo, otras).map((p) => [p.clave, p.m3]));
  const con = new Map(preliminarPorEspecie(saldo, [...otras, ...lineas]).map((p) => [p.clave, p]));
  const escritas = new Set(lineas.map((l) => claveEspecie(l.especie)));
  const conTecho = saldo.filter((e) => e.autorizadoM3 != null && (escritas.size === 0 || escritas.has(e.clave)));
  if (conTecho.length === 0) return <p className="text-sm text-[var(--text-secondary)]">Esta especie no tiene techo en el plan.</p>;
  const pasadas = conTecho.flatMap((e) => {
    const c = con.get(e.clave);
    return c?.excede ? [`${e.especie} se pasa por ${fmtM3(Math.abs(c.quedaSiSeRegistranM3 ?? 0))} m³ — revisa y corrige`] : [];
  });
  return (
    <div className="space-y-2">
      {conTecho.map((e) => {
        const c = con.get(e.clave);
        const pend = c?.m3 ?? 0;
        const esta = Math.max(0, pend - (antes.get(e.clave) ?? 0));
        return (
          <div key={e.clave} className="space-y-1">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">{e.especie}</p>
            <CifrasDelBloque
              c={{ autorizadoM3: e.autorizadoM3 ?? 0, usadoM3: e.usadoM3, pendienteM3: pend, quedaM3: e.quedaM3 ?? 0, quedaSiSeRegistranM3: c?.quedaSiSeRegistranM3 ?? e.quedaM3 ?? 0, excede: c?.excede, excedeHoy: (e.quedaM3 ?? 0) < 0 }}
              estaGuiaM3={escritas.size > 0 ? esta : undefined}
              columnas="grid-cols-3"
            />
          </div>
        );
      })}
      <AvisoRojo textos={pasadas} />
    </div>
  );
}

export default function LothPlanPreliminarPanelBloque({
  porBloque,
  saldo,
  guias,
  lineas,
  elegidos,
  numeroGtf,
  numerosLt,
  exceptoId,
}: {
  porBloque: SaldoPorBloques;
  saldo: readonly EspecieConUsos[];
  guias: readonly GtfPreliminarVista[];
  /** Las filas que ya se entienden (especie y m³). */
  lineas: readonly LineaPreliminar[];
  /** Los bloques elegidos en las filas (aunque falten los m³). */
  elegidos: readonly string[];
  numeroGtf: string;
  numerosLt: string[];
  exceptoId?: string;
}) {
  const conBloques = porBloque.reparto.length > 0;
  const previa = useMemo(
    () => (conBloques ? previsualizarBloques(porBloque, saldo, guias, { numeroGtf, numerosLt, lineas }, exceptoId) : null),
    [conBloques, porBloque, saldo, guias, numeroGtf, numerosLt, lineas, exceptoId],
  );
  const unico = porBloque.reparto.length === 1 ? porBloque.reparto[0]!.nombre : null;
  const nombres = unico ? [unico] : [...new Set(elegidos.filter(Boolean))];
  return (
    <aside data-testid="panel-bloque" className="space-y-3 self-start rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 lg:sticky lg:top-0">
      <div className="space-y-0.5">
        <p className="flex items-center gap-1 text-sm font-bold text-[var(--text-primary)]">
          {conBloques ? "Saldo del bloque" : "Saldo del plan"}
          <InfoTip
            title={conBloques ? "Saldo del bloque" : "Saldo del plan"}
            what="Autorizado − usado (lo registrado en el libro) = saldo. «Si se registran» resta además las preliminares pendientes y esta guía, con lo que vas escribiendo. Todo en m³."
            affects="Es un aviso: puedes guardar igual. El freno del despacho mide sólo lo registrado y no cambia."
            example="Bloque 2: 30 m³ autorizados, 0 usados, esta guía 43,261 → se pasa por 13,261 m³."
          />
        </p>
        <p className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          No te pases del volumen autorizado de {conBloques ? "cada bloque" : "cada especie"}.
        </p>
      </div>
      {!conBloques && <SaldoDelPlan saldo={saldo} guias={guias} lineas={lineas} exceptoId={exceptoId} />}
      {previa && nombres.length === 0 && (
        <div className="space-y-1">
          <p className="text-sm text-[var(--text-secondary)]">Elige el bloque en una fila para ver su detalle.</p>
          <ul className="divide-y divide-[var(--rule-soft)] text-sm">
            {previa.con.bloques.map((b) => (
              <li key={b.nombre} className="flex flex-wrap items-baseline justify-between gap-x-2 py-1">
                <span className="font-semibold text-[var(--text-primary)]">{b.nombre}</span>
                <span className={`${NUM} ${b.excede ? ROJO : "text-[var(--text-secondary)]"}`}>
                  saldo {fmtM3(b.total.quedaM3)} · si se registran {fmtM3(b.total.quedaSiSeRegistranM3)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {previa &&
        nombres.map((n) => {
          const antes = previa.antes.bloques.find((b) => b.nombre === n);
          const con = previa.con.bloques.find((b) => b.nombre === n);
          if (!antes || !con) return null;
          return <BloqueEnLaVentana key={n} antes={antes} con={con} excesos={previa.con.excesos.filter((x) => x.bloque === n)} />;
        })}
    </aside>
  );
}
