"use client";

/**
 * Productos e inventario › Vencimientos: los lotes con fecha de vencimiento.
 *
 * Tarea propia (no es un filtro de Entradas y salidas): un lote es otra cosa
 * que un movimiento (`Batch`), con su fecha, su costo y su proveedor. «Dar de
 * baja» sí crea un movimiento: la pérdida «Vencimiento» que se ve en Entradas
 * y salidas › Pérdidas.
 *
 * Cabecera en una fila (título · Indicadores · Registrar lote · Más); las
 * cuatro tarjetas-filtro (Vencidos, Esta semana…) pasan a chips con su cuenta
 * en la fila de filtros, y la lista de tarjetas a una tabla.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Download, Loader2, Plus, RefreshCw } from "@buleje/design-system/icons";
import { toast } from "sonner";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { exportToCSV, limaDateKey } from "@/lib/utils";
import { CabeceraVista, CuerpoDeSeccion } from "./movimientos/CabeceraVista";
import { AvisoDeError, Chips } from "./movimientos/controles";
import { darDeBajaLote } from "./movimientos/baja-de-lote";
import { ModalRegistrarLote } from "./movimientos/ModalRegistrarLote";
import { TablaLotes, URGENCIA } from "./movimientos/TablaLotes";
import { diaConNombre } from "./movimientos/tipos";
import { useIndicadoresLotes } from "./movimientos/use-indicadores";
import { conDias, contarLotes, fraseDeDias, type Lote, type LoteConDias, type Urgencia } from "./movimientos/vencimientos";
import CampoBuscar from "@/components/ui-system/CampoBuscar";

type Producto = { id: number; name: string; unit: string };
type Filtro = Urgencia | "todos";
const CLAVE_REVISADOS = "expiry-reviewed";

function leerRevisados(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { const raw = localStorage.getItem(CLAVE_REVISADOS); return raw ? new Set(JSON.parse(raw) as string[]) : new Set(); } catch { return new Set(); }
}

export default function SimpleExpiryTab() {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [registrar, setRegistrar] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [revisados, setRevisados] = useState<Set<string>>(leerRevisados);
  const hoy = limaDateKey();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [bRes, pRes] = await Promise.all([
        fetch("/api/batches?limit=200", { credentials: "include" }),
        fetch("/api/products", { credentials: "include" }),
      ]);
      const bJson = await bRes.json().catch(() => null);
      if (!bRes.ok) throw new Error(bJson?.error ?? `error ${bRes.status}`);
      // La API pagina: { data, total }.
      setLotes(Array.isArray(bJson) ? bJson : (bJson?.data ?? []));
      setTotal(typeof bJson?.total === "number" ? bJson.total : null);
      const pJson = await pRes.json().catch(() => null);
      setProductos(Array.isArray(pJson) ? pJson.map((p: { id: number; name: string; unit?: string }) => ({ id: Number(p.id), name: p.name, unit: p.unit ?? "und" })) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const marcarRevisado = (id: string) => {
    setRevisados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(CLAVE_REVISADOS, JSON.stringify([...next])); } catch (err) { console.warn("[vencimientos] no se guardó «revisado»", err); }
      return next;
    });
  };

  /**
   * La pérdida va PRIMERO y con causa «Vencimiento»; si no se registra, el
   * lote se queda. Antes se mandaba sin `lossType` (Pérdidas decía «Rotura») y
   * sin mirar la respuesta. El reintento tras un fallo al quitar el lote no la
   * registra otra vez (`yaRegistradas`, ver `baja-de-lote.ts`).
   */
  const yaRegistradas = useRef<Set<string>>(new Set());
  const darDeBaja = async (b: LoteConDias) => {
    setConfirmando(null);
    try {
      const r = await darDeBajaLote(b, yaRegistradas.current, (url, init) =>
        fetch(url, { ...init, credentials: "include", headers: csrfHeaders(init.body ? { "Content-Type": "application/json" } : undefined) }));
      if (r.ok) { toast.success(r.mensaje); void cargar(); } else toast.error(r.mensaje);
    } catch { toast.error("Sin conexión"); }
  };

  const enriquecidos = useMemo(() => conDias(lotes, hoy), [lotes, hoy]);
  const cuentas = useMemo(() => contarLotes(enriquecidos), [enriquecidos]);
  const kpis = useIndicadoresLotes(cuentas, enriquecidos.length, cargando && lotes.length === 0);

  const filtrados = useMemo(() => {
    let lista = enriquecidos;
    if (filtro !== "todos") lista = lista.filter((b) => b.urgencia === filtro);
    const q = busca.trim().toLowerCase();
    if (q) lista = lista.filter((b) => [b.productName, b.lote, b.supplierName].some((t) => (t ?? "").toLowerCase().includes(q)));
    return lista;
  }, [enriquecidos, busca, filtro]);

  const chips = [
    { v: "todos" as const, label: "Todos", cuenta: enriquecidos.length },
    ...(["vencido", "critico", "pronto", "bien", "agotado"] as const)
      .filter((u) => u !== "agotado" || cuentas.agotado > 0)
      .map((u) => ({ v: u, label: URGENCIA[u].label, cuenta: cuentas[u] })),
  ];

  const acciones: MenuAccion[] = [
    {
      id: "csv", label: "Descargar para Excel", hint: `${filtrados.length} lotes, con los filtros puestos`, icon: Download, disabled: filtrados.length === 0,
      onSelect: () => exportToCSV(filtrados.map((b) => ({
        lote: b.lote, producto: b.productName, cantidad: b.quantity, unidad: b.unit, costo_unit: b.costUnit, valor: (b.quantity * (b.costUnit || 0)).toFixed(2),
        vence: diaConNombre(b.expiryDate), dias: b.dias, estado: b.urgencia === "agotado" ? "Sin stock" : fraseDeDias(b.dias), proveedor: b.supplierName ?? "",
      })), `vencimientos_${hoy}.csv`),
    },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void cargar() },
  ];

  return (
    <div className="space-y-3">
      <CabeceraVista
        titulo="Vencimientos"
        ayuda={{
          what: "Los lotes de mercadería con fecha de vencimiento: qué vence, cuándo y cuánto vale.",
          affects: "«Dar de baja» registra la pérdida «Vencimiento» (baja el stock) y quita el lote. «Revisado» se guarda sólo en este equipo.",
          example: "Llegan 12 yogures que vencen el jueves 15/10: registras el lote; ese lunes sale en «Esta semana».",
        }}
        indicadores={kpis.boton}
        accion={
          <button type="button" onClick={() => setRegistrar(true)} className={button({ variant: "primary", className: "shrink-0 rounded-xl" })}>
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden /> Registrar lote
          </button>
        }
        acciones={acciones}
        tituloMenu="Descargar y actualizar"
      />
      {kpis.panel}
      <CuerpoDeSeccion>
        {error && <AvisoDeError que="los lotes" error={error} onReintentar={() => void cargar()} />}
        {total != null && lotes.length < total && (
          <p className="text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">Se trajeron {lotes.length} de {total} lotes: las cuentas son de esos.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <CampoBuscar className="basis-56 sm:max-w-sm" valor={busca} onCambiar={setBusca} placeholder="Producto, lote o proveedor…" etiqueta="Buscar lotes" />
          <Chips opciones={chips} valor={filtro} onCambiar={setFiltro} etiqueta="Estado del lote" />
        </div>
        {cargando && lotes.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-secondary)]"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando vencimientos…</p>
        ) : filtrados.length === 0 ? (
          <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] py-10 text-center text-sm text-[var(--text-secondary)]">
            <CheckCircle className="h-5 w-5 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
            {filtro !== "todos" || busca.trim() ? "Ningún lote coincide con esos filtros." : "Sin lotes con vencimiento: con «Registrar lote» anotas el primero."}
          </p>
        ) : (
          <TablaLotes lotes={filtrados} revisados={revisados} confirmando={confirmando} onConfirmar={setConfirmando} onBaja={(b) => void darDeBaja(b)} onRevisado={marcarRevisado} />
        )}
      </CuerpoDeSeccion>

      {registrar && <ModalRegistrarLote productos={productos} onClose={() => setRegistrar(false)} onSaved={() => { setRegistrar(false); void cargar(); }} />}
    </div>
  );
}
