"use client";

/**
 * El detalle del plan elegido en `LothPlanView`: avisos, pestañas y sus
 * paneles (bosque natural o plantación), y el modal de la especie fuera del
 * plan. Salió tal cual de la vista.
 */

import type { ReactNode } from "react";
import { ExternalLink } from "@buleje/design-system/icons";
import { mismaEspecie } from "@/lib/forestal/loth-constants";
import LothPoaPanel from "./LothPoaPanel";
import LothZafraPanel from "./LothZafraPanel";
import LothPlanTalaPanel from "./LothPlanTalaPanel";
import LothEspecieFichas from "./LothEspecieFichas";
import LothEspecieFueraModal from "./LothEspecieFueraModal";
import LothPlanEspecies from "./LothPlanEspecies";
import LothPlanCenso from "./LothPlanCenso";
import LothPlanAvisos from "./LothPlanAvisos";
import LothPlanCroquis from "./LothPlanCroquis";
import LothPlanPestanas, { idPanel, idTab, type PestanaPlan } from "./LothPlanPestanas";
import LothPlantacionRegistro from "./LothPlantacionRegistro";
import PlanDocumentosDelPlan from "./plan-documentos/PlanDocumentosDelPlan";
import { enlaceAlDrive } from "./plan-documentos/plan-documentos-api";
import type { VistaPlan } from "./hooks/use-loth-plan-view";

export default function LothPlanPaneles({ v, plan }: { v: VistaPlan; plan: NonNullable<VistaPlan["plan"]> }) {
  const {
    d, trees, zafra, esPlantacion, pestana, setPestana, pestanas, pestanasPlantacion, setEditandoPlan,
    conPeriodo, pedirEspecie, pedidoEspecie, pedidoLote, importarSignal, docs,
  } = v;
  return (
    <>
      <LothPlanAvisos
        /* Una plantación SIN especies todavía no tiene contra qué cruzar sus
           árboles marcados: todos saldrían «fuera del plan» en rojo, cuando
           lo que falta es cargar el registro (lo dice su pestaña). */
        rows={esPlantacion && d.species.length === 0 ? [] : d.controlRows}
        plantacion={esPlantacion}
        onResolver={d.setEspecieFuera}
        truncado={d.censoTruncado ? { total: d.censoTotal, cargados: trees.length } : null}
        /* La vigencia del plan también obliga a hacer algo: renovarlo ante
           la ARFFS lleva meses, y la guía que se emita con el papel vencido
           queda observada. */
        plan={plan ? {
          codigo: plan.planNumber ?? plan.tituloHabilitante, vigenciaHasta: plan.vigenciaHasta, estado: plan.estado,
          // Para ofrecer unirlo con el permiso del mismo código (un clic).
          id: plan.id, contratoId: plan.contratoId, planNumber: plan.planNumber, tituloHabilitante: plan.tituloHabilitante,
        } : null}
        onPlanUnido={d.loadPlans}
      />

      <LothPlanPestanas pestanas={esPlantacion ? pestanasPlantacion : pestanas} activa={pestana} onCambiar={setPestana} />

      {esPlantacion && (
        <Panel id="registro" activa={pestana}>
          <LothPlantacionRegistro
            plan={plan}
            species={d.species}
            cascada={d.cascada}
            sugeridas={d.especiesSinRegistrar}
            onEditarPlan={() => setEditandoPlan(true)}
            onCambio={() => d.loadDetail(plan.id)}
          />
          {/* El período es opcional en un registro: sin fechas, la zafra no
              tiene contra qué medirse y no se pinta. */}
          {conPeriodo && <LothZafraPanel zafra={zafra} />}
        </Panel>
      )}

      {/* Los tres paneles quedan montados (sólo se ocultan): cambiar de
          pestaña no borra lo que se estaba buscando en el censo ni los días
          elegidos en el plan de tala. */}
      {/* Bosque natural: zafra y plan de tala, fichas por especie con el
          POA (DMC, semilleros) y el pago por derecho. Nada de eso aplica a
          una plantación. */}
      {!esPlantacion && (
        <>
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
              semillerosDeclarados={d.semillerosDeclarados}
              onConfig={d.setPoaConfig}
              onSave={d.savePoaConfig}
            />
            <LothPlanEspecies
              planId={plan.id}
              species={d.species}
              onChange={() => d.loadDetail(plan.id)}
              pedido={pedidoEspecie}
              censo={trees}
              pedidoLote={pedidoLote}
            />
          </Panel>
        </>
      )}

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
          especies={d.species}
          plantacion={esPlantacion}
        />
        <LothPlanCroquis trees={trees} authorizedSpecies={d.authorizedSet} />
        {/* Con árboles marcados y período, el plan de tala también sirve en
            una plantación: qué tumbar para no quedarse con saldo. */}
        {esPlantacion && trees.length > 0 && conPeriodo && (
          <LothPlanTalaPanel
            arboles={d.arbolesParaTalar}
            saldos={d.saldosPorEspecie}
            ritmoRequeridoM3Dia={zafra.ritmoRequeridoM3Dia}
            diasRestantes={zafra.diasRestantes}
            saldoTotalM3={zafra.saldoM3}
          />
        )}
      </Panel>

      {docs.disponible && (
        <Panel id="documentos" activa={pestana}>
          {docs.vista?.preparada && docs.vista.carpetaRaizId && (
            <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
              <span className="min-w-0 truncate" title={docs.vista.rutaRaiz}>
                En Documentos: <span className="font-semibold text-[var(--text-secondary)]">{docs.vista.rutaRaiz}</span>
              </span>
              <a
                href={enlaceAlDrive(docs.vista.carpetaRaizId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Abrir en Documentos
              </a>
            </p>
          )}
          <PlanDocumentosDelPlan planId={plan.id} docs={docs} />
        </Panel>
      )}

      {d.especieFuera && (
        <LothEspecieFueraModal
          planId={plan.id}
          plantacion={esPlantacion}
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
  );
}

function Panel({ id, activa, children }: { id: PestanaPlan; activa: PestanaPlan; children: ReactNode }) {
  return (
    <div role="tabpanel" id={idPanel(id)} aria-labelledby={idTab(id)} hidden={activa !== id} tabIndex={0} className="space-y-4 focus-visible:outline-none">
      {children}
    </div>
  );
}
