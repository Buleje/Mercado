"use client";

/**
 * Ventas & Caja › Turnos, en cuatro secciones (`?sub=`, la barra compartida
 * `BarraDeSecciones`, como Me deben):
 *   Turno     → el turno abierto o el formulario para abrirlo, y los avisos.
 *   Historial → los turnos cerrados con sus filtros; tocar uno abre su resumen
 *               (`?turno=<id>`: también es el destino del enlace `turno`).
 *   Semana    → quién cubrió cada día de esta semana.
 *   Cajeros   → el ranking y las ventas del mes por cajero.
 * Cabecera en UNA fila: título · secciones · Indicadores del mes · Más.
 *
 * 10-10 (Brandon: «cada pestaña debe cumplir su tarea y evitar repeticiones»):
 * antes era una sola columna con la sub-vista Turnos/Cajeros y un historial de
 * cuatro pestañas; «Línea de tiempo», «Por cajero» y las tarjetas «Equipo»
 * repetían la Lista y el ranking, y se fueron. Abrir el turno ya abre la caja
 * (o usa la abierta): es el único camino para empezar el día.
 *
 * Partido el 08-10 de 2.244 líneas en `components/admin/turnos/` (datos en
 * use-turnos, cierre en use-cierre-turno, cuentas puras en tipos.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, MoreHorizontal, RefreshCw, Scale, Trophy, UserPlus, Wallet } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { escapeDeLaPaginaConFijado } from "@/hooks/use-ventana-de-modal";
import { formatCurrency } from "@/lib/format";
import { AbrirTurnoPanel } from "./turnos/AbrirTurnoPanel";
import { AvisosTurnos } from "./turnos/AvisosTurnos";
import { CajerosVista } from "./turnos/CajerosVista";
import { CerrarTurnoModal } from "./turnos/CerrarTurnoModal";
import { DiferenciaAltaModal } from "./turnos/DiferenciaAltaModal";
import { exportarTurnos } from "./turnos/exportar-turnos";
import { ErrorVentana } from "./turnos/MarcoModalTurno";
import { MetaTurnoModal } from "./turnos/MetaTurnoModal";
import { NuevaCajeraModal } from "./turnos/NuevaCajeraModal";
import { ResumenTurnoModal } from "./turnos/ResumenTurnoModal";
import { ID_PANEL_TURNOS, SECCION, SECCIONES_TURNOS, type SeccionTurnos } from "./turnos/secciones";
import { TurnoActivoPanel } from "./turnos/TurnoActivoPanel";
import { TurnosHistorial } from "./turnos/TurnosHistorial";
import { TurnosSemana } from "./turnos/TurnosSemana";
import { useCierreTurno } from "./turnos/use-cierre-turno";
import { useIndicadoresTurnos } from "./turnos/use-indicadores-turnos";
import { useResumenTurno } from "./turnos/use-resumen-turno";
import { useTurnoEnUrl } from "./turnos/use-turno-en-url";
import { useTurnos } from "./turnos/use-turnos";
import { avisosDeTurnos, filtrarHistorial, FILTROS_INICIALES, nombreCajero, statsPorCajero, type Turno } from "./turnos/tipos";

/**
 * Ir a Caja del mismo módulo: el hub sigue la URL por popstate (useVistaModulo)
 * y Caja lee su sección de `?sub=`. «cuadrar» = contar la caja abierta ahora;
 * «historial» = Por caja, donde queda el cuadre de cada caja cerrada (desde el
 * 10-10 Cuadrar es sólo el contador de hoy).
 */
function irACaja(sub: "cuadrar" | "historial") {
  const url = new URL(window.location.href);
  url.searchParams.set("vista", "caja-registradora");
  url.searchParams.set("sub", sub);
  url.searchParams.delete("turno");
  url.searchParams.delete("cerrar");
  window.history.pushState(null, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function TurnosModule() {
  const datos = useTurnos();
  const { turnoActivo, historial, cajeros, loading, error, fetchData } = datos;
  const resumen = useResumenTurno();
  /* Abre siempre en «Turno»: la pregunta de esta pestaña es si hay uno abierto. */
  const { vista: seccion, irA } = useSubvistaModulo<SeccionTurnos>("ventas-caja-turnos", SECCIONES_TURNOS, "turno", undefined, { recordar: false });
  const [metaVentas, setMetaVentas] = useLocalStorage<number>("turno-meta-ventas", 500);
  const [cajeroElegido, setCajeroElegido] = useState("");
  const [showNuevaCajera, setShowNuevaCajera] = useState(false);
  const [creandoCajera, setCreandoCajera] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [page, setPage] = useState(1);

  const nombreDe = useCallback((t: Turno) => nombreCajero(t, cajeros), [cajeros]);
  const operador = turnoActivo ? nombreDe(turnoActivo) : "";
  const cierre = useCierreTurno({ turnoActivo, cajeroNombre: operador, onCerrado: resumen.mostrar, refrescar: fetchData });
  const kpis = useIndicadoresTurnos(historial, cajeros);

  const filtrados = useMemo(() => filtrarHistorial(historial, filtros), [historial, filtros]);
  const stats = useMemo(() => statsPorCajero(historial, cajeros), [historial, cajeros]);
  const avisos = useMemo(() => avisosDeTurnos(turnoActivo, historial, datos.ahora), [turnoActivo, historial, datos.ahora]);
  const semana = useMemo(() => [...historial, ...(turnoActivo ? [turnoActivo] : [])], [historial, turnoActivo]);
  const ultimoTurno = historial.find((t) => t.cierreEfectivo != null) ?? null;
  const porRevisar = avisos.reduce((n, a) => n + (a.tipo === "turno-largo" ? 0 : a.cantidad), 0);

  const { abrirDeHistorial, cerrar: cerrarResumen } = resumen;
  const turnoEnUrl = useTurnoEnUrl({
    historial,
    turnoActivo,
    listo: !loading,
    resumenAbiertoId: resumen.abierto ? resumen.resumen?.turnoId ?? null : null,
    verResumen: (t) => void abrirDeHistorial(t, nombreDe(t)),
    cerrarResumen,
    irASeccion: irA,
  });

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
  const resumenAbierto = resumen.abierto;
  const { cerrar: cerrarResumenYUrl } = turnoEnUrl;
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || escapeDeLaPaginaConFijado()) return;
      if (showDiffConfirm) { setShowDiffConfirm(false); return; }
      if (showNuevaCajera) { if (!creandoCajera) setShowNuevaCajera(false); return; }
      if (showMeta) { setShowMeta(false); return; }
      if (resumenAbierto) { cerrarResumenYUrl(); return; }
      if (showCierre) resetCierreState();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [showDiffConfirm, setShowDiffConfirm, showNuevaCajera, creandoCajera, showMeta, resumenAbierto, cerrarResumenYUrl, showCierre, resetCierreState]);

  const verPorRevisar = () => {
    setFiltros({ ...FILTROS_INICIALES, soloAlertas: true });
    setPage(1);
    irA("historial");
  };

  if (loading) return <LoadingState />;

  if (error && !turnoActivo && historial.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" role="alert">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)]">No se pudieron cargar los turnos: {error}</p>
        <button type="button" onClick={fetchData} className="min-h-12 px-4 rounded-xl text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10">Reintentar</button>
      </div>
    );
  }

  const acciones: MenuAccion[] = [
    { id: "excel", label: "Exportar historial", hint: `${filtrados.length} turnos, con los filtros del historial`, icon: Download, onSelect: () => exportarTurnos(filtrados, nombreDe), disabled: filtrados.length === 0 },
    ...(turnoActivo ? [{ id: "contar", label: "Contar la caja ahora", hint: "Arqueo a mitad del turno, en Caja › Cuadrar", icon: Scale, onSelect: () => irACaja("cuadrar") }] : []),
    { id: "cuadres", label: "Cuadres en Caja", hint: "El conteo de cada caja cerrada (Caja › Historial)", icon: Wallet, onSelect: () => irACaja("historial") },
    { id: "cajera", label: "Nueva cajera", icon: UserPlus, onSelect: () => setShowNuevaCajera(true) },
    { id: "meta", label: "Meta del turno", meta: formatCurrency(metaVentas), icon: Trophy, onSelect: () => setShowMeta(true) },
    { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: fetchData },
  ];
  const ayuda = SECCION[seccion].ayuda;
  const secciones = SECCIONES_TURNOS.map((clave) => ({ clave, rotulo: SECCION[clave].rotulo, cuenta: clave === "historial" ? porRevisar : undefined }));

  return (
    <div className="space-y-4">
      {/* Una fila: título · secciones · Indicadores · Más. En el celular las secciones bajan a su fila. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Turnos</SectionTitle>
          <InfoTip title={SECCION[seccion].rotulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} />
        </div>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">
          <BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={irA} etiqueta="Secciones de Turnos" idPanel={ID_PANEL_TURNOS} />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Exportar, cuadres en Caja, nueva cajera, meta y actualizar" />
        </div>
      </div>

      {kpis.panel}

      <div role="tabpanel" id={ID_PANEL_TURNOS} aria-labelledby={idPestanaDeSeccion(ID_PANEL_TURNOS, seccion)} className="space-y-3">
        {seccion === "turno" && (
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
                  cajaAbierta={datos.cajaAbierta}
                />
              </>
            )}
            <AvisosTurnos avisos={avisos} onCerrarTurno={cierre.abrirCierre} onVerAlertas={verPorRevisar} />
          </>
        )}
        {seccion === "historial" && (
          <TurnosHistorial
            historial={historial}
            filtrados={filtrados}
            cajeros={cajeros}
            filtros={filtros}
            setFiltros={setFiltros}
            nombreDe={nombreDe}
            onVer={turnoEnUrl.ver}
            cargandoId={resumen.cargandoId}
            page={page}
            setPage={setPage}
          />
        )}
        {seccion === "semana" && (
          <section aria-label="Turnos de la semana" className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <TurnosSemana turnos={semana} nombreDe={nombreDe} />
          </section>
        )}
        {seccion === "cajeros" && <CajerosVista stats={stats} historial={historial} cajeros={cajeros} />}
      </div>

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
        onCerrar={cerrarResumenYUrl}
        onVerEnCaja={() => { cerrarResumen(); irACaja("historial"); }}
      />
    </div>
  );
}
