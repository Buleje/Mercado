"use client";

/**
 * Ventas & Caja › Turnos. Orden por pregunta (ley de Brandon, 08-10):
 *   1. ¿Hay turno abierto? → el título lo dice y debajo va el turno o el
 *      formulario para abrirlo (la acción principal).
 *   2. ¿Algo que revisar? → avisos de una línea (turno olvidado, cerrados por el
 *      sistema, diferencias altas).
 *   3. ¿Cómo va el mes? → indicadores plegables y recordados.
 *   4. ¿Qué pasó antes? → historial con sus pestañas y filtros pegados.
 * Lo demás (Excel, meta, nueva cajera, Cuadrar caja) vive en el menú «Más».
 *
 * Partido el 08-10 de 2.244 líneas en `components/admin/turnos/` (datos en
 * use-turnos, cierre en use-cierre-turno, cuentas puras en tipos.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Clock, Download, RefreshCw, Scale, Trophy, User, UserPlus } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { escapeDeLaPaginaConFijado } from "@/hooks/use-ventana-de-modal";
import { exportToExcel } from "@/lib/export-excel";
import { formatCurrency, formatDateNumeric, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AbrirTurnoPanel } from "./turnos/AbrirTurnoPanel";
import { AvisosTurnos } from "./turnos/AvisosTurnos";
import { CajerosVista } from "./turnos/CajerosVista";
import { CerrarTurnoModal } from "./turnos/CerrarTurnoModal";
import { DiferenciaAltaModal } from "./turnos/DiferenciaAltaModal";
import { ErrorVentana } from "./turnos/MarcoModalTurno";
import { MetaTurnoModal } from "./turnos/MetaTurnoModal";
import { NuevaCajeraModal } from "./turnos/NuevaCajeraModal";
import { ResumenTurnoModal } from "./turnos/ResumenTurnoModal";
import { TurnoActivoPanel } from "./turnos/TurnoActivoPanel";
import { TurnosHistorial, type VistaHistorial } from "./turnos/TurnosHistorial";
import { TurnosKpisMes } from "./turnos/TurnosKpisMes";
import { useCierreTurno } from "./turnos/use-cierre-turno";
import { useResumenTurno } from "./turnos/use-resumen-turno";
import { useTurnos } from "./turnos/use-turnos";
import {
  avisosDeTurnos, duracionHoras, filtrarHistorial, FILTROS_INICIALES, nombreCajero, statsPorCajero, turnoConAlerta,
  type Turno, type TurnoSummary,
} from "./turnos/tipos";

type SubVista = "turnos" | "cajeros";
const SEGMENTO = "px-3 min-h-9 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5";

/** Ir a «Cuadrar caja» del mismo módulo: el hub sigue la URL por popstate (useVistaModulo). */
function irACuadrarCaja(turnoId?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("vista", "arqueo");
  if (turnoId) url.searchParams.set("turno", turnoId);
  window.history.pushState(null, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function TurnosModule() {
  const datos = useTurnos();
  const { turnoActivo, historial, cajeros, loading, error, fetchData } = datos;
  const resumen = useResumenTurno();
  const [subVista, setSubVista] = useLocalStorage<SubVista>("turnos-subvista", "turnos");
  const [metaVentas, setMetaVentas] = useLocalStorage<number>("turno-meta-ventas", 500);
  const [vistaHist, setVistaHist] = useLocalStorage<VistaHistorial>("turnos-historial-vista", "lista");
  const [cajeroElegido, setCajeroElegido] = useState("");
  const [showNuevaCajera, setShowNuevaCajera] = useState(false);
  const [creandoCajera, setCreandoCajera] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [page, setPage] = useState(1);
  const historialRef = useRef<HTMLElement>(null);

  const nombreDe = useCallback((t: Turno) => nombreCajero(t, cajeros), [cajeros]);
  const operador = turnoActivo ? nombreDe(turnoActivo) : "";
  const cierre = useCierreTurno({ turnoActivo, cajeroNombre: operador, onCerrado: resumen.mostrar, refrescar: fetchData });

  const filtrados = useMemo(() => filtrarHistorial(historial, filtros), [historial, filtros]);
  const stats = useMemo(() => statsPorCajero(historial, cajeros), [historial, cajeros]);
  const avisos = useMemo(() => avisosDeTurnos(turnoActivo, historial, datos.ahora), [turnoActivo, historial, datos.ahora]);
  const semana = useMemo(() => [...historial, ...(turnoActivo ? [turnoActivo] : [])], [historial, turnoActivo]);
  const ultimoTurno = historial.find((t) => t.cierreEfectivo != null) ?? null;

  // «Cerrar turno» desde el chip del hub: `?cerrar=1` (si Turnos aún no montaba) o el evento (si ya estaba).
  const [pidenCerrar, setPidenCerrar] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cerrar") === "1");
  useEffect(() => {
    const alPedir = () => setPidenCerrar(true);
    window.addEventListener("buleje:cerrar-turno", alPedir);
    return () => window.removeEventListener("buleje:cerrar-turno", alPedir);
  }, []);
  const { abrirCierre } = cierre;
  useEffect(() => {
    if (!pidenCerrar || loading) return;
    setPidenCerrar(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("cerrar")) { url.searchParams.delete("cerrar"); window.history.replaceState(null, "", url.toString()); }
    if (turnoActivo) abrirCierre();
  }, [pidenCerrar, loading, turnoActivo, abrirCierre]);

  // Un solo oyente de Escape: cierra la ventana de más arriba (con una fijada y el foco en la página, el Escape es de la página, ADR-420).
  const { showDiffConfirm, setShowDiffConfirm, showCierre, resetCierreState } = cierre;
  const { abierto: resumenAbierto, cerrar: cerrarResumen } = resumen;
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || escapeDeLaPaginaConFijado()) return;
      if (showDiffConfirm) { setShowDiffConfirm(false); return; }
      if (showNuevaCajera) { if (!creandoCajera) setShowNuevaCajera(false); return; }
      if (showMeta) { setShowMeta(false); return; }
      if (resumenAbierto) { cerrarResumen(); return; }
      if (showCierre) resetCierreState();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [showDiffConfirm, setShowDiffConfirm, showNuevaCajera, creandoCajera, showMeta, resumenAbierto, cerrarResumen, showCierre, resetCierreState]);

  const exportar = () => {
    const rows = filtrados.map((t) => ({
      Cajero: nombreDe(t),
      Fecha: formatDateNumeric(t.abrioEn),
      "Hora inicio": formatTime(t.abrioEn),
      "Hora fin": t.cerroEn ? formatTime(t.cerroEn) : "—",
      "Duración (h)": Number(duracionHoras(t).toFixed(2)),
      "Efectivo inicial (S/)": t.inicioEfectivo,
      "Ventas (S/)": Number(t.ventasTotal.toFixed(2)),
      "Efectivo final (S/)": t.cierreEfectivo ?? "",
      "Diferencia (S/)": t.diferencia ?? "",
      Estado: t.cerradoPorSistema ? "Cerrado por el sistema" : turnoConAlerta(t) ? "Diferencia alta" : t.diferencia == null ? "Sin dato de caja" : "Cuadrado",
    }));
    const hoy = new Date();
    exportToExcel(rows, `turnos-${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`, "Turnos")
      .catch((err) => console.warn("[Turnos] exportar Excel", err));
  };

  const verPorRevisar = () => {
    setSubVista("turnos");
    setVistaHist("lista");
    setFiltros({ ...FILTROS_INICIALES, soloAlertas: true });
    setPage(1);
    requestAnimationFrame(() => historialRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const cuadrarDesdeResumen = (r: TurnoSummary) => { cerrarResumen(); irACuadrarCaja(r.turnoId); };

  if (loading) return <LoadingState />;

  if (error && !turnoActivo && historial.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" role="alert">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-500)]">No se pudieron cargar los turnos: {error}</p>
        <button type="button" onClick={fetchData} className="min-h-10 px-4 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10">Reintentar</button>
      </div>
    );
  }

  const acciones: MenuAccion[] = [
    { id: "excel", label: "Exportar historial", hint: `${filtrados.length} turnos, con los filtros de la tabla`, icon: Download, onSelect: exportar, disabled: filtrados.length === 0 },
    { id: "cuadrar", label: "Ir a Cuadrar caja", hint: "Conteo y cierre del día", icon: Scale, onSelect: () => irACuadrarCaja() },
    { id: "cajera", label: "Nueva cajera", icon: UserPlus, onSelect: () => setShowNuevaCajera(true) },
    { id: "meta", label: "Meta del turno", meta: formatCurrency(metaVentas), icon: Trophy, onSelect: () => setShowMeta(true) },
    { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: fetchData },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <SectionTitle>{subVista === "cajeros" ? "Equipo de caja" : turnoActivo ? "Turno abierto" : "Sin turno abierto"}</SectionTitle>
          <InfoTip
            title="Turnos"
            what="Cada turno guarda quién atendió, con cuánto abrió la caja, lo vendido y lo contado al cerrar."
            affects="Al cerrar el turno se cierra su caja y queda la diferencia. El cierre del día se hace en Cuadrar caja."
            example="Abre con S/ 200, vende S/ 850 (S/ 500 en efectivo), cuenta S/ 700: caja cuadrada."
          />
        </div>
        <div className="flex bg-[var(--surface-sunken)] rounded-xl p-1" role="tablist" aria-label="Sub-vista de Turnos">
          {([["turnos", "Turnos", Clock], ["cajeros", "Cajeros", User]] as const).map(([id, label, Icono]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subVista === id}
              onClick={() => setSubVista(id)}
              className={cn(SEGMENTO, subVista === id ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}
            >
              <Icono className="h-3.5 w-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <div className="ml-auto"><ActionMenu label="Más" actions={acciones} size="sm" compactoEnMovil /></div>
      </div>

      {subVista === "cajeros" ? (
        <CajerosVista stats={stats} historial={historial} cajeros={cajeros} />
      ) : (
        <>
          {turnoActivo ? (
            <TurnoActivoPanel turno={turnoActivo} operador={operador} enVivo={datos.enVivo} onCerrar={cierre.abrirCierre} />
          ) : (
            <>
              <ErrorVentana mensaje={datos.errorAbrir} />
              <AbrirTurnoPanel
                cajeros={cajeros}
                cajerosLoading={datos.cajerosLoading}
                cajeroElegido={cajeroElegido}
                setCajeroElegido={setCajeroElegido}
                opening={datos.opening}
                onAbrir={datos.abrirTurno}
                onNuevaCajera={() => setShowNuevaCajera(true)}
                ultimoTurno={ultimoTurno}
                nombreDe={nombreDe}
                metaVentas={metaVentas}
                onEditarMeta={() => setShowMeta(true)}
              />
            </>
          )}
          <AvisosTurnos avisos={avisos} onCerrarTurno={cierre.abrirCierre} onVerAlertas={verPorRevisar} />
          {historial.length > 0 && <TurnosKpisMes historial={historial} cajeros={cajeros} />}
          <TurnosHistorial
            ref={historialRef}
            historial={historial}
            filtrados={filtrados}
            semana={semana}
            stats={stats}
            cajeros={cajeros}
            filtros={filtros}
            setFiltros={setFiltros}
            nombreDe={nombreDe}
            onVer={(t) => resumen.abrirDeHistorial(t, nombreDe(t))}
            cargandoId={resumen.cargandoId}
            page={page}
            setPage={setPage}
            vista={vistaHist}
            setVista={setVistaHist}
          />
        </>
      )}

      <NuevaCajeraModal
        abierto={showNuevaCajera}
        creando={creandoCajera}
        setCreando={setCreandoCajera}
        onCerrar={() => setShowNuevaCajera(false)}
        onCreada={(id) => { setCajeroElegido(id); setShowNuevaCajera(false); }}
        crearCajera={datos.crearCajera}
      />
      <MetaTurnoModal abierto={showMeta} meta={metaVentas} onGuardar={setMetaVentas} onCerrar={() => setShowMeta(false)} />
      <CerrarTurnoModal turno={turnoActivo} cierre={cierre} ventasDelTurno={datos.enVivo?.totalVendido ?? turnoActivo?.ventasTotal ?? 0} />
      <DiferenciaAltaModal cierre={cierre} hayTurno={!!turnoActivo} />
      <ResumenTurnoModal
        abierto={resumen.abierto}
        resumen={resumen.resumen}
        historial={historial}
        metaVentas={metaVentas}
        onCerrar={cerrarResumen}
        onCuadrarCaja={cuadrarDesdeResumen}
      />
    </div>
  );
}
