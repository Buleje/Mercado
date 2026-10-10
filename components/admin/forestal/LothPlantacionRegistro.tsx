"use client";

/**
 * «Registro y saldo»: la pestaña principal del plan de una PLANTACIÓN (ADR-459).
 *
 * Brandon (2-10-2026): «con esos m³ y especie se trabaja […] de acuerdo a los
 * procesos se descontará el volumen». Una plantación no se censa árbol por
 * árbol para tener saldo: su base es lo que dice el registro, especie por
 * especie. Esta pestaña contesta, de arriba abajo:
 *
 *   1. ¿Qué registro es?            → tarjeta compacta con «Editar».
 *   2. ¿Cuánto queda y dónde está?  → una fila por especie con la cascada
 *      (registrado → talado → en pie → sin trozar → patio → despachado),
 *      corregible en la misma fila.
 *   3. ¿Falta algo?                 → si no hay especies, lo dice en una frase
 *      y ofrece las que ya aparecen en los árboles marcados, sin tipearlas.
 */

import { useState } from "react";
import { CalendarClock, Loader2, MapPin, Pencil, Plus, TreePine } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { CascadaEspecie, CascadaPlan } from "@/lib/forestal/loth-saldo-cascada";
import { Btn } from "./ctp-shared";
import LothPlanFormPlantacion from "./LothPlanFormPlantacion";
import LothPlantacionTabla, { cambiosDeFila } from "./LothPlantacionTabla";
import { BloquePlan } from "./loth-plan-ui";
import { AvisoTaladoSinRegistrar, SugeridasRegistroVacio, type EspecieSugerida } from "./LothPlantacionSugeridas";
import { fmtFecha, fmtRange, type Plan, type Species } from "./loth-plan-shared";
import {
  aEspecieParaGuardar,
  agregarVarias,
  corregirEspecie,
  especiesRepetidas,
  filaEnBlanco,
  filaVacia,
  problemaDeFila,
  quitarEspecie,
  type FilaEspecie,
} from "./loth-plan-especies-api";

export type { EspecieSugerida } from "./LothPlantacionSugeridas";

export default function LothPlantacionRegistro({ plan, species, cascada, sugeridas, onEditarPlan, onCambio }: {
  plan: Plan;
  species: Species[];
  cascada: CascadaPlan;
  sugeridas: readonly EspecieSugerida[];
  onEditarPlan: () => void;
  /** Después de agregar, corregir o quitar: recargar el detalle del plan. */
  onCambio: () => void;
}) {
  const [agregando, setAgregando] = useState<FilaEspecie[] | null>(null);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { confirm } = useConfirm();

  const abrirAgregar = (desde: readonly EspecieSugerida[] = []) => {
    setIntento(false);
    setAgregando(desde.length > 0 ? desde.map((s) => filaVacia(s.nombre, s.cientifico)) : [filaVacia()]);
  };

  async function guardarNuevas() {
    if (!agregando) return;
    setIntento(true);
    const conDatos = agregando.filter((f) => !filaEnBlanco(f));
    const yaEstan = species.map((s) => s.speciesCommon);
    if (conDatos.length === 0 || conDatos.some((f) => problemaDeFila(f)) || especiesRepetidas(conDatos, yaEstan).length > 0) return;
    setGuardando(true);
    const { guardadas, errores, fallidas } = await agregarVarias(plan.id, conDatos.map(aEspecieParaGuardar));
    setGuardando(false);
    if (guardadas > 0) onCambio();
    if (errores.length > 0) {
      toast.error(errores.join(" · "));
      /* Las que entraron salen de la lista: reintentar no las duplica. */
      setAgregando(conDatos.filter((_, i) => fallidas.includes(i)));
      return;
    }
    toast.success(guardadas === 1 ? "Especie agregada al registro" : `${guardadas} especies agregadas al registro`);
    setAgregando(null);
  }

  async function guardar(id: string, fila: FilaEspecie): Promise<string | null> {
    const r = await corregirEspecie(id, cambiosDeFila(fila));
    if (!r.ok) return r.error;
    onCambio();
    return null;
  }

  async function quitar(s: Species, c: CascadaEspecie | null) {
    const talado = c?.taladoM3 ?? 0;
    const ok = await confirm({
      title: `¿Quitar ${s.speciesCommon} del registro?`,
      description:
        `Se quitan ${formatNumber(Number(s.volumenAutorizadoM3 ?? 0), 3)} m³ registrados.` +
        (talado > 0
          ? ` Ya se talaron ${formatNumber(talado, 3)} m³ de esta especie: sin ella, esas talas quedan sin base contra qué descontar.`
          : " No tiene talas: se puede quitar sin dejar nada suelto."),
      intent: "danger",
      confirmLabel: "Sí, quitarla",
    });
    if (!ok) return;
    const r = await quitarEspecie(s.id, s.speciesCommon);
    if (!r.ok) { toast.error(r.error); return; }
    onCambio();
  }

  const n = species.length;
  return (
    <div className="space-y-4" data-plantacion-registro>
      <FichaDelRegistro plan={plan} onEditar={onEditarPlan} />

      <BloquePlan
        id="loth-plantacion-saldo"
        titulo="Especies y saldo"
        sub={
          n > 0 ? (
            <>
              <span className="font-mono tabular-nums">{n}</span> {n === 1 ? "especie" : "especies"} ·{" "}
              <span className="font-mono tabular-nums">{formatNumber(cascada.total.baseM3, 3)}</span> m³ registrados
            </>
          ) : undefined
        }
        acciones={
          <>
            <InfoTip
              title="Especies y saldo"
              what="Cada proceso del libro mueve el volumen de un casillero al siguiente: la tala lo saca de «en pie», el trozado lo lleva al patio y el despacho lo saca del predio."
              affects="La misma madera pasa por los tres procesos: los casilleros no se suman entre sí. En rojo, la especie que ya se taló o despachó por encima de lo registrado."
              example="Bolaina: 120 registrados, 30 talados → 90 en pie; de esos 30, 25 trozados → 5 sin trozar; 10 despachados → 15 en patio."
            />
            <Btn variant="primary" size="sm" onClick={() => abrirAgregar()}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar especie
            </Btn>
          </>
        }
      >
        <div className="p-3">
          {n > 0 ? (
            <div className="space-y-2">
              <AvisoTaladoSinRegistrar sugeridas={sugeridas} onAgregar={abrirAgregar} />
              <LothPlantacionTabla species={species} cascada={cascada} acciones={{ guardar, quitar: (s, c) => void quitar(s, c) }} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center">
              <TreePine className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden="true" />
              <p className="max-w-[34rem] text-base font-semibold text-[var(--text-primary)]">
                Este registro todavía no tiene especies: agrega la especie y sus m³ registrados para poder talar contra ellos.
              </p>
              <Btn variant="primary" onClick={() => abrirAgregar()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Agregar especie
              </Btn>
              {/* Lo que entra sin tipear: las especies que ya nombran el libro
                  o los árboles marcados de este plan. */}
              <SugeridasRegistroVacio sugeridas={sugeridas} onAgregar={abrirAgregar} />
            </div>
          )}
        </div>
      </BloquePlan>

      <AdminModal
        open={agregando != null}
        onClose={() => setAgregando(null)}
        title="Agregar especies al registro"
        description={`${plan.planNumber ?? "Registro de plantación"} — los m³ registrados de cada especie son la base del saldo.`}
        icon={TreePine}
        variant="info"
        footer={
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAgregando(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={() => void guardarNuevas()} disabled={guardando} aria-busy={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              Agregar al registro
            </Btn>
          </div>
        }
      >
        {agregando && (
          <div className="p-5">
            <LothPlanFormPlantacion
              filas={agregando}
              onFilas={setAgregando}
              mostrarErrores={intento}
              yaRegistradas={species.map((s) => s.speciesCommon)}
            />
          </div>
        )}
      </AdminModal>
    </div>
  );
}

/** Los datos del registro en una tarjeta: lo que se busca en el papel, sin leer párrafos. */
function FichaDelRegistro({ plan, onEditar }: { plan: Plan; onEditar: () => void }) {
  const ubicacion = [plan.region, plan.provincia, plan.distrito, plan.sector].filter(Boolean).join(" · ");
  const periodo = fmtRange(plan.vigenciaDesde, plan.vigenciaHasta);
  return (
    <BloquePlan
      id="loth-plantacion-ficha"
      titulo={<>Registro <span className="font-mono">{plan.planNumber ?? "sin código"}</span></>}
      acciones={
        <Btn size="sm" onClick={onEditar}>
          <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
        </Btn>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <Dato k="Constancia" v={plan.resolucionNumber} mono />
        <Dato k="Inscrito el" v={fmtFecha(plan.resolucionDate)} />
        <Dato k="Superficie" v={plan.areaHa ? `${formatNumber(Number(plan.areaHa), 2)} ha` : null} mono />
        <Dato k="Titular" v={plan.titularName} />
        <Dato k="Propietario" v={plan.propietarioNombre} omitirSiVacio />
        <Dato k="Autoridad" v={plan.arffs} />
        <Dato k="Ubicación" v={ubicacion || null} icono={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />} ancho />
        {periodo && <Dato k="Aprovechamiento" v={periodo} icono={<CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />} ancho />}
      </dl>
    </BloquePlan>
  );
}

function Dato({ k, v, mono, omitirSiVacio, icono, ancho }: {
  k: string;
  v: string | null | undefined;
  mono?: boolean;
  omitirSiVacio?: boolean;
  icono?: React.ReactNode;
  /** Ocupa dos casillas: una ubicación con cuatro partes no entra en una. */
  ancho?: boolean;
}) {
  const vacio = !v || !v.trim();
  if (vacio && omitirSiVacio) return null;
  return (
    <div className={`min-w-0 ${ancho ? "col-span-2" : ""}`}>
      <dt className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {icono}
        {k}
      </dt>
      <dd className={`break-words text-sm font-semibold ${vacio ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"} ${mono && !vacio ? "font-mono" : ""}`}>
        {vacio ? "—" : v}
      </dd>
    </div>
  );
}
