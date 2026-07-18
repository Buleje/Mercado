"use client";

/**
 * LothGtfView — Guías de Transporte Forestal (GTF), ADR-126 Fase 4.
 * Emite GTF con lista de trozas + datos de transporte, e imprime el documento.
 * Interna, no oficial (la GTF oficial se emite vía SNIFFS).
 */

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Printer, Ban, Loader2, Trash2, Truck, LogIn } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { CTP_INGRESAR_GTF_KEY, CTP_MODULE_TAB_ID } from "./ctp-shared";

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

export default function LothGtfView() {
  const [gtfs, setGtfs] = useState<Gtf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annulId, setAnnulId] = useState<string | null>(null);
  // Puente inverso: GTF de trozas emitidas que aún no ingresaron al CTP —
  // mismo conjunto que la bandeja del lado planta (single source: ?sinIngresar=1).
  const [sinIngresar, setSinIngresar] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rGtf, rPend] = await Promise.all([
        fetch("/api/admin/forestal/gtf", { credentials: "include" }),
        fetch("/api/admin/forestal/gtf?sinIngresar=1", { credentials: "include" }),
      ]);
      if (rGtf.ok) setGtfs((await rGtf.json()).gtfs ?? []);
      if (rPend.ok) {
        const pend = ((await rPend.json()).gtfs ?? []) as { gtfNumber: string }[];
        setSinIngresar(new Set(pend.map((g) => g.gtfNumber)));
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /** Manda la guía al Libro CTP: deja el N° en sessionStorage y navega al módulo. */
  function ingresarAlCtp(gtfNumber: string) {
    try { sessionStorage.setItem(CTP_INGRESAR_GTF_KEY, gtfNumber); } catch { /* modo privado: el form abre vacío, no rompe */ }
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId: CTP_MODULE_TAB_ID } }));
  }

  async function annul(id: string, reason: string) {
    await fetch("/api/admin/forestal/gtf", {
      method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
      body: JSON.stringify({ id, action: "annul", reason }),
    });
    setAnnulId(null); load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Truck className="h-4 w-4" /> Guías de Transporte Forestal · interno (oficial = SNIFFS)</div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Emitir GTF
        </button>
      </div>

      {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}

      {showForm && <GtfForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}

      {loading && <div className="p-6 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}

      {!loading && (
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr>{["N° GTF", "Fecha", "Tipo", "Titular", "Destino", "Vol. m³", "Estado", "Acciones"].map((h, i) => <th key={i} className={`px-4 py-2.5 font-bold text-[var(--text-primary)] ${i === 5 ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {gtfs.map((g) => (
                <tr key={g.id} className={`border-t border-[var(--rule-soft)] ${g.status === "anulada" ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5"><span className="font-mono font-bold text-[var(--text-primary)]">{g.gtfNumber}</span></td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{fmtDate(g.gtfDate)}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">{g.tipo === "producto" ? "Producto" : "Trozas"}</span></td>
                  <td className="px-4 py-2.5 text-[var(--text-primary)]">{g.titularName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{g.destino ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right"><span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{g.volumenTotalM3 ? Number(g.volumenTotalM3).toFixed(4) : "—"}</span></td>
                  <td className="px-4 py-2.5">{g.status === "anulada" ? <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">ANULADA</span> : <span className="rounded-full bg-[var(--data-success-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]">Emitida</span>}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {g.tipo !== "producto" && g.status !== "anulada" && sinIngresar.has(g.gtfNumber) && (
                        <button
                          type="button"
                          onClick={() => ingresarAlCtp(g.gtfNumber)}
                          title="Registrar estas trozas como ingreso en el Libro de Operaciones del CTP"
                          className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 text-xs font-bold text-[var(--accent-dark)] hover:bg-[var(--accent-muted)]"
                        >
                          <LogIn className="h-3.5 w-3.5" /> Ingresar al CTP
                        </button>
                      )}
                      <button type="button" onClick={() => printGtf(g)} title="Imprimir" className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Printer className="h-3.5 w-3.5" /> Imprimir</button>
                      {g.status !== "anulada" && (annulId === g.id ? (
                        <AnnulInline onConfirm={(r) => annul(g.id, r)} onCancel={() => setAnnulId(null)} />
                      ) : (
                        <button type="button" onClick={() => setAnnulId(g.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]"><Ban className="h-3.5 w-3.5" /></button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {gtfs.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-tertiary)]"><FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin GTF emitidas. Hacé click en &quot;Emitir GTF&quot;.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnnulInline({ onConfirm, onCancel }: { onConfirm: (r: string) => void; onCancel: () => void }) {
  const [r, setR] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Motivo" autoFocus className="h-8 w-32 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs text-[var(--text-primary)] outline-none" />
      <button type="button" disabled={r.trim().length < 3} onClick={() => onConfirm(r.trim())} className="h-8 rounded-lg bg-[var(--data-error-600)] px-2 text-xs font-bold text-white disabled:opacity-50">OK</button>
      <button type="button" onClick={onCancel} className="h-8 rounded-lg border-2 border-[var(--rule-base)] px-2 text-xs font-bold text-[var(--text-primary)]">✕</button>
    </span>
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

  // ── Validación GTF ↔ Libro de Operaciones ──────────────────────────────
  // codesInLibro: set de códigos registrados en el libro (sección trozado/despacho).
  // null = cargando todavía; Set vacío podría significar "no hay trozas aún".
  const [codesInLibro, setCodesInLibro] = useState<Set<string> | null>(null);
  const [libroErr, setLibroErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/forestal/loth?available=despacho_troza", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        const codes = new Set<string>(
          ((j.items ?? []) as Array<{ code?: string | null }>)
            .map((x) => x.code?.trim() ?? "")
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems) return;
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

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5">
      {err && <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)]">{err}</div>}
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
        <Field label="Transportista"><input value={f.transportista} onChange={(e) => set("transportista", e.target.value)} className={I} /></Field>
        <Field label="Doc. transportista"><input value={f.transportistaDoc} onChange={(e) => set("transportistaDoc", e.target.value)} className={I} /></Field>
        <Field label="Conductor"><input value={f.conductor} onChange={(e) => set("conductor", e.target.value)} className={I} /></Field>
        <Field label="Placa vehículo"><input value={f.placaVehiculo} onChange={(e) => set("placaVehiculo", e.target.value)} placeholder="ABC-123" className={I} /></Field>
      </div>
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
          <Field label={`Long. ${autoVol > 0 ? `→ ${autoVol.toFixed(4)}` : ""}`}><input type="number" step="0.01" value={it.lengthM} onChange={(e) => setItem("lengthM", e.target.value)} className={I} /></Field>
          <button type="button" onClick={addItem} className="h-10 rounded-lg bg-[var(--data-success-700)] text-sm font-bold text-white hover:opacity-90">+ Agregar</button>
        </div>
        {items.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
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
                    <td className="text-right font-mono tabular-nums font-bold">{x.volumeM3?.toFixed(4) ?? "—"}</td>
                    <td className="text-right"><button type="button" onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))} className="text-[var(--data-error-600)]"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[var(--rule-base)] font-bold"><td colSpan={5} className="py-1.5 text-right">Volumen total</td><td className="text-right font-mono tabular-nums text-[var(--data-success-700)]">{totalVol.toFixed(4)}</td><td></td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">{items.length} ítems · {totalVol.toFixed(4)} m³</span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" disabled={busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--data-success-700)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Emitir GTF"}</button>
        </div>
      </div>
    </form>
  );
}

// ─── Impresión (ventana nueva, aislada) — QR real vía lazy-import ───────────
async function printGtf(g: Gtf) {
  const items = Array.isArray(g.items) ? g.items : [];
  const rows = items.map((x, i) => `<tr><td>${i + 1}</td><td>${x.code ?? ""}</td><td>${x.species ?? ""}${x.cites ? " <b>(CITES)</b>" : ""}</td><td style="text-align:right">${x.diamMayorM?.toFixed?.(2) ?? ""}</td><td style="text-align:right">${x.diamMenorM?.toFixed?.(2) ?? ""}</td><td style="text-align:right">${x.lengthM?.toFixed?.(2) ?? ""}</td><td style="text-align:right">${x.volumeM3?.toFixed?.(4) ?? ""}</td></tr>`).join("");
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GTF ${g.gtfNumber}</title>
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
    ${g.status === "anulada" ? `<div class="anul">ANULADA — ${g.annulledReason ?? ""}</div>` : ""}
    <div class="box"><div class="grid">
      <div><span class="k">N° GTF:</span> <span class="v">${g.gtfNumber}</span></div>
      <div><span class="k">Fecha:</span> <span class="v">${fmtDate(g.gtfDate)}</span></div>
      <div><span class="k">Titular:</span> <span class="v">${g.titularName ?? "—"}</span></div>
      <div><span class="k">Título habilitante:</span> <span class="v">${g.tituloHabilitante ?? "—"}</span></div>
      <div><span class="k">Parcela de corta:</span> <span class="v">${g.parcelaCorta ?? "—"}</span></div>
      <div><span class="k">Tipo:</span> <span class="v">${g.tipo === "producto" ? "Producto terminado" : "Trozas"}</span></div>
    </div></div>
    <div class="box"><div class="grid">
      <div><span class="k">Transportista:</span> <span class="v">${g.transportista ?? "—"}</span> ${g.transportistaDoc ? `(${g.transportistaDoc})` : ""}</div>
      <div><span class="k">Conductor:</span> <span class="v">${g.conductor ?? "—"}</span> ${g.conductorLicencia ? `Lic. ${g.conductorLicencia}` : ""}</div>
      <div><span class="k">Placa:</span> <span class="v">${g.placaVehiculo ?? "—"}</span></div>
      <div><span class="k">Origen → Destino:</span> <span class="v">${g.origen ?? "—"} → ${g.destino ?? "—"}</span></div>
    </div></div>
    <h3 style="margin:14px 0 0">Lista de trozas / productos</h3>
    <table><thead><tr><th>N°</th><th>Código</th><th>Especie</th><th>Ø may (m)</th><th>Ø men (m)</th><th>Long. (m)</th><th>Vol. (m³)</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot">Volumen total: ${vol} m³ · ${items.length} piezas</div>
    ${g.observations ? `<div class="box"><span class="k">Observaciones:</span> ${g.observations}</div>` : ""}
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
