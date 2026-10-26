"use client";

/**
 * El detalle del plan elegido en `LothPlanView`: avisos, pestañas y sus
 * paneles (bosque natural o plantación), y el modal de la especie fuera del
 * plan. Salió tal cual de la vista.
 */

import { useState, type ReactNode } from "react";
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
import PestanaPapeles from "./plan-papeles/PestanaPapeles";
import type { VistaPlan } from "./hooks/use-loth-plan-view";
import { useSaldoDelPlan } from "./hooks/use-loth-saldo-plan";
import LothPlanSinPlan from "./LothPlanSinPlan";
import LothPlanSaldoGrande from "./LothPlanSaldoGrande";
import LothPlanPreliminares from "./LothPlanPreliminares";
import LothPlanPreliminaresAviso from "./LothPlanPreliminaresAviso";
import LothPlanBloquesExcesoAviso from "./LothPlanBloquesExcesoAviso";
import LothPlantacionBloques, { type SaldoDeLosBloquesProps } from "./LothPlantacionBloques";
import { useIrAPreliminares } from "./hooks/use-ir-a-preliminares";
import { useSemaforoDelPlanAbierto } from "./hooks/use-loth-semaforo-libro";
import LothPlazosDelLibroAviso from "./LothPlazosDelLibroAviso";
import LothPlanAvisosFranja from "./LothPlanAvisosFranja";
import { PESTANA_PAPELES } from "./plan-papeles/abrir-papeles";
import { pedirPasoAlAbrir } from "./hooks/loth-plan-paso-pedido";

export default function LothPlanPaneles({
  v,
  plan,
  reloadSignal = 0,
  onVerGuia,
}: {
  v: VistaPlan;
  plan: NonNullable<VistaPlan["plan"]>;
  reloadSignal?: number;
  /** Abre una guía en «Guías» (por su N°). */
  onVerGuia?: (gtfNumber: string) => void;
}) {
  const {
    d, trees, zafra, esPlantacion, pestana, setPestana, pestanas, pestanasPlantacion, setEditandoPlan,
    conPeriodo, pedirEspecie, pedidoEspecie, pedidoLote, importarSignal, docs, onCambioDelLibro,
  } = v;
  /* «Saldo que no se pasa» (24-10): se relee con el libro y tras atar o crear un plan. */
  const [atados, setAtados] = useState(0);
  const version = reloadSignal * 1000 + atados;
  /* Las GTF preliminares (25-10) vienen con el saldo; guardar una relee sólo el saldo. */
  const [preliminares, setPreliminares] = useState(0);
  const saldo = useSaldoDelPlan(plan.id, version * 1000 + preliminares, true, true);
  const pestanaDelSaldo: PestanaPlan = esPlantacion ? "registro" : "avance";
  /* «Corregir» de un bloque que se pasa (25-10): a sus preliminares, resaltadas. */
  const irA = useIrAPreliminares(() => setPestana(pestanaDelSaldo));
  const porBloque = saldo.dato?.preliminares?.porBloque;
  const bloques: SaldoDeLosBloquesProps = { porBloque, onVerPreliminares: irA.ir, onRepartoCambio: () => setPreliminares((n) => n + 1) };
  const saldoGrande = (
    <>
      <LothPlanSaldoGrande lectura={saldo} onVerGuia={onVerGuia} onCambio={() => trasAtar()} />
      <LothPlanPreliminares planId={plan.id} dato={saldo.dato} onCambio={() => setPreliminares((n) => n + 1)} resaltadas={irA.resaltadas} />
    </>
  );
  /* El semáforo (Brandon 24-10): el mismo de la cabecera; acá, lo que se arregla. */
  const semaforo = useSemaforoDelPlanAbierto(plan, {
    especies: d.saldoFallo ? null : d.cascada.especies,
    papeles: v.papelesSemaforo,
    species: d.species,
    listo: true,
    firma: reloadSignal,
  });
  const hayPapeles = (esPlantacion ? pestanasPlantacion : pestanas).some((p) => p.id === PESTANA_PAPELES);
  const trasAtar = () => {
    void d.loadPlans();
    /* Dentro del libro, releerlo sube `reloadSignal`: eso ya relee el detalle y el saldo. */
    if (onCambioDelLibro) onCambioDelLibro();
    else {
      setAtados((n) => n + 1);
      void d.loadDetail(plan.id);
    }
  };
  return (
    <>
      {/* Todos los avisos en una franja (26-10): lo rojo a la vista, el resto
          plegado en una línea con su resumen. */}
      <LothPlanAvisosFranja>
      {/* El plazo de 15 días es del libro entero, no de este plan (B5): va aparte, arriba. */}
      <LothPlazosDelLibroAviso firma={reloadSignal} />
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
        semaforo={semaforo}
        onCompletarFicha={(paso) => {
          pedirPasoAlAbrir(paso);
          setEditandoPlan(true);
        }}
        /* «Ver papeles» del aviso: la pestaña Papeles, con el foco en ella. */
        onVerPapeles={hayPapeles ? () => {
          setPestana(PESTANA_PAPELES);
          requestAnimationFrame(() => {
            const tab = document.getElementById(idTab(PESTANA_PAPELES));
            tab?.focus({ preventScroll: true });
            tab?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
        } : undefined}
      />

      <LothPlanBloquesExcesoAviso excesos={porBloque?.excesos} onVer={(ids) => irA.ir(ids, true)} />
      <LothPlanPreliminaresAviso guias={saldo.dato?.preliminares?.guias} onVer={() => irA.ir()} />

      <LothPlanSinPlan version={version} onCambio={trasAtar} onVerGuia={onVerGuia} />
      </LothPlanAvisosFranja>

      <LothPlanPestanas pestanas={esPlantacion ? pestanasPlantacion : pestanas} activa={pestana} onCambiar={setPestana} />

      {esPlantacion && (
        <Panel id="registro" activa={pestana}>
          {saldoGrande}
          <LothPlantacionRegistro
            plan={plan}
            species={d.species}
            cascada={d.cascada}
            sugeridas={d.especiesSinRegistrar}
            onEditarPlan={() => setEditandoPlan(true)}
            onCambio={() => d.loadDetail(plan.id)}
            bloques={bloques}
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
            {saldoGrande}
            {/* Por bloque o zona (25-10): en bosque natural, sólo si el plan tiene reparto. */}
            <LothPlantacionBloques planId={plan.id} species={d.species} soloConBloques {...bloques} />
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
          <PestanaPapeles v={v} plan={plan} />
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
