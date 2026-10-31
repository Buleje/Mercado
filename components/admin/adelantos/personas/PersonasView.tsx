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
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SectionTitle } from "@buleje/design-system";
import { Coins, Download, FileSpreadsheet, MoreHorizontal, Plus, Search, TrendingUp, Users, Wallet } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { button } from "@/components/ui-system/button-variants";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { COLUMNAS_FILTRO_PERSONAS } from "../filtros-columnas-tablas";
import { FILTROS, cumpleFiltro, ordenarPersonasEnSentido, type FiltroPersonas } from "@/lib/adelantos/ordenar-personas";
import { descargarCsvPersonas, personasAFilasExcel } from "@/lib/adelantos/exportar-csv";
import { useOrdenPersonas } from "../hooks/use-orden-personas";
import { cuentaDePersona } from "@/lib/adelantos/modos-alta";
import { faltaTelefono, faltanDatos } from "@/lib/adelantos/datos-persona";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import CrearAdelantoModal from "../CrearAdelantoModal";
import DetalleAdelantoModal from "../detalle/DetalleAdelantoModal";
import { EmptyState, SkeletonGrid, fmtMonedas, sinTildes } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";
import CompletarDatosModal from "./CompletarDatosModal";
import CrearPersonaModal from "./CrearPersonaModal";
import EliminarPersonaModal from "./EliminarPersonaModal";
import FichaPersonaModal from "./FichaPersonaModal";
import BarraPersonas from "./BarraPersonas";
import TablaPersonas from "./TablaPersonas";

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

  /**
   * Se busca por nombre, documento Y teléfono, sin tildes: antes sólo por
   * nombre y con acento exacto, así que «maria» no encontraba a «María» y un
   * número de teléfono a mano no servía para nada.
   */
  const filtradas = useMemo(() => {
    const t = sinTildes(q);
    const soloDigitos = t.replace(/\D/g, "");
    return beneficiarios.filter((b) => {
      if (!cumpleFiltro(b, filtro)) return false;
      if (!t) return true;
      return (
        sinTildes(b.nombre).includes(t) ||
        (b.documento ?? "").includes(t) ||
        (!!soloDigitos && (b.telefono ?? "").replace(/\D/g, "").includes(soloDigitos))
      );
    });
  }, [beneficiarios, q, filtro]);

  const ordenados = useMemo(() => ordenarPersonasEnSentido(filtradas, orden, invertido), [filtradas, orden, invertido]);
  /* Los filtros tipo Excel del encabezado afinan lo que dejan el buscador y los chips. */
  const ft = useFiltrosTabla(ordenados, COLUMNAS_FILTRO_PERSONAS);

  /**
   * Los totales de la cartera, con la MISMA definición que la pestaña
   * Adelantos: los cancelados no se cobran. Antes acá se sumaba todo y las dos
   * pestañas mostraban cifras distintas para la misma pregunta.
   */
  /** Cada total ya viene por persona segmentado por moneda — mergear los mapas, no sumar números crudos. */
  const mergear = (map: Record<string, number>, otro: Record<string, number>) => {
    for (const [moneda, monto] of Object.entries(otro)) map[moneda] = (map[moneda] ?? 0) + monto;
  };
  const tot = beneficiarios.reduce(
    (acc, b) => {
      mergear(acc.adelantado, b.totalAdelantado);
      mergear(acc.entregado, b.totalEntregado);
      mergear(acc.porRecuperar, b.saldoPendiente);
      /* «Le debes» = entregó de más + lo que te dio y devuelves (ADR-448 §2.6). */
      mergear(acc.aFavor, cuentaDePersona(b).leDebes);
      return acc;
    },
    { adelantado: {} as Record<string, number>, entregado: {} as Record<string, number>, porRecuperar: {} as Record<string, number>, aFavor: {} as Record<string, number> },
  );
  const conSaldo = beneficiarios.filter((b) => Object.values(b.saldoPendiente).some((v) => v > 0)).length;
  const enRiesgo = beneficiarios.filter((b) => requiereAtencion(estadoDeCredito(b.limiteCredito, saldoParaLimite(b.saldoPendiente)))).length;
  const sinTelefono = beneficiarios.filter(faltaTelefono).length;
  const conDatosFaltantes = beneficiarios.filter(faltanDatos).length;
  const hayTopes = beneficiarios.some((b) => (b.limiteCredito ?? 0) > 0);

  /** Si ya no queda nadie sin teléfono/datos, el filtro se apaga solo (no deja la lista vacía). */
  useEffect(() => {
    if (beneficiarios.length > 0 && ((filtro === "sin-telefono" && sinTelefono === 0) || (filtro === "faltan-datos" && conDatosFaltantes === 0))) setFiltro("todas");
  }, [filtro, sinTelefono, conDatosFaltantes, beneficiarios.length]);
  const hayLeDebes = Object.values(tot.aFavor).some((v) => v > 0);

  const kpis = useKpisPlegables({
    claveMemoria: "adelantos-personas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && beneficiarios.length === 0,
    resumen: `${conSaldo} de ${beneficiarios.length} te deben`,
    tarjetas: [
      <TarjetaIndicador key="recuperar" rotulo="Por recuperar" valor={fmtMonedas(tot.porRecuperar)} detalle={`${conSaldo} persona${conSaldo === 1 ? "" : "s"} con saldo`} icono={Wallet} tono="destacado" />,
      <TarjetaIndicador key="adelantado" rotulo="Adelantado" valor={fmtMonedas(tot.adelantado)} detalle="Sin los cancelados" icono={Coins} />,
      <TarjetaIndicador key="devuelto" rotulo="Devuelto" valor={fmtMonedas(tot.entregado)} detalle="En entregas y pagos" icono={TrendingUp} />,
      ...(hayLeDebes ? [<TarjetaIndicador key="le-debes" rotulo="Le debes" valor={fmtMonedas(tot.aFavor)} detalle="Te pagaron antes o te entregaron de más" icono={Users} />] : []),
    ],
  });

  /* «Bajar a Excel» (30-10): lo que ves, con las mismas columnas del CSV y las cifras como número. */
  const bajarExcel = async () => {
    try {
      const { exportToExcel } = await import("@/lib/export-excel");
      await exportToExcel(personasAFilasExcel(ft.filtradas), `personas-${new Date().toISOString().slice(0, 10)}`, "Personas");
    } catch (err) {
      logger.error("[personas] no se pudo armar el Excel", { error: String(err) });
      toast.error("No se pudo bajar el Excel. Inténtalo otra vez.");
    }
  };

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
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {beneficiarios.length > 0 && kpis.boton}
          <button type="button" onClick={() => setShowCreate(true)} className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl px-4" })}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva<span className="max-sm:hidden"> persona</span>
          </button>
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            actions={[
              {
                id: "excel",
                label: "Bajar a Excel",
                hint: `Las ${ft.filtradas.length} personas que ves, con sus cifras`,
                icon: FileSpreadsheet,
                disabled: ft.filtradas.length === 0,
                onSelect: () => void bajarExcel(),
              },
              {
                id: "csv",
                label: "Descargar CSV",
                hint: `Las ${ft.filtradas.length} personas que ves (con filtro y búsqueda)`,
                icon: Download,
                disabled: ft.filtradas.length === 0,
                onSelect: () => descargarCsvPersonas(ft.filtradas, `personas-${new Date().toISOString().slice(0, 10)}.csv`),
              },
            ]}
          />
        </div>
      </div>

      {beneficiarios.length > 0 && kpis.panel}

      {beneficiarios.length > 0 && (
        <BarraPersonas
          q={q}
          onQ={setQ}
          filtro={filtro}
          onFiltro={setFiltro}
          orden={orden}
          onOrden={elegirOrden}
          cuentas={{ todas: beneficiarios.length, deben: conSaldo, riesgo: enRiesgo, sinTelefono, faltanDatos: conDatosFaltantes, hayTopes }}
        />
      )}

      {loading && beneficiarios.length === 0 ? (
        <SkeletonGrid />
      ) : beneficiarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin personas" hint="Agrega a quién le das adelantos." />
      ) : ordenados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Prueba con otro nombre, documento o filtro." />
      ) : (
        <>
          <TablaPersonas
            ft={ft}
            orden={ordenColumnas}
            hayTopes={hayTopes}
            reinicio={JSON.stringify([q, orden, invertido, filtro, ft.facetas, ft.textos])}
            onVerFicha={setFicha}
            onEditar={setEditPersona}
            onEliminar={setDeletePersona}
            onAdelanto={(b) => setAdelantoPara(b.id)}
            onEntregar={onEntregar}
            onCompletar={setCompletar}
          />
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
