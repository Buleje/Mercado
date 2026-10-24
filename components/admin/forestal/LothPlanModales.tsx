"use client";

/**
 * Los dos formularios del plan de `LothPlanView`: el alta («Nuevo plan de
 * manejo») y la corrección del plan elegido. Salieron tal cual de la vista.
 */

import { FileText } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { permisoConSigla } from "@/lib/forestal/loth-tipos-plan";
import LothBorrarOperacionesModal from "./LothBorrarOperacionesModal";
import LothPlanForm from "./LothPlanForm";
import type { VistaPlan } from "./hooks/use-loth-plan-view";

export default function LothPlanModales({ v }: { v: VistaPlan }) {
  const {
    d, plan, esPlantacion, editandoPlan, setEditandoPlan, cerrarFormulario, onEstadoCierre, docs, setPestanaPlantacion,
    borrandoOperaciones, setBorrandoOperaciones, onCambioDelLibro,
  } = v;
  return (
    <>
      {/* El plan es la base maestra del libro: se carga en un modal enfocado, no
          en un panel que empuja el resto de la pestaña fuera de la vista. */}
      <AdminModal
        open={d.showPlanForm}
        onClose={() => void cerrarFormulario(() => d.setShowPlanForm(false))}
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
            onClose={() => void cerrarFormulario(() => d.setShowPlanForm(false))}
            /* El plan recién creado queda elegido: una plantación se crea para
               ver su «Registro y saldo», no para volver al plan de antes. */
            onSaved={(id) => { d.setShowPlanForm(false); if (id) d.mostrarPlanNuevo(id); d.loadPlans(); }}
            onEstadoCierre={onEstadoCierre}
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
        onClose={() => void cerrarFormulario(() => { setEditandoPlan(false); void docs.recargar(); })}
        title={esPlantacion ? "Editar registro de plantación" : "Editar plan de manejo"}
        description={plan ? `${permisoConSigla(plan.planType, plan.planNumber)} — ${plan.titularName}` : ""}
        icon={FileText}
        variant="info"
      >
        {editandoPlan && plan && (
          <LothPlanForm
            plan={plan}
            onClose={() => void cerrarFormulario(() => { setEditandoPlan(false); void docs.recargar(); })}
            onSaved={() => { setEditandoPlan(false); d.loadPlans(); void docs.recargar(); }}
            onEstadoCierre={onEstadoCierre}
            planesPrevios={d.plans}
            onIrARegistro={() => { setEditandoPlan(false); void docs.recargar(); setPestanaPlantacion("registro"); }}
          />
        )}
      </AdminModal>

      {/* Borrar las operaciones del libro de ESTE plan: al terminar se relee
          (balance, avance, censo con los árboles que volvieron, la lista). */}
      {borrandoOperaciones && plan && (
        <LothBorrarOperacionesModal
          plan={plan}
          onClose={() => setBorrandoOperaciones(false)}
          onBorrado={() => {
            setBorrandoOperaciones(false);
            /* Desde el libro, relee todo (el `reloadSignal` relee también el plan); suelta, sólo el plan. */
            if (onCambioDelLibro) onCambioDelLibro();
            else void d.loadDetail(plan.id);
          }}
        />
      )}
    </>
  );
}
