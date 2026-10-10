"use client";

/**
 * LothRentabilidadView — «Rentabilidad y rendimiento» del Libro TH.
 *
 * Juntó dos pestañas que mostraban las dos el margen (2026-09-29): Rentabilidad
 * (margen por especie y por árbol) y Analítica (veredicto, flujo
 * bosque→producto, anomalías, rendimiento y valor). Las dos leían el mismo
 * `GET /plan?analytics=1`, pero éste mezclaba TODAS las líneas del negocio con
 * los precios de UN plan; ahora, con más de un plan, se pide por plan y el
 * margen sale UNA vez, de ese plan.
 *
 * Orden (ley de la vista, rule `ui-components`): título + plan + menú en UNA
 * fila → avisos (veredicto, anomalías) → indicadores plegables → bloques
 * plegables: margen, costo de cada m³, flujo, rendimiento y valor. Nada se
 * borró: las notas de «de dónde sale cada cifra» pasaron a su ⓘ.
 *
 * El saldo, el ritmo y el agotamiento por permiso viven en «Extracción».
 */

import { useMemo, useState } from "react";
import { SectionTitle, LoadingState, ErrorAlert, WarningAlert } from "@buleje/design-system";
import { Axe, Calculator, Download, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { margenPorArbol, resumirMargenArbol } from "@/lib/forestal/loth-margen-arbol";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { Btn } from "./ctp-shared";
import { useLothRentabilidad } from "./hooks/use-loth-rentabilidad";
import { FlujoCuerpo, RankingPanel, fm } from "./loth-analitica-piezas";
import LothRentabilidadArboles, { useKpisArboles } from "./loth-rentabilidad-arboles";
import LothRentabilidadAvisos from "./loth-rentabilidad-avisos";
import BloquePlegable from "./loth-rentabilidad-bloque";
import { soles } from "./loth-rentabilidad-celdas";
import LothRentabilidadCostos from "./loth-rentabilidad-costos";
import { buildAnalyticsCsv, downloadCsv, nombreDePlan } from "./loth-rentabilidad-datos";
import { useKpisRentabilidad } from "./loth-rentabilidad-kpis";
import LothRentabilidadMargen from "./loth-rentabilidad-margen";
import LothRentabilidadRendimiento from "./loth-rentabilidad-rendimiento";
import SelectorPlan from "./loth-rentabilidad-selector";

function Conmutador({ porArbol, onCambiar }: { porArbol: boolean; onCambiar: (v: boolean) => void }) {
  const cls = (on: boolean) => `h-8 rounded-lg px-3 text-sm font-bold transition-colors ${on ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)]"}`;
  return (
    <div className="flex h-10 items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
      <button type="button" onClick={() => onCambiar(false)} aria-pressed={!porArbol} className={cls(!porArbol)}>Por especie</button>
      <button type="button" onClick={() => onCambiar(true)} aria-pressed={porArbol} className={cls(porArbol)}>Por árbol</button>
    </div>
  );
}

export default function LothRentabilidadView({
  reloadSignal,
  entries = [],
  onIrAExtraccion,
}: {
  reloadSignal?: number;
  /** El libro completo: habilita bajar el margen de la especie al árbol. */
  entries?: LothEntryDTO[];
  /** Salta a «Extracción»: ahí viven el saldo, el ritmo y el agotamiento por permiso. */
  onIrAExtraccion?: () => void;
}) {
  const r = useLothRentabilidad(reloadSignal);
  const [porArbol, setPorArbol] = useState(false);
  const [costosAbierto, setCostosAbierto] = useState(false);
  const d = r.data;
  const kpis = useKpisRentabilidad(d, r.cargando, r.error);
  const idsDelPlan = d?.idsDelPlan;
  const entriesDelPlan = useMemo(() => {
    if (!idsDelPlan) return entries;
    const ids = new Set(idsDelPlan);
    return entries.filter((e) => ids.has(e.id));
  }, [entries, idsDelPlan]);

  // El margen bajado al árbol: el promedio por especie esconde justo al fuste
  // que no convino tumbar. Se calcula acá porque el libro ya está en memoria.
  // Con un plan elegido entre varios, sólo las líneas de ESE plan (la atribución de Extracción llega hecha del servidor).
  // Va ANTES del `return` de carga: el hook de «Indicadores» no puede quedar condicionado.
  const filasCosteo = d?.costeo && d.costeo.rows.length > 0 ? d.costeo.rows : null;
  const arboles = useMemo(
    () => (filasCosteo ? margenPorArbol(buildTraceOperations(entriesDelPlan), filasCosteo) : []),
    [filasCosteo, entriesDelPlan],
  );
  const resArboles = useMemo(() => resumirMargenArbol(arboles), [arboles]);
  const kpisArboles = useKpisArboles(arboles, resArboles);

  const titulo = <SectionTitle>Rentabilidad y rendimiento</SectionTitle>;
  if (!d) {
    // Sin cifras PARA ESTE plan (cargando o falló): el selector sigue a la vista para poder cambiar o reintentar.
    return (
      <div className="space-y-3" data-vista-rentabilidad aria-busy={r.cargando}>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {titulo}
          <div className="ml-auto"><SelectorPlan planes={r.planes} planId={r.planId} onElegir={r.elegirPlan} /></div>
        </header>
        {r.cargando || !r.error ? (
          <LoadingState message="Calculando rentabilidad y rendimiento..." />
        ) : (
          <ErrorAlert
            title="No se pudo calcular la rentabilidad"
            description={r.error}
            action={<Btn variant="secondary" size="sm" onClick={r.recargar}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Btn>}
          />
        )}
      </div>
    );
  }

  const costeo = d.costeo && d.costeo.rows.length > 0 ? d.costeo : null;
  const nombrePlan = d.plan ? nombreDePlan({ planNumber: d.plan.planNumber, titularName: d.plan.titularName }) : null;

  const acciones: MenuAccion[] = [
    {
      id: "csv",
      label: "Descargar CSV",
      hint: "Margen, flujo, rendimiento y valor por especie",
      icon: Download,
      onSelect: () => downloadCsv(`rentabilidad-libro-th-${(d.plan?.planNumber ?? "sin-plan").replace(/[^\w-]+/g, "-")}.csv`, buildAnalyticsCsv(d)),
    },
    { id: "recargar", label: "Recargar", hint: "Vuelve a leer el libro y el plan", icon: RefreshCw, onSelect: r.recargar },
    ...(onIrAExtraccion
      ? [{ id: "extraccion", label: "Saldo y agotamiento", hint: "Por permiso, en Extracción", icon: Axe, onSelect: onIrAExtraccion }]
      : []),
  ];

  return (
    <div className="space-y-3" data-vista-rentabilidad aria-busy={r.cargando}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="inline-flex items-center gap-1.5">
            {titulo}
            <InfoTip
              title="Rentabilidad y rendimiento"
              what="Cuánto deja el aprovechamiento (margen por especie y por árbol) y cuánto rinde la madera del bosque al producto."
              affects="El margen sale de UN plan: con varios permisos, elige el plan arriba. Precio = el estimado del plan, no el de cada venta."
              example="Tornillo a S/ 450 el m³ con S/ 282 de costo deja S/ 168 por m³ movilizado."
              side="bottom"
            />
          </span>
          <p className="text-sm text-[var(--text-secondary)]">
            {d.hasPlan && nombrePlan ? <>plan <b className="text-[var(--text-primary)]">{nombrePlan}</b></> : "sin plan activo"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {kpis.boton}
          <SelectorPlan planes={r.planes} planId={r.planId} onElegir={r.elegirPlan} />
          {d.hasPlan && (
            <Btn variant="secondary" size="sm" onClick={() => setCostosAbierto(true)}><Calculator className="h-4 w-4" /> Costos operativos</Btn>
          )}
          <ActionMenu label="Opciones de rentabilidad" actions={acciones} size="sm" soloIcono />
        </div>
      </header>

      {r.error && <ErrorAlert title="No se pudo actualizar" description={r.error} />}

      {r.veredicto && <LothRentabilidadAvisos veredicto={r.veredicto} anomalias={d.anomalias} fueraDePlan={d.especiesNoAutorizadas ?? []} />}

      {d.sinAtribuir && d.sinAtribuir.lineas > 0 && (
        <p className="flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {d.sinAtribuir.lineas} {d.sinAtribuir.lineas === 1 ? "línea sin plan" : "líneas sin plan"}: no {d.sinAtribuir.lineas === 1 ? "entra" : "entran"} en ningún plan.
          <InfoTip
            title="Líneas sin plan"
            what="Despachos o consumos cuya troza no está en el trozado de ningún plan, o cuyo árbol está en más de un censo."
            affects="Sus m³ no suman al margen de este plan ni al de otro: se dejan fuera antes que repartirlos a ciegas."
            example="Un despacho de la troza 99-XXX-1, que no existe en ningún trozado."
            side="bottom"
          />
        </p>
      )}

      {kpis.panel}

      {r.flujo && (
        <div className="space-y-2">
          <BloquePlegable
            clave="margen"
            titulo="Margen por especie"
            abiertoPorDefecto
            resumen={costeo ? `${soles(costeo.margenTotal)} · ${costeo.margenPctTotal}% · ${costeo.rows.length} ${costeo.rows.length === 1 ? "especie" : "especies"}` : "sin costeo"}
            ayuda={{
              title: "Cómo se calcula el margen",
              what: "Precio de venta − (derecho VEN + extracción + transformación + flete), por m³ movilizado.",
              affects: "El VEN sale del plan por especie; extracción, transformación y flete, de «Costos operativos». Movilizado = lo que salió con guía. Por árbol: hereda el precio de su especie, y sólo cuenta la troza despachada.",
              example: "Shihuahuaco a S/ 850 con S/ 620 de costo deja S/ 230 por m³ (27 %).",
            }}
            extra={entries.length > 0 && costeo ? (
              <>
                {/* «Indicadores» en la fila del conmutador, no en otra sobre la tabla (Brandon 08-10). */}
                {porArbol && kpisArboles.boton}
                <Conmutador porArbol={porArbol} onCambiar={setPorArbol} />
              </>
            ) : undefined}
          >
            {!costeo ? (
              <WarningAlert
                title="Todavía no se puede calcular el margen"
                description={d.hasPlan
                  ? "Carga el precio de venta y el valor al estado natural (VEN) por especie en el Plan de Manejo, y registra despachos."
                  : "Registra o activa un Plan de Manejo con precios por especie para calcular el margen."}
              />
            ) : porArbol ? (
              <LothRentabilidadArboles filas={arboles} kpis={kpisArboles} />
            ) : (
              <LothRentabilidadMargen filas={costeo.rows} />
            )}
          </BloquePlegable>

          {d.hasPlan && (
            <BloquePlegable
              clave="costo-m3"
              titulo="¿En qué se va el costo de cada m³?"
              resumen={r.ranking.length > 0 ? `${r.ranking.length} ${r.ranking.length === 1 ? "especie" : "especies"} · costo operativo ${soles(costeo?.costoOperativoM3 ?? 0)}/m³` : "sin costeo"}
              ayuda={{
                title: "Costo por especie",
                what: "Cada especie con su margen, su parte del margen total y el costo del m³ apilado por tramo.",
                affects: "Las «sin movilizar» aún no generan margen: van al final, ordenadas por lo que rendirían por m³.",
                example: "Tornillo: 100 % del margen generado; el VEN pesa más que el flete.",
              }}
            >
              {r.ranking.length > 0 ? (
                <RankingPanel rows={r.ranking} />
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">Carga el precio de venta y los costos operativos.</p>
              )}
            </BloquePlegable>
          )}

          <BloquePlegable
            clave="flujo"
            titulo="¿Dónde terminó cada m³ del bosque?"
            resumen={`${fm(r.flujo.totalM3, 2)} m³ talados`}
            ayuda={{
              title: "Cómo se lee el flujo",
              what: "Las trozas se bifurcan: una parte se vende en rollo y otra entra a planta.",
              affects: "Los porcentajes de cada rama son sobre lo trozado, no sobre el total talado.",
              example: "Si 60 de 100 m³ trozados van a planta, esa rama muestra 60 %, aunque sean 48 % de lo talado.",
            }}
          >
            <FlujoCuerpo f={r.flujo} />
          </BloquePlegable>

          {r.porEspecie.length > 0 && (
            <BloquePlegable
              clave="rendimiento"
              titulo="Rendimiento y valor por especie"
              extra={onIrAExtraccion ? (
                <button type="button" onClick={onIrAExtraccion} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
                  <Axe className="h-3.5 w-3.5" aria-hidden /> Ver en Extracción
                </button>
              ) : undefined}
              resumen={`${r.porEspecie.length} ${r.porEspecie.length === 1 ? "especie" : "especies"} · rendimiento ${d.aprovechamiento.rendimientoGlobalPct}%`}
              ayuda={{
                title: "Rendimiento y valor por especie",
                what: "Cuánto del árbol talado llegó a troza, la merma, y lo que vale lo que ya salió con guía.",
                affects: "El talado, el trozado, el despachado y el saldo por especie están en Extracción, por permiso.",
                example: "Tornillo: talaste 5,0 m³ y trozaste 4,9 m³: rinde 97,7 % y la merma es 0,1 m³.",
              }}
            >
              <LothRentabilidadRendimiento filas={r.porEspecie} />
            </BloquePlegable>
          )}
        </div>
      )}

      <LothRentabilidadCostos
        abierto={costosAbierto}
        onCerrar={() => setCostosAbierto(false)}
        costos={r.costos}
        setCostos={r.setCostos}
        guardando={r.guardando}
        onGuardar={() => void r.guardarCostos().then((ok) => ok && setCostosAbierto(false))}
        costoOperativoM3={d.costeo?.costoOperativoM3 ?? null}
      />
    </div>
  );
}
