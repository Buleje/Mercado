"use client";

/**
 * LothGtfView — Guías de Transporte Forestal (GTF), ADR-126 Fase 4.
 * Emite GTF con lista de trozas + datos de transporte, e imprime el documento.
 * Interna, no oficial (la GTF oficial se emite vía SNIFFS).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, FileText, Plus, Printer, Ban, Loader2, Search, ShieldCheck, Trash2, Truck, LogIn } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CTP_INGRESAR_GTF_KEY, CTP_MODULE_TAB_ID } from "./ctp-shared";
import { documentoGtfLoth, type LothGtfCaratula, type LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { esc } from "@/lib/forestal/ctp-documento-print";
import VerificarGtfSerfor from "./VerificarGtfSerfor";

interface GtfItem {
  code?: string | null; species?: string | null; scientific?: string | null; cites?: boolean;
  diamMayorM?: number | null; diamMenorM?: number | null; lengthM?: number | null; volumeM3?: number | null;
}
interface Gtf {
  id: string; gtfNumber: string; gtfDate: string | null; tipo: string;
  titularName: string | null; tituloHabilitante: string | null; parcelaCorta: string | null;
  transportista: string | null; transportistaDoc: string | null; conductor: string | null;
  conductorLicencia: string | null; placaVehiculo: string | null; origen: string | null; destino: string | null;
  items: GtfItem[] | null; volumenTotalM3: string | null; piezasTotal: number | null;
  observations: string | null; status: string; annulledReason: string | null;
}

const smalian = (dM: number, dm: number, L: number) =>
  dM > 0 && dm > 0 && L > 0 ? Math.round(0.7854 * Math.pow((dM + dm) / 2, 2) * L * 10000) / 10000 : 0;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";

export default function LothGtfView({
  focusGtf,
  onFocusHandled,
}: {
  /** Guía a resaltar al entrar (se llega acá desde la trazabilidad por árbol). */
  focusGtf?: string | null;
  onFocusHandled?: () => void;
} = {}) {
  const [gtfs, setGtfs] = useState<Gtf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annulId, setAnnulId] = useState<string | null>(null);
  // Puente inverso: GTF de trozas emitidas que aún no ingresaron al CTP —
  // mismo conjunto que la bandeja del lado planta (single source: ?sinIngresar=1).
  const [sinIngresar, setSinIngresar] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<"todas" | "emitida" | "anulada" | "sin_ingresar">("todas");
  const [tipo, setTipo] = useState<"todos" | "trozas" | "producto">("todos");
  const [pagina, setPagina] = useState(0);
  /** Guías que el LIBRO declara y que no están emitidas acá (se piden aparte). */
  const [declaradasSinEmitir, setDeclaradasSinEmitir] = useState<string[]>([]);
  /** Identidad del titular para la hoja oficial (casilleros 6 y 7). */
  const [caratula, setCaratula] = useState<LothGtfCaratula | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rGtf, rPend] = await Promise.all([
        fetch("/api/admin/forestal/gtf", { credentials: "include" }),
        fetch("/api/admin/forestal/gtf?sinIngresar=1", { credentials: "include" }),
      ]);
      let emitidas: Gtf[] = [];
      if (rGtf.ok) {
        emitidas = ((await rGtf.json()).gtfs ?? []) as Gtf[];
        setGtfs(emitidas);
      }
      if (rPend.ok) {
        const pend = ((await rPend.json()).gtfs ?? []) as { gtfNumber: string }[];
        setSinIngresar(new Set(pend.map((g) => g.gtfNumber)));
      }

      // El cruce inverso: guías que el LIBRO declara en sus despachos y que
      // nadie emitió acá. Hasta ahora sólo se veía en Cumplimiento, que es
      // donde menos sirve — el que puede emitirla está en esta pantalla.
      try {
        const rLib = await fetch("/api/admin/forestal/loth?limit=500", { credentials: "include" });
        if (rLib.ok) {
          const lineas = ((await rLib.json()).entries ?? []) as { section: string; gtfNumber: string | null; status: string }[];
          const vivas = new Set(emitidas.filter((g) => g.status !== "anulada").map((g) => g.gtfNumber));
          const declaradas = new Set(
            lineas
              .filter((l) => l.status !== "anulado" && (l.section === "despacho_troza" || l.section === "despacho_producto") && l.gtfNumber)
              .map((l) => l.gtfNumber as string),
          );
          setDeclaradasSinEmitir([...declaradas].filter((g) => !vivas.has(g)).sort());
        }
      } catch (err) {
        // Falla blanda: sin el cruce no se acusa a nadie.
        console.warn("[loth-gtf] no se pudo cruzar el libro contra las guías emitidas", err);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // La carátula del libro es la identidad legal que va en la hoja: sin ella los
  // casilleros del titular salen vacíos y el papel no sirve en un control.
  useEffect(() => {
    fetch("/api/admin/forestal/loth/caratula", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCaratula(j?.active ?? null))
      .catch((err) => console.warn("[loth-gtf] no se pudo leer la carátula", err));
  }, []);

  // Llegar a la guía sin buscarla: al entrar desde «Por árbol» la fila se
  // resalta y la lista se desplaza hasta ella. El foco se consume una vez —si
  // quedara pegado, la próxima visita a esta vista lo repetiría sin motivo.
  const filaEnfocada = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!focusGtf || loading) return;
    // Si la guía no está en la lista, el foco NO se consume: así el aviso de
    // «declarada en el libro pero no emitida acá» queda a la vista.
    if (!filaEnfocada.current) return;
    filaEnfocada.current.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => onFocusHandled?.(), 4000);
    return () => clearTimeout(t);
  }, [focusGtf, loading, gtfs, onFocusHandled]);

  /** Manda la guía al Libro CTP: deja el N° en sessionStorage y navega al módulo. */
  function ingresarAlCtp(gtfNumber: string) {
    try { sessionStorage.setItem(CTP_INGRESAR_GTF_KEY, gtfNumber); } catch { /* modo privado: el form abre vacío, no rompe */ }
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId: CTP_MODULE_TAB_ID } }));
  }

  /**
   * Anular no borra: deja la guía visible con su motivo. Por eso el motivo es
   * obligatorio y se pide en un modal, no en un input de 8rem dentro de la celda
   * (donde no entraba una razón de verdad y se perdía al hacer scroll).
   */
  async function annul(id: string, reason: string) {
    await fetch("/api/admin/forestal/gtf", {
      method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
      body: JSON.stringify({ id, action: "annul", reason }),
    });
    setAnnulId(null); load();
  }

  const gtfAnular = annulId ? gtfs.find((g) => g.id === annulId) ?? null : null;

  /**
   * Se llegó buscando una guía que no está emitida acá. Pasa de verdad: el libro
   * puede declarar un despacho con un N° de GTF que nadie registró en este
   * módulo. Callarlo deja al usuario mirando una lista donde su guía no aparece;
   * decirlo convierte el viaje en un hallazgo de compliance.
   */
  const focoAusente = !!focusGtf && !loading && !gtfs.some((g) => g.gtfNumber === focusGtf);

  // Resumen del período: lo que un titular quiere saber sin leer la tabla.
  const resumen = useMemo(() => {
    const vivas = gtfs.filter((g) => g.status !== "anulada");
    return {
      emitidas: vivas.length,
      anuladas: gtfs.length - vivas.length,
      volumen: vivas.reduce((s, g) => s + Number(g.volumenTotalM3 ?? 0), 0),
      pendientes: vivas.filter((g) => g.tipo !== "producto" && sinIngresar.has(g.gtfNumber)).length,
    };
  }, [gtfs, sinIngresar]);

  /** Lo que se está viendo, tras búsqueda y filtros. */
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return gtfs.filter((g) => {
      if (q) {
        const heno = [g.gtfNumber, g.titularName, g.destino, g.transportista, g.placaVehiculo, g.origen]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!heno.includes(q)) return false;
      }
      if (tipo === "trozas" && g.tipo === "producto") return false;
      if (tipo === "producto" && g.tipo !== "producto") return false;
      if (estado === "emitida" && g.status === "anulada") return false;
      if (estado === "anulada" && g.status !== "anulada") return false;
      if (estado === "sin_ingresar" && !(g.tipo !== "producto" && g.status !== "anulada" && sinIngresar.has(g.gtfNumber))) return false;
      return true;
    });
  }, [gtfs, busqueda, tipo, estado, sinIngresar]);

  const POR_PAGINA = 25;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = filtradas.slice(pagActual * POR_PAGINA, (pagActual + 1) * POR_PAGINA);
  const volumenFiltrado = filtradas.filter((g) => g.status !== "anulada").reduce((a, g) => a + Number(g.volumenTotalM3 ?? 0), 0);

  useEffect(() => setPagina(0), [busqueda, tipo, estado]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Truck className="h-4 w-4" /> Guías de Transporte Forestal · interno (oficial = SNIFFS)</div>
        <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Emitir GTF
        </button>
      </div>

      {/* Las guías que el libro declara y nadie emitió. Acá sí sirve: quien puede
          emitirlas está en esta pantalla. */}
      {declaradasSinEmitir.length > 0 && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4" />
            {declaradasSinEmitir.length === 1
              ? "1 guía está declarada en el libro y no figura acá"
              : `${declaradasSinEmitir.length} guías están declaradas en el libro y no figuran acá`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            El libro ampara salidas con {declaradasSinEmitir.length === 1 ? "este número" : "estos números"}: o la guía se emitió fuera
            del sistema, o el número del libro tiene un error de tipeo. Ante una fiscalización, esa madera viaja sin documento que la
            respalde.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {declaradasSinEmitir.map((g) => (
              <span
                key={g}
                className="rounded-full border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-2.5 py-0.5 font-mono text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              >
                {g}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Emitir la guía faltante
            </button>
          </div>
        </div>
      )}

      {/* Buscar y filtrar: la lista no tenía ninguna de las dos cosas. */}
      {!loading && gtfs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-11 min-w-[16rem] flex-1 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N° de guía, titular, destino, transportista o placa…"
              className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
            />
          </div>
          <label className="flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm">
            <span className="text-[var(--text-tertiary)]">Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="bg-transparent font-bold text-[var(--text-primary)] outline-none">
              <option value="todos">Todos</option>
              <option value="trozas">Trozas</option>
              <option value="producto">Producto</option>
            </select>
          </label>
          <label className="flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm">
            <span className="text-[var(--text-tertiary)]">Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="bg-transparent font-bold text-[var(--text-primary)] outline-none">
              <option value="todas">Todas</option>
              <option value="emitida">Emitidas</option>
              <option value="sin_ingresar">Sin ingresar al CTP</option>
              <option value="anulada">Anuladas</option>
            </select>
          </label>
        </div>
      )}

      {focoAusente && (
        <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 p-3 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          La guía <b className="font-mono">{focusGtf}</b> está declarada en el Libro de Operaciones pero no figura entre las guías
          emitidas acá. O se emitió fuera del sistema, o el número del libro tiene un error de tipeo.
        </div>
      )}

      {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{error}</div>}

      {!loading && gtfs.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ResumenChip valor={resumen.emitidas} label="Guías emitidas" />
          <ResumenChip valor={resumen.volumen.toFixed(3)} sufijo="m³" label="Volumen movilizado" />
          <ResumenChip valor={resumen.pendientes} label="Sin ingresar al CTP" tono={resumen.pendientes > 0 ? "warning" : undefined} />
          <ResumenChip valor={resumen.anuladas} label="Anuladas" tono={resumen.anuladas > 0 ? "danger" : undefined} />
        </div>
      )}

      {/* Emitir: el formulario es un documento (12 campos + lista de trozas), no
          un panel que empuje la tabla — va en modal ancho con footer fijo. */}
      <AdminModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Emitir Guía de Transporte Forestal"
        description="Interna (no oficial). Las trozas deben estar registradas en el Libro de Operaciones."
        icon={Truck}
        variant="info"
      >
        {showForm && <GtfForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      </AdminModal>

      {/* Anular: pide motivo obligatorio y explica que la guía NO se borra. */}
      <AdminModal
        open={!!gtfAnular}
        onClose={() => setAnnulId(null)}
        title={gtfAnular ? `Anular la GTF ${gtfAnular.gtfNumber}` : "Anular GTF"}
        description="La guía queda en el libro con su motivo. No se borra."
        icon={Ban}
      >
        {gtfAnular && <AnularGtfForm gtf={gtfAnular} onConfirm={(r) => annul(gtfAnular.id, r)} onCancel={() => setAnnulId(null)} />}
      </AdminModal>

      {loading && <div className="p-6 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}

      {!loading && (
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <DataTable className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr>{["N° GTF", "Fecha", "Tipo", "Titular", "Destino", "Vol. m³", "Estado", "Acciones"].map((h, i) => <th key={i} className={`px-4 py-2.5 font-bold text-[var(--text-primary)] ${i === 5 ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {enPagina.map((g) => (
                <tr
                  key={g.id}
                  ref={g.gtfNumber === focusGtf ? filaEnfocada : undefined}
                  className={`border-t border-[var(--rule-soft)] ${g.status === "anulada" ? "opacity-50" : ""} ${
                    g.gtfNumber === focusGtf ? "bg-[var(--data-info-500)]/15 outline outline-2 -outline-offset-2 outline-[var(--data-info-500)]" : ""
                  }`}
                >
                  <td className="px-4 py-2.5"><span className="font-mono font-bold text-[var(--text-primary)]">{g.gtfNumber}</span></td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{fmtDate(g.gtfDate)}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">{g.tipo === "producto" ? "Producto" : "Trozas"}</span></td>
                  <td className="px-4 py-2.5 text-[var(--text-primary)]">{g.titularName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{g.destino ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right"><span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{g.volumenTotalM3 ? fmtM3(Number(g.volumenTotalM3)) : "—"}</span></td>
                  <td className="px-4 py-2.5">{g.status === "anulada" ? <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">ANULADA</span> : <span className="rounded-full bg-[var(--data-success-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]">Emitida</span>}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {g.tipo !== "producto" && g.status !== "anulada" && sinIngresar.has(g.gtfNumber) && (
                        <button
                          type="button"
                          onClick={() => ingresarAlCtp(g.gtfNumber)}
                          title="Registrar estas trozas como ingreso en el Libro de Operaciones del CTP"
                          className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/15"
                        >
                          <LogIn className="h-3.5 w-3.5" /> Ingresar al CTP
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => printGtfOficial(g, caratula)}
                        title="Imprimir en la hoja de casilleros SERFOR (mismo formato que el Libro CTP)"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
                      >
                        <Printer className="h-3.5 w-3.5" /> Hoja SERFOR
                      </button>
                      <button type="button" onClick={() => printGtf(g)} title="Imprimir el resumen interno" className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Printer className="h-3.5 w-3.5" /> Resumen</button>
                      {g.status !== "anulada" && (
                        <button type="button" onClick={() => setAnnulId(g.id)} title="Anular esta guía" aria-label={`Anular la GTF ${g.gtfNumber}`} className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><Ban className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {gtfs.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-tertiary)]"><FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin GTF emitidas. Hacé click en &quot;Emitir GTF&quot;.</td></tr>}
            </tbody>
          </DataTable>
        </div>
      )}
      {!loading && filtradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">
            {filtradas.length === gtfs.length
              ? `${gtfs.length} guía${gtfs.length === 1 ? "" : "s"}`
              : `${filtradas.length} de ${gtfs.length} guías`}
            {" · "}
            <span className="font-mono tabular-nums">{fmtM3(volumenFiltrado)}</span> m³
            {totalPaginas > 1 && ` · página ${pagActual + 1} de ${totalPaginas}`}
          </p>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagActual === 0}
                className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagActual >= totalPaginas - 1}
                className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ficha de resumen de la pestaña. */
function ResumenChip({ valor, label, sufijo, tono }: { valor: number | string; label: string; sufijo?: string; tono?: "warning" | "danger" }) {
  const color = tono === "danger"
    ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
    : tono === "warning"
      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : "text-[var(--text-primary)]";
  const borde = tono === "danger" ? "border-[var(--data-error-500)]" : tono === "warning" ? "border-[var(--data-warning-500)]" : "border-[var(--rule-base)]";
  return (
    <div className={`rounded-2xl border-2 ${borde} bg-[var(--surface-raised)] px-3.5 py-3`}>
      <div className={`font-mono text-2xl font-bold tabular-nums leading-none ${color}`}>
        {valor}
        {sufijo && <span className="ml-1 text-sm font-semibold">{sufijo}</span>}
      </div>
      <p className="mt-1 text-[length:var(--ts-2xs)] font-semibold uppercase leading-tight tracking-wide text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}

/**
 * Cuerpo del modal de anulación. El motivo va a `annulledReason` y queda en el
 * libro: es lo que lee un fiscalizador para entender por qué esa guía no vale.
 */
function AnularGtfForm({ gtf, onConfirm, onCancel }: { gtf: Gtf; onConfirm: (r: string) => void; onCancel: () => void }) {
  const [r, setR] = useState("");
  const [busy, setBusy] = useState(false);
  const valido = r.trim().length >= 3;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!valido || busy) return; setBusy(true); onConfirm(r.trim()); }}
      className="space-y-4 p-5"
    >
      <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Se anulan <strong>{gtf.volumenTotalM3 ? fmtM3(Number(gtf.volumenTotalM3)) : "—"} m³</strong>
          {gtf.destino ? <> con destino <strong>{gtf.destino}</strong></> : null}. La guía sigue apareciendo en el libro, marcada como anulada.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Motivo de la anulación *</span>
        <textarea
          value={r}
          onChange={(e) => setR(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Ej.: error en la placa del vehículo; se reemplaza por la GTF 001-0000126."
          className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
        />
        <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Mínimo 3 caracteres. Queda registrado en el libro.</span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button type="submit" disabled={!valido || busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Anular la guía
        </button>
      </div>
    </form>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────
function GtfForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    gtfNumber: "", gtfDate: new Date().toISOString().slice(0, 10), tipo: "trozas",
    titularName: "", tituloHabilitante: "", parcelaCorta: "",
    transportista: "", transportistaDoc: "", conductor: "", conductorLicencia: "", placaVehiculo: "",
    origen: "", destino: "", observations: "",
  });
  const [items, setItems] = useState<GtfItem[]>([]);
  const [it, setIt] = useState({ code: "", species: "", diamMayorM: "", diamMenorM: "", lengthM: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (k: keyof typeof it, v: string) => setIt((p) => ({ ...p, [k]: v }));
  // Verificación SERFOR (informativa, ADR-312): esta GTF interna no tiene hoy
  // dónde guardar el sello (ForestGtf no trae esas columnas), así que confirma
  // en el momento y no se persiste — igual que el resto del form, que tampoco
  // valida contra la GTF oficial más allá de esto.
  const [selloSerfor, setSelloSerfor] = useState<{ numeroRegistro: string; verificadoEn: string } | null>(null);

  // ── Validación GTF ↔ Libro de Operaciones ──────────────────────────────
  // codesInLibro: set de códigos registrados en el libro (sección trozado/despacho).
  // null = cargando todavía; Set vacío podría significar "no hay trozas aún".
  const [codesInLibro, setCodesInLibro] = useState<Set<string> | null>(null);
  const [libroErr, setLibroErr] = useState<string | null>(null);

  useEffect(() => {
    // OJO: NO usar `?available=despacho_troza` acá — esa fuente EXCLUYE a
    // propósito las trozas ya despachadas (es el picker para crear un despacho
    // nuevo), y "Cargar trozas despachadas" abajo carga justamente las YA
    // despachadas → toda troza cargada daba "no está en el libro". `trozaCodes`
    // trae TODAS las registradas en Trozado, despachadas o no.
    fetch("/api/admin/forestal/loth?trozaCodes=1", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        const codes = new Set<string>(
          ((j.codes ?? []) as Array<string | null>)
            .map((x) => x?.trim() ?? "")
            .filter(Boolean)
        );
        setCodesInLibro(codes);
      })
      .catch((e: unknown) => {
        // Si el endpoint falla no bloqueamos al usuario, pero avisamos.
        setLibroErr(e instanceof Error ? e.message : String(e));
        setCodesInLibro(new Set()); // tratar como "sin datos" para no bloquear indefinidamente
      });
  }, []);

  // Índice: para cada troza con código, ¿está en el libro?
  // Solo aplica cuando codesInLibro ya cargó y la troza tiene código.
  const invalidCodes: Set<number> = new Set(
    items.reduce<number[]>((acc, x, i) => {
      if (codesInLibro !== null && x.code && x.code.trim() !== "" && !codesInLibro.has(x.code.trim())) {
        acc.push(i);
      }
      return acc;
    }, [])
  );
  const hasInvalidItems = invalidCodes.size > 0;

  // Prefill titular/título del plan activo
  useEffect(() => {
    fetch("/api/admin/forestal/plan?active=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const p = j?.active; if (p) setF((s) => ({ ...s, titularName: p.titularName ?? "", tituloHabilitante: p.tituloHabilitante ?? "", parcelaCorta: p.parcelaCorta ?? "" })); })
      .catch(() => { /* prefill best-effort: si no hay plan activo, el usuario completa a mano */ });
  }, []);

  const autoVol = smalian(Number(it.diamMayorM), Number(it.diamMenorM), Number(it.lengthM));
  function addItem() {
    if (!it.code.trim() && !it.species.trim()) return;
    const m = findSpeciesByCommonName(it.species);
    setItems((arr) => [...arr, {
      code: it.code.trim() || null, species: it.species.trim() || null, scientific: m?.scientificName ?? null, cites: m?.cites ?? false,
      diamMayorM: it.diamMayorM ? Number(it.diamMayorM) : null, diamMenorM: it.diamMenorM ? Number(it.diamMenorM) : null,
      lengthM: it.lengthM ? Number(it.lengthM) : null, volumeM3: autoVol || null,
    }]);
    setIt({ code: "", species: it.species, diamMayorM: "", diamMenorM: "", lengthM: "" });
  }
  async function loadDespachadas() {
    try {
      const r = await fetch("/api/admin/forestal/loth?despachables=1", { credentials: "include" });
      if (!r.ok) return;
      const fetched = ((await r.json()).items ?? []) as GtfItem[];
      const existing = new Set(items.map((x) => x.code));
      const nuevos = fetched.filter((x) => x.code && !existing.has(x.code));
      if (nuevos.length) setItems((arr) => [...arr, ...nuevos]);
    } catch { /* best-effort: si falla, el usuario carga manual */ }
  }
  const totalVol = items.reduce((a, i) => a + Number(i.volumeM3 ?? 0), 0);
  // Sin estos tres, un puesto de control no puede cruzar quién transporta la
  // madera contra este registro interno (mismo requisito que exige el backend).
  const hasMissingRequired = !f.transportista.trim() || !f.conductor.trim() || !f.placaVehiculo.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems || hasMissingRequired) return;
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { items };
      for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
      body.gtfNumber = f.gtfNumber.trim();
      const r = await fetch("/api/admin/forestal/gtf", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  // Vive dentro de AdminModal: el padding y el footer los pone el form, y el
  // footer va `sticky` para que "Emitir" no quede debajo de la lista de trozas.
  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      {err && <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{err}</div>}
      {libroErr && (
        <div className="rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)]">
          No se pudo cargar el Libro de Operaciones ({libroErr}). La validación GTF ↔ libro está desactivada temporalmente.
        </div>
      )}
      {hasInvalidItems && (
        <div className="rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm font-medium text-[var(--data-error-700)]">
          Hay trozas que no figuran en el Libro de Operaciones. Registralas en Trozado/Despacho antes de emitir la GTF.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="N° GTF *"><input value={f.gtfNumber} onChange={(e) => set("gtfNumber", e.target.value)} placeholder="001-0000125" className={I} /></Field>
        <Field label="Fecha"><input type="date" value={f.gtfDate} onChange={(e) => set("gtfDate", e.target.value)} className={I} /></Field>
        <Field label="Tipo"><select value={f.tipo} onChange={(e) => set("tipo", e.target.value)} className={I}><option value="trozas">Trozas</option><option value="producto">Producto</option></select></Field>
        <Field label="Titular"><input value={f.titularName} onChange={(e) => set("titularName", e.target.value)} className={I} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Transportista *"><input value={f.transportista} onChange={(e) => set("transportista", e.target.value)} className={I} /></Field>
        <Field label="Doc. transportista"><input value={f.transportistaDoc} onChange={(e) => set("transportistaDoc", e.target.value)} className={I} /></Field>
        <Field label="Conductor *"><input value={f.conductor} onChange={(e) => set("conductor", e.target.value)} className={I} /></Field>
        <Field label="Placa vehículo *"><input value={f.placaVehiculo} onChange={(e) => set("placaVehiculo", e.target.value)} placeholder="ABC-123" className={I} /></Field>
      </div>

      <VerificarGtfSerfor
        gtfNumber={f.gtfNumber}
        onSello={setSelloSerfor}
        onGuiaVerificada={(g) => {
          // Lo que la guía trae y el operador todavía no tipeó se copia; lo
          // tipeado no se pisa. SERFOR no publica un nombre de conductor
          // separado del transportista, así que ese campo sigue manual.
          setF((p) => ({
            ...p,
            gtfNumber: p.gtfNumber.trim() || g.gtfNumber || p.gtfNumber,
            titularName: p.titularName.trim() || g.titular || p.titularName,
            transportista: p.transportista.trim() || g.transportista || p.transportista,
            transportistaDoc: p.transportistaDoc.trim() || g.transportistaDni || p.transportistaDoc,
            conductorLicencia: p.conductorLicencia.trim() || g.licenciaConducir || p.conductorLicencia,
            placaVehiculo: p.placaVehiculo.trim() || g.placa || p.placaVehiculo,
          }));
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Origen"><input value={f.origen} onChange={(e) => set("origen", e.target.value)} placeholder="PC 12 — bosque" className={I} /></Field>
        <Field label="Destino"><input value={f.destino} onChange={(e) => set("destino", e.target.value)} placeholder="CTP / aserradero" className={I} /></Field>
      </div>

      {/* Lista de trozas */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Lista de trozas / productos</p>
          <button type="button" onClick={loadDespachadas} className="inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            <Plus className="h-3.5 w-3.5" /> Cargar trozas despachadas
          </button>
        </div>
        <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-6">
          <Field label="Código"><input value={it.code} onChange={(e) => setItem("code", e.target.value)} placeholder="85-TOR-A" className={I} /></Field>
          <Field label="Especie"><input value={it.species} onChange={(e) => setItem("species", e.target.value)} placeholder="Tornillo" className={I} /></Field>
          <Field label="Ø mayor"><input type="number" step="0.001" value={it.diamMayorM} onChange={(e) => setItem("diamMayorM", e.target.value)} className={I} /></Field>
          <Field label="Ø menor"><input type="number" step="0.001" value={it.diamMenorM} onChange={(e) => setItem("diamMenorM", e.target.value)} className={I} /></Field>
          <Field label={`Long. ${autoVol > 0 ? `→ ${fmtM3(autoVol)}` : ""}`}><input type="number" step="0.01" value={it.lengthM} onChange={(e) => setItem("lengthM", e.target.value)} className={I} /></Field>
          <button type="button" onClick={addItem} className="h-10 rounded-lg bg-[var(--data-success-700)] text-sm font-bold text-white hover:opacity-90">+ Agregar</button>
        </div>
        {items.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <DataTable className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--text-tertiary)]"><tr><th className="py-1">Código</th><th>Especie</th><th className="text-right">Ø may</th><th className="text-right">Ø men</th><th className="text-right">Long.</th><th className="text-right">Vol. m³</th><th></th></tr></thead>
              <tbody>
                {items.map((x, i) => (
                  <tr key={i} className={`border-t border-[var(--rule-soft)] ${invalidCodes.has(i) ? "bg-[var(--data-error-50)]" : ""}`}>
                    <td className="py-1.5 font-mono font-bold text-[var(--text-primary)]">
                      {x.code ?? "—"}
                      {invalidCodes.has(i) && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-[var(--data-error-600)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-white leading-none">
                          no está en el libro
                        </span>
                      )}
                    </td>
                    <td>{x.species ?? "—"}{x.cites && <span className="ml-1 rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}</td>
                    <td className="text-right font-mono tabular-nums">{x.diamMayorM?.toFixed(2) ?? "—"}</td>
                    <td className="text-right font-mono tabular-nums">{x.diamMenorM?.toFixed(2) ?? "—"}</td>
                    <td className="text-right font-mono tabular-nums">{x.lengthM?.toFixed(2) ?? "—"}</td>
                    <td className="text-right font-mono tabular-nums font-bold">{x.volumeM3 != null ? fmtM3(x.volumeM3) : "—"}</td>
                    <td className="text-right"><button type="button" onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))} className="text-[var(--data-error-600)]"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[var(--rule-base)] font-bold"><td colSpan={5} className="py-1.5 text-right">Volumen total</td><td className="text-right font-mono tabular-nums text-[var(--data-success-700)]">{fmtM3(totalVol)}</td><td></td></tr>
              </tbody>
            </DataTable>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
        <span className="text-xs font-semibold text-[var(--text-tertiary)]">
          {items.length} {items.length === 1 ? "ítem" : "ítems"} · <span className="font-mono tabular-nums">{fmtM3(totalVol)}</span> m³
          {items.length === 0 && <span className="ml-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">— agregá al menos una troza</span>}
          {items.length > 0 && hasMissingRequired && (
            <span className="ml-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">— completá transportista, conductor y placa</span>
          )}
          {selloSerfor && (
            <span className="ml-2 inline-flex items-center gap-1 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <ShieldCheck className="h-3.5 w-3.5" /> verificada en SERFOR ({selloSerfor.numeroRegistro})
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" disabled={busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems || hasMissingRequired} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Emitir GTF</button>
        </div>
      </div>
    </form>
  );
}

// ─── Impresión (ventana nueva, aislada) — QR real vía lazy-import ───────────

/**
 * ⛔ Todo lo que se imprime en estas dos funciones —titular, transportista,
 * placa, observaciones, el motivo de anulación, el código y la especie de cada
 * troza— lo tipea una persona en el formulario y llega acá desde la base SIN
 * pasar por React, que es lo que normalmente escapa por nosotros. Un
 * `<img onerror=...>` en «observaciones» se ejecutaba al imprimir la guía, en
 * una ventana con el mismo origen que el panel.
 *
 * Se usa el `esc()` compartido (`ctp-documento-print`), el mismo que ya protegía
 * la hoja oficial del CTP: un escape propio acá sería una segunda versión que
 * mañana se arregla en un lado y no en el otro.
 *
 * NO se aplica al SVG del QR ni al CSS: eso es markup a propósito, generado por
 * nosotros, no texto de nadie.
 */
/**
 * Imprime la guía en la hoja de casilleros SERFOR — la MISMA que usa el Libro
 * CTP. Antes cada libro tenía su papel: el del título habilitante, que es el que
 * viaja con la madera desde el bosque, era el peor de los dos.
 */
function printGtfOficial(g: Gtf, caratula: LothGtfCaratula | null) {
  const { cuerpo, css, titulo } = documentoGtfLoth(g as unknown as LothGtfDoc, caratula);
  const w = window.open("", "_blank", "width=920,height=1000");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${css}</style></head><body>${cuerpo}</body></html>`,
  );
  w.document.close();
}

async function printGtf(g: Gtf) {
  const items = Array.isArray(g.items) ? g.items : [];
  const rows = items.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.code)}</td><td>${esc(x.species)}${x.cites ? " <b>(CITES)</b>" : ""}</td><td style="text-align:right">${x.diamMayorM?.toFixed?.(2) ?? ""}</td><td style="text-align:right">${x.diamMenorM?.toFixed?.(2) ?? ""}</td><td style="text-align:right">${x.lengthM?.toFixed?.(2) ?? ""}</td><td style="text-align:right">${x.volumeM3 != null ? fmtM3(x.volumeM3) : ""}</td></tr>`).join("");
  const vol = g.volumenTotalM3 ? Number(g.volumenTotalM3).toFixed(4) : "0";

  // QR real: codifica una cadena de verificación interna escaneable
  let qrSvg = "";
  try {
    const QRCode = (await import("qrcode")).default;
    const payload = `BSM-GTF|N:${g.gtfNumber}|TIT:${g.titularName ?? ""}|TH:${g.tituloHabilitante ?? ""}|VOL:${vol}m3|F:${fmtDate(g.gtfDate)}`;
    qrSvg = await QRCode.toString(payload, { type: "svg", margin: 1, width: 118, errorCorrectionLevel: "M" });
  } catch {
    qrSvg = `<div style="font-family:monospace">◫◫◫</div>`;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GTF ${esc(g.gtfNumber)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px;font-size:12px}
    h1{font-size:16px;margin:0} .sub{color:#555;font-size:11px}
    .box{border:1px solid #999;border-radius:6px;padding:10px 12px;margin-top:10px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}
    .k{color:#666} .v{font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
    th,td{border:1px solid #ccc;padding:4px 6px} th{background:#f0f0f0;text-align:left}
    .tot{text-align:right;font-weight:bold;margin-top:6px;font-size:13px}
    .qr{float:right;border:2px solid #111;border-radius:8px;padding:8px;text-align:center;font-family:monospace;font-size:10px;width:120px}
    .dj{margin-top:14px;font-size:10px;color:#444;border-top:1px dashed #999;padding-top:8px}
    .anul{color:#b00;font-weight:bold;border:2px solid #b00;display:inline-block;padding:2px 8px;border-radius:4px}
  </style></head><body onload="window.print()">
    <div class="qr">${qrSvg}<div style="font-size:9px;margin-top:4px">verif. interna</div></div>
    <h1>GUÍA DE TRANSPORTE FORESTAL</h1>
    <div class="sub">Documento interno de gestión — no oficial (la GTF oficial se emite por SNIFFS)</div>
    ${g.status === "anulada" ? `<div class="anul">ANULADA — ${esc(g.annulledReason)}</div>` : ""}
    <div class="box"><div class="grid">
      <div><span class="k">N° GTF:</span> <span class="v">${esc(g.gtfNumber)}</span></div>
      <div><span class="k">Fecha:</span> <span class="v">${fmtDate(g.gtfDate)}</span></div>
      <div><span class="k">Titular:</span> <span class="v">${esc(g.titularName ?? "—")}</span></div>
      <div><span class="k">Título habilitante:</span> <span class="v">${esc(g.tituloHabilitante ?? "—")}</span></div>
      <div><span class="k">Parcela de corta:</span> <span class="v">${esc(g.parcelaCorta ?? "—")}</span></div>
      <div><span class="k">Tipo:</span> <span class="v">${g.tipo === "producto" ? "Producto terminado" : "Trozas"}</span></div>
    </div></div>
    <div class="box"><div class="grid">
      <div><span class="k">Transportista:</span> <span class="v">${esc(g.transportista ?? "—")}</span> ${g.transportistaDoc ? `(${esc(g.transportistaDoc)})` : ""}</div>
      <div><span class="k">Conductor:</span> <span class="v">${esc(g.conductor ?? "—")}</span> ${g.conductorLicencia ? `Lic. ${esc(g.conductorLicencia)}` : ""}</div>
      <div><span class="k">Placa:</span> <span class="v">${esc(g.placaVehiculo ?? "—")}</span></div>
      <div><span class="k">Origen → Destino:</span> <span class="v">${esc(g.origen ?? "—")} → ${esc(g.destino ?? "—")}</span></div>
    </div></div>
    <h3 style="margin:14px 0 0">Lista de trozas / productos</h3>
    <table><thead><tr><th>N°</th><th>Código</th><th>Especie</th><th>Ø may (m)</th><th>Ø men (m)</th><th>Long. (m)</th><th>Vol. (m³)</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot">Volumen total: ${vol} m³ · ${items.length} piezas</div>
    ${g.observations ? `<div class="box"><span class="k">Observaciones:</span> ${esc(g.observations)}</div>` : ""}
    <div class="dj">Declaración jurada: la información consignada es veraz y los productos provienen del título habilitante señalado. La presente guía no presenta enmendaduras ni alteraciones.</div>
    <div style="margin-top:30px;display:flex;justify-content:space-between"><div>______________________<br>Firma del emisor</div><div>______________________<br>Sello</div></div>
  </body></html>`;
  const w = window.open("", "_blank", "width=820,height=900");
  if (w) { w.document.write(html); w.document.close(); }
}

const I = "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>{children}</label>;
}
