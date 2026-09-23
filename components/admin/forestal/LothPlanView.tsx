"use client";

/**
 * LothPlanView — Plan de Manejo Forestal + especies autorizadas + censo (ADR-126).
 *
 * Base maestra del LO-TH: el permiso aprobado, los volúmenes autorizados por
 * especie (con precio/m³) y el censo de árboles. La Tala jala de acá por código.
 *
 * ORDEN (Brandon 2026-09-19: «muchas tablas dispersas y sin orden»). Antes eran
 * nueve bloques en una tirada —4,8 pantallas, 5 tablas, 8 títulos al mismo
 * peso—. Ahora la vista contesta de arriba abajo:
 *
 *   1. ¿Qué plan y cuánto queda?  → cabecera: título, plan, carátula en una
 *      línea e indicadores plegables (recordados).
 *   2. ¿Hay algo mal HOY?          → avisos, FUERA de las pestañas.
 *   3. El detalle, por pregunta    → pestañas «Avance y tala» · «Especies» ·
 *      «Censo», con las tablas que hablan de lo mismo juntas.
 *
 * Los datos y las cuentas viven en `hooks/use-loth-plan`; esto sólo ordena.
 */

import { useState, type ReactNode } from "react";
import { AlertCircle, FileText, Loader2, Pencil, Plus, Printer, Trash2, Upload } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import { printLothPoa } from "@/lib/forestal/loth-poa-print";
import { mismaEspecie } from "@/lib/forestal/loth-constants";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import LothPoaPanel from "./LothPoaPanel";
import LothZafraPanel from "./LothZafraPanel";
import LothPlanTalaPanel from "./LothPlanTalaPanel";
import LothEspecieFichas from "./LothEspecieFichas";
import LothEspecieFueraModal from "./LothEspecieFueraModal";
import LothPlanForm from "./LothPlanForm";
import LothPlanEspecies, { type PedidoEspecie } from "./LothPlanEspecies";
import LothPlanCenso from "./LothPlanCenso";
import LothPlanAvisos from "./LothPlanAvisos";
import LothPlanCroquis from "./LothPlanCroquis";
import LothPlanCabecera from "./LothPlanCabecera";
import LothPlanPestanas, { PESTANAS_PLAN, idPanel, idTab, type PestanaDef, type PestanaPlan } from "./LothPlanPestanas";
import { printInforme } from "./loth-plan-informe";
import { useLothPlan } from "./hooks/use-loth-plan";

/** Clave de la pestaña elegida. Exportada: la prueba en navegador la lee. */
export const CLAVE_PESTANA_PLAN = "loth:plan:pestana";

export default function LothPlanView({ reloadSignal }: { reloadSignal?: number } = {}) {
  const d = useLothPlan(reloadSignal);
  const { trees, zafra } = d;
  /* El plan se muestra cuando llegó SU detalle: con sólo la lista de planes la
     cabecera decía «0 m³ autorizados» y el plan de tala no aparecía. */
  const plan = d.detalleListo ? d.plan : null;
  const cargando = d.loading || (d.plan != null && !d.detalleListo);
  const [pestanaGuardada, setPestana] = useLocalStorage<PestanaPlan>(CLAVE_PESTANA_PLAN, "avance");
  /* Un valor viejo o tocado a mano en el navegador no deja la vista sin panel. */
  const pestana: PestanaPlan = PESTANAS_PLAN.includes(pestanaGuardada) ? pestanaGuardada : "avance";
  const [pedidoEspecie, setPedidoEspecie] = useState<PedidoEspecie | null>(null);
  const [importarSignal, setImportarSignal] = useState(0);
  /** El plan abierto para corregir sus datos (ADR-426). */
  const [editandoPlan, setEditandoPlan] = useState(false);
  const [borrandoPlan, setBorrandoPlan] = useState(false);
  const [errorPlan, setErrorPlan] = useState<string | null>(null);
  const { confirm } = useConfirm();

  const pedirEspecie = (id: string, accion: PedidoEspecie["accion"]) =>
    setPedidoEspecie((p) => ({ id, accion, n: (p?.n ?? 0) + 1 }));

  /**
   * Eliminar un plan cargado por error — diciendo ANTES qué se lleva puesto.
   *
   * Brandon (2026-09-21): «en el menú también tiene que tener los detalles de
   * datos que alojó ese plan de manejo, para saber qué estoy eliminando». Un
   * plan con 600 árboles censados y 12 asientos del libro no es lo mismo que
   * uno cargado hace un minuto, y el diálogo tiene que decir la diferencia con
   * el número real, no con una advertencia genérica.
   *
   * La baja es lógica: los asientos y las guías que lo citan son lo que se
   * declara ante la ARFFS y no se tocan.
   */
  async function eliminarPlan(p: NonNullable<typeof plan>) {
    setBorrandoPlan(true);
    try {
      const r = await fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(p.id)}&usos=1`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as { usos?: Record<string, number | null> };
      const u = j.usos ?? {};
      const partes = [
        u.especies ? `${u.especies} ${u.especies === 1 ? "especie autorizada" : "especies autorizadas"}` : null,
        u.censo ? `${u.censo} ${u.censo === 1 ? "árbol censado" : "árboles censados"}` : null,
        u.asientos ? `${u.asientos} ${u.asientos === 1 ? "asiento del libro" : "asientos del libro"}` : null,
        u.guias ? `${u.guias} ${u.guias === 1 ? "guía emitida" : "guías emitidas"}` : null,
        u.contratos ? `${u.contratos} ${u.contratos === 1 ? "permiso atado" : "permisos atados"}` : null,
      ].filter(Boolean);
      /* El volumen autorizado va aparte: es la cifra que dice de qué tamaño era
         el plan. `null` (sin especies cargadas) NO es 0 m³ y no se muestra. */
      const vol = typeof u.volumenAutorizadoM3 === "number" ? ` Autorizaba ${Number(u.volumenAutorizadoM3).toFixed(2)} m³.` : "";
      const detalle = partes.length
        ? `Tiene ${partes.join(", ")}.${vol} Nada de eso se borra: el plan deja de aparecer en el selector y lo que ya se declaró sigue igual.`
        : `No tiene especies, censo, asientos ni guías: se puede sacar sin dejar nada suelto.${vol}`;
      const ok = await confirm({
        title: `¿Eliminar ${p.planType} ${p.planNumber ?? ""}?`.replace(/\s+\?/, "?"),
        description: `${p.titularName}. ${detalle}`,
        intent: "danger",
        confirmLabel: "Sí, eliminar",
      });
      if (!ok) return;
      const del = await fetch(`/api/admin/forestal/plan?id=${encodeURIComponent(p.id)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (!del.ok) {
        const e = (await del.json().catch(() => ({}))) as { message?: string; error?: string };
        setErrorPlan(e.message ?? e.error ?? `No se pudo eliminar (HTTP ${del.status})`);
        return;
      }
      setErrorPlan(null);
      d.setPlanId(null);
      d.loadPlans();
    } catch (e) {
      setErrorPlan(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrandoPlan(false);
    }
  }

  /* Lo que se hace de vez en cuando —imprimir, importar, crear otro plan— va
     en «Opciones»; a la vista queda el selector del plan y el detalle. */
  const opciones: MenuAccion[] = [
    {
      id: "informe",
      label: "Informe de ejecución",
      hint: "Balance, censo y movimientos del libro, para ARFFS / SERFOR / OSINFOR",
      icon: Printer,
      disabled: !plan,
      onSelect: () => { if (plan) void printInforme(plan, d.species, d.censusStat); },
    },
    {
      id: "anexo-poa",
      label: "Anexo POA",
      hint: "El cuadro del Plan Operativo por especie, para presentar",
      icon: FileText,
      tone: "dark",
      disabled: !plan,
      onSelect: () => {
        if (!plan) return;
        printLothPoa(d.poa, {
          titular: plan.titularName,
          tituloHabilitante: plan.tituloHabilitante,
          planNumber: plan.planNumber,
          planType: plan.planType,
          resolucion: plan.resolucionNumber,
          arffs: plan.arffs,
          parcelaCorta: plan.parcelaCorta,
          vigencia: plan.vigenciaHasta,
        });
      },
    },
    {
      id: "importar-censo",
      label: "Importar censo",
      hint: "Traer los árboles de un CSV o Excel del inventario",
      icon: Upload,
      disabled: !plan,
      onSelect: () => { setPestana("censo"); setImportarSignal((n) => n + 1); },
    },
    {
      id: "editar-plan",
      label: "Editar este plan",
      hint: "Corregir sus datos: resolución, área, vigencia, propietario",
      icon: Pencil,
      disabled: !plan,
      onSelect: () => setEditandoPlan(true),
    },
    {
      id: "eliminar-plan",
      label: "Eliminar este plan",
      hint: "Dice antes qué cuelga de él: especies, censo, asientos y guías",
      icon: Trash2,
      tone: "danger",
      disabled: !plan || borrandoPlan,
      onSelect: () => { if (plan) void eliminarPlan(plan); },
    },
    {
      id: "nuevo-plan",
      label: "Nuevo plan de manejo",
      hint: "Otro permiso: su resolución, titular y vigencia",
      icon: Plus,
      onSelect: () => d.setShowPlanForm(true),
    },
  ];

  const peligro = d.fichasEspecie.filter((f) => f.tone === "danger").length;
  const atencion = d.fichasEspecie.filter((f) => f.tone === "warn").length;
  const pestanas: PestanaDef[] = [
    {
      id: "avance",
      label: "Avance y tala",
      alerta: zafra.estado === "vencida" ? "danger" : zafra.estado === "atrasado" ? "warn" : undefined,
      alertaTexto: zafra.estado === "vencida" ? "Vigencia vencida" : zafra.estado === "atrasado" ? "Zafra atrasada" : undefined,
    },
    {
      id: "especies",
      label: "Especies",
      cuenta: String(d.fichasEspecie.length),
      alerta: peligro > 0 ? "danger" : atencion > 0 ? "warn" : undefined,
      alertaTexto:
        peligro > 0 ? `${peligro} ${peligro === 1 ? "especie con problema" : "especies con problema"}`
          : atencion > 0 ? `${atencion} ${atencion === 1 ? "especie con aviso" : "especies con aviso"}` : undefined,
    },
    { id: "censo", label: "Censo", cuenta: d.censoTotal.toLocaleString("es-PE") },
  ];

  return (
    <div data-vista-plan className="space-y-4">
      {errorPlan && (
        <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {errorPlan}
        </p>
      )}
      <LothPlanCabecera
        plans={d.plans}
        planId={d.planId}
        onPlan={d.setPlanId}
        plan={plan}
        opciones={opciones}
        kpis={
          plan
            ? {
                autorizadoTotal: d.autorizadoTotal,
                especies: d.species.length,
                aprovechamientoPct: d.autorizadoTotal > 0 ? d.aprovechamientoPct : null,
                movilizadoTotal: d.movilizadoTotal,
                saldoTotal: d.saldoTotal,
                censoTotal: d.censoTotal,
                censoTruncado: d.censoTruncado,
                cargados: trees.length,
                georrefPct: d.georrefPct,
                okCount: d.okCount,
                controlCount: d.controlRows.length,
                fueraDelPlan: d.noAutorizadas.length,
              }
            : null
        }
      />

      {d.error && (
        <div role="alert" className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" /> {d.error}
        </div>
      )}

      {/* El plan es la base maestra del libro: se carga en un modal enfocado, no
          en un panel que empuja el resto de la pestaña fuera de la vista. */}
      <AdminModal
        open={d.showPlanForm}
        onClose={() => d.setShowPlanForm(false)}
        title="Nuevo plan de manejo"
        description="El permiso aprobado que autoriza el aprovechamiento. De acá cuelgan las especies y el censo."
        icon={FileText}
        /* `info` (64 rem) y no `wide` (42 rem): el formulario reparte sus campos
           en cuatro columnas —`lg:grid-cols-4` mira la VENTANA, no el modal—, y
           en 42 rem cada uno quedaba en ~150 px, con «RDF N° 001-2026…»
           cortado. Es el mismo ancho que la ficha del Directorio, que es el
           modal hermano que se abre desde acá. */
        variant="info"
      >
        {d.showPlanForm && (
          <LothPlanForm
            onClose={() => d.setShowPlanForm(false)}
            onSaved={() => { d.setShowPlanForm(false); d.loadPlans(); }}
            /* Los planes que ya existen: de ellos sale lo que se repite entre
               un documento y el siguiente (ARFFS, región, regente, UIT,
               costos) y las autoridades ya escritas. */
            planesPrevios={d.plans}
          />
        )}
      </AdminModal>

      {/* Corregir un plan ya cargado: el mismo formulario del alta, con sus
          valores adentro. Un plan mal cargado se arregla, no se duplica. */}
      <AdminModal
        open={editandoPlan && plan != null}
        onClose={() => setEditandoPlan(false)}
        title="Editar plan de manejo"
        description={plan ? `${plan.planType} ${plan.planNumber ?? ""} — ${plan.titularName}` : ""}
        icon={FileText}
        variant="info"
      >
        {editandoPlan && plan && (
          <LothPlanForm
            plan={plan}
            onClose={() => setEditandoPlan(false)}
            onSaved={() => { setEditandoPlan(false); d.loadPlans(); }}
            planesPrevios={d.plans}
          />
        )}
      </AdminModal>

      {cargando && (
        <div className="p-6 text-center text-[var(--text-tertiary)]" role="status" aria-label="Cargando el plan de manejo">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
      )}

      {!cargando && plan && (
        <>
          <LothPlanAvisos
            rows={d.controlRows}
            onResolver={d.setEspecieFuera}
            truncado={d.censoTruncado ? { total: d.censoTotal, cargados: trees.length } : null}
            /* La vigencia del plan también obliga a hacer algo: renovarlo ante
               la ARFFS lleva meses, y la guía que se emita con el papel vencido
               queda observada. */
            plan={plan ? { codigo: plan.planNumber ?? plan.tituloHabilitante, vigenciaHasta: plan.vigenciaHasta, estado: plan.estado } : null}
          />

          <LothPlanPestanas pestanas={pestanas} activa={pestana} onCambiar={setPestana} />

          {/* Los tres paneles quedan montados (sólo se ocultan): cambiar de
              pestaña no borra lo que se estaba buscando en el censo ni los días
              elegidos en el plan de tala. */}
          <Panel id="avance" activa={pestana}>
            <LothZafraPanel zafra={zafra} />
            {/* Y el paso que faltaba: con qué árboles se llega a ese ritmo. */}
            <LothPlanTalaPanel
              arboles={d.arbolesParaTalar}
              saldos={d.saldosPorEspecie}
              ritmoRequeridoM3Dia={zafra.ritmoRequeridoM3Dia}
              diasRestantes={zafra.diasRestantes}
              saldoTotalM3={zafra.saldoM3}
            />
          </Panel>

          <Panel id="especies" activa={pestana}>
            {/* Tres miradas a la misma especie, juntas: cuánto le queda, cuánto
                es aprovechable por DMC y dónde se corrige lo autorizado. */}
            <LothEspecieFichas
              fichas={d.fichasEspecie}
              pagoArea={d.balance?.pagoArea ?? null}
              pagoDerechoTotal={d.balance?.pagoDerechoTotal ?? null}
              valorTotal={d.balance?.valorTotal ?? null}
              onEditar={(id) => pedirEspecie(id, "editar")}
              onBorrar={(id) => pedirEspecie(id, "borrar")}
            />
            <LothPoaPanel
              analisis={d.poa}
              config={d.poaConfig}
              saving={d.poaSaving}
              sucio={d.poaSucio}
              onConfig={d.setPoaConfig}
              onSave={d.savePoaConfig}
            />
            <LothPlanEspecies planId={plan.id} species={d.species} onChange={() => d.loadDetail(plan.id)} pedido={pedidoEspecie} />
          </Panel>

          <Panel id="censo" activa={pestana}>
            <LothPlanCenso
              planId={plan.id}
              trees={trees}
              total={d.censoTotal}
              truncado={d.censoTruncado}
              authorizedSpecies={d.authorizedSet}
              categorias={d.categoriaPorArbol}
              dmcOverrides={d.poaConfig.dmcOverrides}
              onChange={() => d.loadDetail(plan.id)}
              importarSignal={importarSignal}
            />
            <LothPlanCroquis trees={trees} authorizedSpecies={d.authorizedSet} />
          </Panel>

          {d.especieFuera && (
            <LothEspecieFueraModal
              planId={plan.id}
              especie={d.especieFuera}
              arboles={trees
                .filter((t) => mismaEspecie(t.speciesCommon, d.especieFuera))
                .map((t) => ({ id: t.id, treeCode: t.treeCode, volumenEstimadoM3: t.volumenEstimadoM3, estado: t.estado }))}
              resolucion={plan.resolucionNumber}
              onClose={() => d.setEspecieFuera(null)}
              onResuelto={() => d.loadDetail(plan.id)}
            />
          )}
        </>
      )}

      {!cargando && d.plans.length === 0 && !d.showPlanForm && (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" aria-hidden="true" />
          <p className="text-base font-medium">No hay planes de manejo cargados.</p>
          <p className="mt-1 text-sm">Crea el plan (permiso + resolución + titular) para empezar a censar árboles.</p>
          {/* Sin planes, crear uno ES la acción principal: va a la vista, no
              escondida en «Opciones». */}
          <button
            type="button"
            onClick={() => d.setShowPlanForm(true)}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo plan
          </button>
        </div>
      )}
    </div>
  );
}

function Panel({ id, activa, children }: { id: PestanaPlan; activa: PestanaPlan; children: ReactNode }) {
  return (
    <div role="tabpanel" id={idPanel(id)} aria-labelledby={idTab(id)} hidden={activa !== id} tabIndex={0} className="space-y-4 focus-visible:outline-none">
      {children}
    </div>
  );
}
