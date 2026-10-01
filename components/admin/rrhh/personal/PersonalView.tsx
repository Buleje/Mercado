"use client";

/**
 * PersonalView — la lista de personas (ADR-414 §7, vista `personal`).
 *
 * Filtros en la cabecera (convención del panel): el estado se recorta EN EL
 * CLIENTE sobre una lista ya traída con `incluirCesados=1` — así los chips de
 * estado no disparan un fetch por click, y los KPIs de arriba (que cuentan
 * TODO el personal) no dependen de qué chip esté activo.
 *
 * BUG arreglado (2026-09-14): `useRrhhColaboradores` pone `loading=true` en
 * cada cambio de `q`, y `if (loading) return <LoadingState/>` desmontaba TODA
 * la vista — el buscador perdía el foco en cada tecla. Ahora `qInput` (lo que
 * se tipea) vive aparte de `q` (lo que llega al hook), con 250ms de debounce
 * entre ambos; y el `LoadingState` de pantalla entera sólo corre en la
 * primera carga — en recargas la barra queda montada y la tabla se atenúa.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, QrCode, Search, UserPlus, Users } from "@buleje/design-system/icons";
import { DataTable, EmptyState, LoadingState, StatCard } from "@buleje/design-system";
import { useRrhhColaboradores } from "@/hooks/use-rrhh-colaboradores";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { useRrhhDesdeAdelantos } from "@/hooks/use-rrhh-desde-adelantos";
import { BOTON, CLASE_CAMPO, CLASE_CHIP, claseChipFiltro } from "../rrhh-form";
import { CLASE_FOCUS_FILA, COLABORADOR_ESTADO_META, filaClicableProps, formatearFecha } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import ColaboradorFormModal from "./ColaboradorFormModal";
import FotochecksVista from "./FotochecksVista";
import FichaColaboradorModal from "./FichaColaboradorModal";
import TraerDesdeAdelantosModal from "./TraerDesdeAdelantosModal";
import type { EstadoColaborador, NivelRrhh } from "@/lib/rrhh/tipos";

const CHIPS_ESTADO: { id: EstadoColaborador | "TODOS"; label: string }[] = [
  { id: "TODOS", label: "Todos" },
  { id: "ACTIVO", label: "Activos" },
  { id: "VACACIONES", label: "Vacaciones" },
  { id: "LICENCIA", label: "Licencia" },
  { id: "SUSPENDIDO", label: "Suspendidos" },
  { id: "CESADO", label: "Cesados" },
];

export default function PersonalView({ nivel }: { nivel: NivelRrhh }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [puestoId, setPuestoId] = useState("");
  const [chip, setChip] = useState<EstadoColaborador | "TODOS">("ACTIVO");
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [traerAbierta, setTraerAbierta] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);
  // «Que la tabla cambie a formato de fotocheck y LUEGO aparezca el botón de
  // descargar» (Brandon 2026-09-15): la lista se ve como tarjetas antes de imprimir.
  const [modoFotocheck, setModoFotocheck] = useState(false);

  // El QR del fotocheck trae `?persona=<id>`: abre esa ficha (ADR-416).
  const personaDelQr = useSearchParams().get("persona");
  useEffect(() => {
    if (personaDelQr) setFichaAbierta(personaDelQr);
  }, [personaDelQr]);

  // El input nunca se desmonta: `qInput` cambia en cada tecla, `q` (lo que
  // dispara el fetch) recién 250ms después de la última tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const { colaboradores, loading, error, recargar } = useRrhhColaboradores(
    { q: q || undefined, puestoId: puestoId || undefined, incluirCesados: true },
    false,
  );
  const { puestos } = useRrhhPuestos();
  // «Estrenar RRHH con tu gente» (Brandon 2026-09-14): traer personas ya
  // conocidas desde Adelantos en vez de tipearlas de cero. Sólo nivel
  // completo — el vínculo con la cuenta de Adelantos es territorio de admin/
  // owner (mismo criterio que `vincular_beneficiario`, ADR-414 §1).
  const { candidatos: candidatosAdelantos } = useRrhhDesdeAdelantos(nivel === "completo");

  const kpis = useMemo(() => {
    const base: Record<EstadoColaborador, number> = { ACTIVO: 0, VACACIONES: 0, LICENCIA: 0, SUSPENDIDO: 0, CESADO: 0 };
    for (const c of colaboradores) base[c.estado] += 1;
    return base;
  }, [colaboradores]);

  const filtrados = chip === "TODOS" ? colaboradores : colaboradores.filter((c) => c.estado === chip);
  const puedeEditar = nivel === "gestion" || nivel === "completo";
  // Un cesado no lleva fotocheck: se excluye de la vista y del PDF, aunque el chip lo muestre.
  const paraFotocheck = filtrados.filter((c) => c.estado !== "CESADO");
  const enFotocheck = modoFotocheck && paraFotocheck.length > 0;
  // «Primera carga» es sólo la primera. Con `colaboradores.length === 0` como
  // señal, una búsqueda sin resultados volvía a desmontar el buscador en la
  // tecla siguiente y se perdía el foco otra vez.
  const [cargoUnaVez, setCargoUnaVez] = useState(false);
  useEffect(() => {
    if (!loading) setCargoUnaVez(true);
  }, [loading]);
  const cargaInicial = loading && !cargoUnaVez;
  const recargando = loading && cargoUnaVez;

  if (cargaInicial) return <LoadingState message="Cargando el personal..." />;
  if (error) {
    return (
      <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {error} <button type="button" onClick={recargar} className="ml-2 font-bold underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Activos" value={kpis.ACTIVO} emphasis="success" density="compact" />
        <StatCard label="Vacaciones/licencia" value={kpis.VACACIONES + kpis.LICENCIA} density="compact" />
        <StatCard label="Suspendidos" value={kpis.SUSPENDIDO} emphasis={kpis.SUSPENDIDO > 0 ? "warning" : "neutral"} density="compact" />
        <StatCard label="Cesados" value={kpis.CESADO} density="compact" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por nombre..."
            aria-label="Buscar personal por nombre"
            className={cn(CLASE_CAMPO, "pl-10")}
          />
        </div>
        <select
          value={puestoId}
          onChange={(e) => setPuestoId(e.target.value)}
          aria-label="Filtrar por puesto"
          className={cn(CLASE_CAMPO, "w-auto")}
        >
          <option value="">Todos los puestos</option>
          {puestos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {nivel === "completo" && candidatosAdelantos.length > 0 && (
          <button type="button" onClick={() => setTraerAbierta(true)} className={BOTON.secundario}>
            <UserPlus className="h-4 w-4" /> Traer de Adelantos ({candidatosAdelantos.length})
          </button>
        )}
        {puedeEditar && paraFotocheck.length > 0 && (
          <button
            type="button"
            aria-pressed={modoFotocheck}
            onClick={() => setModoFotocheck((v) => !v)}
            className={cn(BOTON.secundario, modoFotocheck && "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]")}
          >
            <QrCode className="h-4 w-4" /> {modoFotocheck ? "Ver la tabla" : `Fotochecks (${paraFotocheck.length})`}
          </button>
        )}
        {puedeEditar && (
          <button type="button" onClick={() => setAltaAbierta(true)} className={cn(BOTON.primario, "ml-auto")}>
            <Plus className="h-4 w-4" /> Agregar persona
          </button>
        )}
      </div>

      <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
        {CHIPS_ESTADO.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={chip === c.id}
            onClick={() => setChip(c.id)}
            className={claseChipFiltro(chip === c.id)}
          >
            {c.label} <span className="tabular-nums opacity-80">{c.id === "TODOS" ? colaboradores.length : kpis[c.id]}</span>
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title={colaboradores.length === 0 ? "Agrega a tu primera persona" : "Nadie coincide"}
          description={colaboradores.length === 0 ? "Nombre, puesto y desde cuándo trabaja contigo." : "Prueba con otro filtro o busca otro nombre."}
          action={
            puedeEditar && colaboradores.length === 0
              ? {
                  label: "Agregar persona",
                  node: (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {nivel === "completo" && candidatosAdelantos.length > 0 && (
                        <button type="button" onClick={() => setTraerAbierta(true)} className={BOTON.secundario}>
                          <UserPlus className="h-4 w-4" /> Traer de Adelantos ({candidatosAdelantos.length})
                        </button>
                      )}
                      <button type="button" onClick={() => setAltaAbierta(true)} className={BOTON.primario}>
                        <Plus className="h-4 w-4" /> Agregar persona
                      </button>
                    </div>
                  ),
                }
              : undefined
          }
        />
      ) : enFotocheck ? (
        <FotochecksVista
          colaboradores={paraFotocheck}
          cesadosOmitidos={filtrados.length - paraFotocheck.length}
          onVolver={() => setModoFotocheck(false)}
        />
      ) : (
        <div aria-busy={recargando} className={cn("transition-opacity", recargando && "opacity-60")}>
          <DataTable zebra>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Puesto</th>
                <th>Estado</th>
                <th>Documento</th>
                <th>Celular</th>
                <th>Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => {
                const meta = COLABORADOR_ESTADO_META[c.estado];
                return (
                  <tr
                    key={c.id}
                    onClick={() => setFichaAbierta(c.id)}
                    {...filaClicableProps(() => setFichaAbierta(c.id))}
                    aria-label={`Abrir la ficha de ${c.nombre}`}
                    className={cn("cursor-pointer", CLASE_FOCUS_FILA)}
                  >
                    <td className="font-semibold text-[var(--text-primary)]">
                      {c.nombre}
                      {c.apodo && <span className="ml-1 font-normal text-[var(--text-tertiary)]">«{c.apodo}»</span>}
                    </td>
                    <td>{c.puesto?.nombre ?? <span className="text-[var(--text-tertiary)]">Sin puesto</span>}</td>
                    <td><span className={cn(CLASE_CHIP, meta.claseChip)}>{meta.label}</span></td>
                    <td className="font-mono text-xs">{c.documento ? `${c.tipoDocumento ?? ""} ${c.documento}`.trim() : <span className="font-sans text-[var(--text-tertiary)]">—</span>}</td>
                    <td>{c.celular ?? <span className="text-[var(--text-tertiary)]">—</span>}</td>
                    <td>{c.fechaIngreso ? formatearFecha(c.fechaIngreso) : <span className="text-[var(--text-tertiary)]">No se sabe</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      )}

      {altaAbierta && (
        <ColaboradorFormModal
          open={altaAbierta}
          onClose={() => setAltaAbierta(false)}
          nivel={nivel}
          onGuardado={() => { setAltaAbierta(false); recargar(); }}
        />
      )}
      {traerAbierta && (
        <TraerDesdeAdelantosModal
          open={traerAbierta}
          onClose={() => setTraerAbierta(false)}
          nivel={nivel}
          onCambio={recargar}
        />
      )}
      {fichaAbierta && (
        <FichaColaboradorModal
          open
          colaboradorId={fichaAbierta}
          onClose={() => setFichaAbierta(null)}
          nivel={nivel}
          onCambio={recargar}
        />
      )}
    </div>
  );
}
