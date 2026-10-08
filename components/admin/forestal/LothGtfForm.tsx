"use client";

/**
 * «Anotar una guía» de la vista GTF del Libro TH (ADR-126 Fase 4): la guía
 * interna para un despacho que ya está en el libro y no tiene su guía. Las
 * trozas tienen que figurar en el Trozado/Despacho del libro (validación GTF ↔
 * libro). Salió de `LothGtfView` (08-10, la vista pasaba de 960 líneas).
 *
 * Dos códigos por troza (Brandon 08-10, ADR-474): «Código único» = el del libro
 * (con él se valida y se ata la línea) y «Código en la guía» = el impreso en el
 * papel, si difiere. Sin tipearlo, es el mismo.
 */

import { useEffect, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Loader2, Plus, ShieldCheck, Trash2, Truck } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { leerPlaca } from "@/lib/forestal/placa-peru";
import VerificarGtfSerfor from "./VerificarGtfSerfor";
import { CampoPlaca } from "./ctp-campo-placa";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import type { GtfItem } from "./gtf-tabla-columnas";

const smalian = (dM: number, dm: number, L: number) =>
  dM > 0 && dm > 0 && L > 0 ? Math.round(0.7854 * Math.pow((dM + dm) / 2, 2) * L * 10000) / 10000 : 0;

export default function LothGtfForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const permiso = useLothPermiso();
  const planElegido = permiso?.plan ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    gtfNumber: "", gtfDate: new Date().toISOString().slice(0, 10), tipo: "trozas",
    titularName: "", tituloHabilitante: "", parcelaCorta: "",
    transportista: "", transportistaDoc: "", conductor: "", conductorLicencia: "", placaVehiculo: "",
    origen: "", destino: "", observations: "",
  });
  const [items, setItems] = useState<GtfItem[]>([]);
  const [it, setIt] = useState({ code: "", codigoGuia: "", species: "", diamMayorM: "", diamMenorM: "", lengthM: "" });
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

  // Prefill titular/título: el plan ELEGIDO en el libro si hay uno; si no, el plan activo.
  useEffect(() => {
    if (planElegido) {
      setF((s) => ({ ...s, titularName: planElegido.titularName ?? "", tituloHabilitante: planElegido.tituloHabilitante ?? "" }));
      /* La parcela de corta no viaja en la lista del libro: se lee del plan elegido, como con el plan activo. */
      const ac = new AbortController();
      fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(planElegido.id)}`, { credentials: "include", signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { const pc = j?.plan?.parcelaCorta; if (typeof pc === "string" && pc) setF((s) => ({ ...s, parcelaCorta: pc })); })
        .catch((err) => { if (!ac.signal.aborted) console.warn("[loth-gtf] no se pudo precargar la parcela del plan elegido", err); });
      return () => ac.abort();
    }
    fetch("/api/admin/forestal/plan?active=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const p = j?.active; if (p) setF((s) => ({ ...s, titularName: p.titularName ?? "", tituloHabilitante: p.tituloHabilitante ?? "", parcelaCorta: p.parcelaCorta ?? "" })); })
      // Prefill best-effort: si no hay plan activo, el usuario completa a mano.
      .catch((err) => console.warn("[loth-gtf] no se pudo precargar el plan activo", err));
  }, [planElegido]);

  const autoVol = smalian(Number(it.diamMayorM), Number(it.diamMenorM), Number(it.lengthM));
  function addItem() {
    if (!it.code.trim() && !it.species.trim()) return;
    const m = findSpeciesByCommonName(it.species);
    setItems((arr) => [...arr, {
      code: it.code.trim() || null,
      /* Sólo si el papel dice otro código (ADR-474): sin tipearlo, es el mismo. */
      codigoGuia: it.codigoGuia.trim() && it.codigoGuia.trim() !== it.code.trim() ? it.codigoGuia.trim() : null,
      species: it.species.trim() || null, scientific: m?.scientificName ?? null, cites: m?.cites ?? false,
      diamMayorM: it.diamMayorM ? Number(it.diamMayorM) : null, diamMenorM: it.diamMenorM ? Number(it.diamMenorM) : null,
      lengthM: it.lengthM ? Number(it.lengthM) : null, volumeM3: autoVol || null,
    }]);
    setIt({ code: "", codigoGuia: "", species: it.species, diamMayorM: "", diamMenorM: "", lengthM: "" });
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
  /* La guía la emite el bosque: una placa que no puede existir no sale (la
     misma regla que «Despachar con guía»; el servidor también la rechaza). */
  const lecturaPlaca = leerPlaca(f.placaVehiculo);
  const placaInvalida = lecturaPlaca.estado === "invalida" ? lecturaPlaca.motivo : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems || hasMissingRequired || placaInvalida) return;
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { items };
      for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
      body.gtfNumber = f.gtfNumber.trim();
      /* La guía nueva queda atada al permiso elegido: así el filtro del libro la encuentra. */
      if (planElegido) body.planId = planElegido.id;
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
        <CampoPlaca label="Placa vehículo" required valor={f.placaVehiculo} onCambio={(v) => set("placaVehiculo", v)} />
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
          <button type="button" onClick={loadDespachadas} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            <Plus className="h-3.5 w-3.5" /> Cargar trozas despachadas
          </button>
        </div>
        <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-7">
          <Field label="Código único"><input value={it.code} onChange={(e) => setItem("code", e.target.value)} placeholder="85-TOR-A" className={I} /></Field>
          <Field label="Código en la guía"><input value={it.codigoGuia} onChange={(e) => setItem("codigoGuia", e.target.value)} placeholder={it.code.trim() || "el mismo"} className={I} /></Field>
          <Field label="Especie"><input value={it.species} onChange={(e) => setItem("species", e.target.value)} placeholder="Tornillo" className={I} /></Field>
          <Field label="Ø mayor"><input type="number" step="0.001" value={it.diamMayorM} onChange={(e) => setItem("diamMayorM", e.target.value)} className={I} /></Field>
          <Field label="Ø menor"><input type="number" step="0.001" value={it.diamMenorM} onChange={(e) => setItem("diamMenorM", e.target.value)} className={I} /></Field>
          <Field label={`Long. ${autoVol > 0 ? `→ ${fmtM3(autoVol)}` : ""}`}><input type="number" step="0.01" value={it.lengthM} onChange={(e) => setItem("lengthM", e.target.value)} className={I} /></Field>
          <button type="button" onClick={addItem} className="h-10 rounded-xl bg-[var(--accent-dark)] text-sm font-semibold text-white hover:brightness-110">+ Agregar</button>
        </div>
        {items.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <DataTable className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--text-tertiary)]"><tr><th className="py-1">Código en la guía</th><th>Código único</th><th>Especie</th><th className="text-right">Ø may</th><th className="text-right">Ø men</th><th className="text-right">Long.</th><th className="text-right">Vol. m³</th><th></th></tr></thead>
              <tbody>
                {items.map((x, i) => (
                  <tr key={i} className={`border-t border-[var(--rule-soft)] ${invalidCodes.has(i) ? "bg-[var(--data-error-50)]" : ""}`}>
                    <td className="py-1.5 font-mono text-[var(--text-secondary)]">{x.codigoGuia || x.code || "—"}</td>
                    <td className="py-1.5 font-mono font-bold text-[var(--text-primary)]">
                      {x.code ?? "—"}
                      {invalidCodes.has(i) && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-[var(--data-error-600)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-white leading-none">
                          no está en el libro
                        </span>
                      )}
                    </td>
                    <td>{x.species ?? "—"}{x.cites && <span className="ml-1 rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}</td>
                    <td className="text-right font-mono tabular-nums">{x.diamMayorM != null ? Number(x.diamMayorM).toFixed(2) : "—"}</td>
                    <td className="text-right font-mono tabular-nums">{x.diamMenorM != null ? Number(x.diamMenorM).toFixed(2) : "—"}</td>
                    <td className="text-right font-mono tabular-nums">{x.lengthM != null ? Number(x.lengthM).toFixed(2) : "—"}</td>
                    <td className="text-right font-mono tabular-nums font-bold">{x.volumeM3 != null ? fmtM3(x.volumeM3) : "—"}</td>
                    <td className="text-right"><button aria-label="Eliminar" type="button" onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))} className="text-[var(--data-error-600)]"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[var(--rule-base)] font-bold"><td colSpan={6} className="py-1.5 text-right">Volumen total</td><td className="text-right font-mono tabular-nums text-[var(--data-success-700)]">{fmtM3(totalVol)}</td><td></td></tr>
              </tbody>
            </DataTable>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
        <span className="text-xs font-semibold text-[var(--text-tertiary)]">
          {items.length} {items.length === 1 ? "ítem" : "ítems"} · <span className="font-mono tabular-nums">{fmtM3(totalVol)}</span> m³
          {items.length === 0 && <span className="ml-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">— agrega al menos una troza</span>}
          {items.length > 0 && hasMissingRequired && (
            <span className="ml-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">— completa transportista, conductor y placa</span>
          )}
          {!hasMissingRequired && placaInvalida && (
            <span className="ml-2 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">— la placa no es válida: {placaInvalida}</span>
          )}
          {selloSerfor && (
            <span className="ml-2 inline-flex items-center gap-1 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <ShieldCheck className="h-3.5 w-3.5" /> verificada en SERFOR ({selloSerfor.numeroRegistro})
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" disabled={busy || !f.gtfNumber.trim() || items.length === 0 || hasInvalidItems || hasMissingRequired || Boolean(placaInvalida)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Emitir GTF</button>
        </div>
      </div>
    </form>
  );
}

const I = "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>{children}</label>;
}
