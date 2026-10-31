"use client";

/**
 * Personas de Adelantos — la libreta: a quién le das (o te da) plata.
 *
 * 11-10 (patrón del panel): título · Indicadores plegables · Nueva persona ·
 * «⋯» en una fila; buscador y situación pegados a la tabla (orden: encabezados, 30-10); cada
 * persona una fila (`FilaPersona`) con Entregar a la vista y lo demás en «⋯».
 * Antes: tarjetas de tres en fondo, una banda de totales aparte y el CSV como
 * botón suelto (1,96 pantallas, 42 botones bajos con 12 personas).
 * Movido desde AdelantosModule (que pasaba las 1 000 líneas); la lógica de
 * filtro, orden, totales y modales es la misma.
 *
 * 30-10: chips por tipo (Choferes, Proveedores…) que recortan la tabla Y los
 * indicadores, y «Completar datos» en lote (⋯ o el chip «Faltan datos»): las
 * personas sin DNI/RUC, celular o tipo en una lista para escribir de corrido.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SectionTitle } from "@buleje/design-system";
import { Plus, Search, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { COLUMNAS_FILTRO_PERSONAS } from "../filtros-columnas-tablas";
import {
  FILTROS,
  cuentasPorTipo,
  cumpleTipo,
  filtrarPersonas,
  ordenarPersonasEnSentido,
  type FiltroPersonas,
  type FiltroTipo,
} from "@/lib/adelantos/ordenar-personas";
import { faltaParaCompletar } from "@/lib/adelantos/datos-persona";
import { useOrdenPersonas } from "../hooks/use-orden-personas";
import { useIndicadoresPersonas } from "../hooks/use-indicadores-personas";
import { usePuedeEditarAdelantos } from "../hooks/use-puede-editar-adelantos";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import CrearAdelantoModal from "../CrearAdelantoModal";
import DetalleAdelantoModal from "../detalle/DetalleAdelantoModal";
import { EmptyState, SkeletonGrid } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";
import CompletarDatosModal from "./CompletarDatosModal";
import CrearPersonaModal from "./CrearPersonaModal";
import EliminarPersonaModal from "./EliminarPersonaModal";
import FichaPersonaModal from "./FichaPersonaModal";
import BarraPersonas from "./BarraPersonas";
import MenuPersonas from "./MenuPersonas";
import TablaPersonas from "./TablaPersonas";
import CompletarLote from "./completar-lote/CompletarLote";

export default function PersonasView({
  beneficiarios,
  adelantos,
  admiteRecibido,
  loading,
  onChange,
  onRegistrado,
  onEntregar,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  adelantos: DbAdelanto[];
  admiteRecibido: boolean;
  loading: boolean;
  onChange: () => void;
  /** Adelanto guardado con la ventana abierta: el saldo de la fila se pone al día ya. */
  onRegistrado?: (id: string | null) => void;
  /** «Entregar» (ADR-491) con la persona ya elegida. */
  onEntregar?: (b: BeneficiarioConSaldo) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editPersona, setEditPersona] = useState<BeneficiarioConSaldo | null>(null);
  const [deletePersona, setDeletePersona] = useState<BeneficiarioConSaldo | null>(null);
  const [adelantoPara, setAdelantoPara] = useState<string | null>(null);
  const [ficha, setFicha] = useState<BeneficiarioConSaldo | null>(null);
  const [detalleAdelanto, setDetalleAdelanto] = useState<DbAdelanto | null>(null);
  const [q, setQ] = useState("");
  /* El orden se elige en los encabezados de la tabla (30-10). */
  const { orden, invertido, columnas: ordenColumnas, elegir: elegirOrden } = useOrdenPersonas();
  /* `?filtro=sin-telefono` (lo enlaza el Resumen) abre la libreta ya filtrada. */
  const filtroUrl = useSearchParams().get("filtro");
  const [filtro, setFiltro] = useState<FiltroPersonas>(
    (FILTROS as readonly string[]).includes(filtroUrl ?? "") ? (filtroUrl as FiltroPersonas) : "todas",
  );
  useEffect(() => {
    if (filtroUrl && (FILTROS as readonly string[]).includes(filtroUrl)) setFiltro(filtroUrl as FiltroPersonas);
  }, [filtroUrl]);
  const [completar, setCompletar] = useState<BeneficiarioConSaldo | null>(null);
  const [tipo, setTipo] = useState<FiltroTipo | null>(null);
  const [completando, setCompletando] = useState(false);
  /* Sin el permiso de editar adelantos (el analista) no se ofrece el lote. */
  const puedeEditar = usePuedeEditarAdelantos();
  const abrirLote = puedeEditar ? () => setCompletando(true) : undefined;

  /* Los chips por tipo cuentan sobre TODAS; si nadie tiene tipo, no se muestran. */
  const cuentasTipo = useMemo(() => cuentasPorTipo(beneficiarios), [beneficiarios]);
  const hayTipos = cuentasTipo["sin-tipo"] < beneficiarios.length;
  /** El tipo elegido que se quedó sin nadie se apaga solo (no deja la lista vacía). */
  useEffect(() => {
    if (tipo && beneficiarios.length > 0 && (!hayTipos || cuentasTipo[tipo] === 0)) setTipo(null);
  }, [tipo, hayTipos, cuentasTipo, beneficiarios.length]);
  /* Con un tipo elegido, la tabla, los chips de situación y los indicadores hablan sólo de ese tipo. */
  const delTipo = useMemo(() => beneficiarios.filter((b) => cumpleTipo(b, tipo)), [beneficiarios, tipo]);
  /* Por nombre (sin tildes), documento y teléfono (sólo dígitos): `coincideBusqueda`. */
  const filtradas = useMemo(() => filtrarPersonas(delTipo, { filtro, tipo: null, q }), [delTipo, filtro, q]);
  const ordenados = useMemo(() => ordenarPersonasEnSentido(filtradas, orden, invertido), [filtradas, orden, invertido]);
  /* Los filtros tipo Excel del encabezado afinan lo que dejan el buscador y los chips. */
  const ft = useFiltrosTabla(ordenados, COLUMNAS_FILTRO_PERSONAS);
  const { kpis, cuentas } = useIndicadoresPersonas(delTipo, { cargando: loading && beneficiarios.length === 0, tipo });
  const paraCompletar = useMemo(() => beneficiarios.filter(faltaParaCompletar).length, [beneficiarios]);

  /** Si ya no queda nadie sin teléfono/datos, el filtro se apaga solo (no deja la lista vacía). */
  useEffect(() => {
    if (delTipo.length > 0 && ((filtro === "sin-telefono" && cuentas.sinTelefono === 0) || (filtro === "faltan-datos" && cuentas.faltanDatos === 0))) setFiltro("todas");
  }, [filtro, cuentas.sinTelefono, cuentas.faltanDatos, delTipo.length]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Personas</SectionTitle>
          <InfoTip
            title="Personas"
            what="A quién le das adelantos (o quién te los da a ti), con lo que te debe, cuánto devolvió y su tope. Toca el nombre para ver su ficha."
            affects="«Entregar» abre la entrega rápida con la persona ya elegida (monto y firma en un paso). El formulario completo (cuotas, permiso) está en «⋯»."
            example="Juan sacó S/ 1,000 y devolvió S/ 700 en madera: cumplimiento 70 %, te debe S/ 300."
          />
        </div>
        {!completando && (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {beneficiarios.length > 0 && kpis.boton}
            <button type="button" onClick={() => setShowCreate(true)} className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl px-4" })}>
              <Plus className="h-4 w-4" aria-hidden /> Nueva<span className="max-sm:hidden"> persona</span>
            </button>
            <MenuPersonas visibles={ft.filtradas} paraCompletar={paraCompletar} onCompletar={abrirLote} />
          </div>
        )}
      </div>

      {completando ? (
        <CompletarLote personas={beneficiarios} onGuardado={onChange} onSalir={() => setCompletando(false)} />
      ) : (
        <>
          {beneficiarios.length > 0 && kpis.panel}

          {beneficiarios.length > 0 && (
            <BarraPersonas
              q={q}
              onQ={setQ}
              filtro={filtro}
              onFiltro={setFiltro}
              orden={orden}
              onOrden={elegirOrden}
              cuentas={cuentas}
              tipo={tipo}
              onTipo={setTipo}
              cuentasTipo={hayTipos ? cuentasTipo : null}
              onCompletarLote={abrirLote}
            />
          )}

          {loading && beneficiarios.length === 0 ? (
            <SkeletonGrid />
          ) : beneficiarios.length === 0 ? (
            <EmptyState icon={Users} title="Sin personas" hint="Agrega a quién le das adelantos." />
          ) : ordenados.length === 0 ? (
            <EmptyState icon={Search} title="Sin resultados" hint="Prueba con otro nombre, documento o filtro." />
          ) : (
            <TablaPersonas
              ft={ft}
              orden={ordenColumnas}
              hayTopes={cuentas.hayTopes}
              reinicio={JSON.stringify([q, orden, invertido, filtro, tipo, ft.facetas, ft.textos])}
              onVerFicha={setFicha}
              onEditar={setEditPersona}
              onEliminar={setDeletePersona}
              onAdelanto={(b) => setAdelantoPara(b.id)}
              onEntregar={onEntregar}
              onCompletar={setCompletar}
            />
          )}
        </>
      )}

      {showCreate && (
        <CrearPersonaModal
          personasExistentes={beneficiarios}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); onChange(); }}
        />
      )}
      {editPersona && (
        <CrearPersonaModal
          persona={editPersona}
          personasExistentes={beneficiarios}
          onClose={() => setEditPersona(null)}
          onCreated={() => { setEditPersona(null); onChange(); }}
        />
      )}
      {completar && (
        <CompletarDatosModal persona={completar} onClose={() => setCompletar(null)} onGuardado={() => { setCompletar(null); onChange(); }} />
      )}
      {deletePersona && (
        <EliminarPersonaModal persona={deletePersona} onClose={() => setDeletePersona(null)} onDeleted={() => { setDeletePersona(null); onChange(); }} />
      )}
      {adelantoPara && (
        <CrearAdelantoModal
          beneficiarios={beneficiarios}
          adelantos={adelantos}
          admiteRecibido={admiteRecibido}
          initialBeneficiarioId={adelantoPara}
          onPersonaCreada={onChange}
          onRegistrado={onRegistrado}
          onClose={() => setAdelantoPara(null)}
          onCreated={() => { setAdelantoPara(null); onChange(); }}
        />
      )}
      {ficha && (
        <FichaPersonaModal
          persona={beneficiarios.find((b) => b.id === ficha.id) ?? ficha}
          onCambio={onChange}
          adelantos={adelantos}
          onClose={() => setFicha(null)}
          onEditar={() => { setEditPersona(ficha); setFicha(null); }}
          onNuevoAdelanto={() => { setAdelantoPara(ficha.id); setFicha(null); }}
          onVerAdelanto={(a) => { setDetalleAdelanto(a); setFicha(null); }}
        />
      )}
      {detalleAdelanto && (
        <DetalleAdelantoModal
          adelantoId={detalleAdelanto.id}
          onClose={() => setDetalleAdelanto(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
