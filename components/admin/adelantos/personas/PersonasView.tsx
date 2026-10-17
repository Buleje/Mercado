"use client";

/**
 * Personas de Adelantos — la libreta: a quién le das (o te da) plata.
 *
 * 11-10 (patrón del panel): título · Indicadores plegables · Nueva persona ·
 * «⋯» en una fila; buscador, situación y orden en otra, pegada a la tabla; cada
 * persona una fila (`FilaPersona`) con Entregar a la vista y lo demás en «⋯».
 * Antes: tarjetas de tres en fondo, una banda de totales aparte y el CSV como
 * botón suelto (1,96 pantallas, 42 botones bajos con 12 personas).
 * Movido desde AdelantosModule (que pasaba las 1 000 líneas); la lógica de
 * filtro, orden, totales y modales es la misma.
 */

import { useEffect, useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, Coins, Download, MoreHorizontal, Plus, Search, TrendingUp, Users, Wallet } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { button } from "@/components/ui-system/button-variants";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { paginar } from "@/lib/adelantos/ordenar-lista";
import { cumpleFiltro, ordenarPersonas, type FiltroPersonas, type OrdenPersonas } from "@/lib/adelantos/ordenar-personas";
import { descargarCsvPersonas } from "@/lib/adelantos/exportar-csv";
import { cuentaDePersona } from "@/lib/adelantos/modos-alta";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import CrearAdelantoModal from "../CrearAdelantoModal";
import DetalleAdelantoModal from "../detalle/DetalleAdelantoModal";
import { EmptyState, SkeletonGrid, fmtMonedas, sinTildes } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";
import CrearPersonaModal from "./CrearPersonaModal";
import EliminarPersonaModal from "./EliminarPersonaModal";
import FichaPersonaModal from "./FichaPersonaModal";
import FilaPersona from "./FilaPersona";

/** Personas por página: 12 filas entran en una pantalla y media a 1280×900. */
const PERSONAS_POR_PAGINA = 12;

export default function PersonasView({
  beneficiarios,
  adelantos,
  admiteRecibido,
  loading,
  onChange,
  onEntregar,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  adelantos: DbAdelanto[];
  admiteRecibido: boolean;
  loading: boolean;
  onChange: () => void;
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
  const [orden, setOrden] = useState<OrdenPersonas>("saldo");
  const [filtro, setFiltro] = useState<FiltroPersonas>("todas");
  const [pagina, setPagina] = useState(1);

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

  const ordenados = useMemo(() => ordenarPersonas(filtradas, orden), [filtradas, orden]);
  const pag = paginar(ordenados, pagina, PERSONAS_POR_PAGINA);

  /** Cambiar de filtro con la página 4 abierta dejaba una grilla en blanco. */
  useEffect(() => setPagina(1), [q, orden, filtro]);

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
  const hayTopes = beneficiarios.some((b) => (b.limiteCredito ?? 0) > 0);
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

  /* h-12 (patrón del panel): eran chips de 40 px. */
  const chip = (activo: boolean) =>
    `h-12 shrink-0 px-3.5 rounded-xl border-2 text-sm font-bold transition-colors ${
      activo
        ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
    }`;

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
                id: "csv",
                label: "Descargar CSV",
                hint: `Las ${ordenados.length} personas que ves (con filtro y búsqueda)`,
                icon: Download,
                disabled: ordenados.length === 0,
                onSelect: () => descargarCsvPersonas(ordenados, `personas-${new Date().toISOString().slice(0, 10)}.csv`),
              },
            ]}
          />
        </div>
      </div>

      {beneficiarios.length > 0 && kpis.panel}

      {beneficiarios.length > 0 && (
        /* Buscador + situación + orden en UNA fila, pegada a la tabla. */
        <div className="flex flex-wrap items-center gap-2">
          {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
          <div className="relative flex-1 sm:max-w-sm" style={{ minWidth: 240 }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, documento o teléfono…"
              aria-label="Buscar persona"
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por situación">
            <button type="button" aria-pressed={filtro === "todas"} className={chip(filtro === "todas")} onClick={() => setFiltro("todas")}>
              Todas {beneficiarios.length}
            </button>
            {conSaldo > 0 && (
              <button type="button" aria-pressed={filtro === "deben"} className={chip(filtro === "deben")} onClick={() => setFiltro("deben")}>
                Deben {conSaldo}
              </button>
            )}
            <button type="button" aria-pressed={filtro === "al-dia"} className={chip(filtro === "al-dia")} onClick={() => setFiltro("al-dia")}>
              Al día {beneficiarios.length - conSaldo}
            </button>
            {/* Sólo si hay topes cargados: un filtro que siempre da cero
                enseña a no confiar en los filtros. */}
            {hayTopes && enRiesgo > 0 && (
              <button type="button" aria-pressed={filtro === "riesgo"} className={chip(filtro === "riesgo")} onClick={() => setFiltro("riesgo")}>
                Sin margen {enRiesgo}
              </button>
            )}
          </div>
          {/* El orden, en un desplegable: las mismas seis opciones de siempre. */}
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as OrdenPersonas)}
            aria-label="Ordenar personas por"
            title="Ordenar por"
            className="ml-auto h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary"
          >
            <option value="saldo">Orden: saldo</option>
            {hayTopes && <option value="riesgo">Orden: cerca del tope</option>}
            <option value="nombre">Orden: nombre</option>
            <option value="adelantado">Orden: adelantado</option>
            <option value="cumplimiento">Orden: quien menos devolvió</option>
            <option value="reciente">Orden: último adelanto</option>
          </select>
        </div>
      )}

      {loading && beneficiarios.length === 0 ? (
        <SkeletonGrid />
      ) : beneficiarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin personas" hint="Agrega a quién le das adelantos." />
      ) : ordenados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" hint="Prueba con otro nombre, documento o filtro." />
      ) : (
        <>
          <DataTable zebra className="[&_tbody_td]:py-1.5">
            <thead>
              <tr>
                <th>Persona</th>
                <th className="text-right">Adelantado</th>
                <th className="text-right">Te debe</th>
                <th>Cumplimiento</th>
                <th>Estado</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {pag.items.map((b) => (
                <FilaPersona
                  key={b.id}
                  persona={b}
                  onVerFicha={() => setFicha(b)}
                  onEditar={() => setEditPersona(b)}
                  onEliminar={() => setDeletePersona(b)}
                  onAdelanto={() => setAdelantoPara(b.id)}
                  onEntregar={onEntregar ? () => onEntregar(b) : undefined}
                />
              ))}
            </tbody>
          </DataTable>
          {pag.totalPaginas > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                {pag.desde}–{pag.hasta} de {pag.total}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPagina(pag.pagina - 1)}
                  disabled={pag.pagina <= 1}
                  aria-label="Página anterior"
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                  {pag.pagina} / {pag.totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina(pag.pagina + 1)}
                  disabled={pag.pagina >= pag.totalPaginas}
                  aria-label="Página siguiente"
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
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
          onClose={() => setAdelantoPara(null)}
          onCreated={() => { setAdelantoPara(null); onChange(); }}
        />
      )}
      {ficha && (
        <FichaPersonaModal
          persona={ficha}
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
