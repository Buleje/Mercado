"use client";

/**
 * CtpEntryForm — alta de Producción / Despacho del Libro CTP (ADR-127).
 * Data-driven: Producción jala de los ingresos; Despacho de los productos en stock.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Truck, Loader2, X, Search, Check, AlertCircle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import CtpConsumosPicker, { sumConsumos, type ConsumoRow } from "./CtpConsumosPicker";
import CtpOrigenesPicker, { sumOrigenes, type OrigenRow } from "./CtpOrigenesPicker";
import { Field, I, Btn } from "./ctp-shared";

type CtpSection = "produccion" | "despacho";

interface Props {
  section: CtpSection;
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean; /** Quedó anotado en el patio, no en el libro. */ offline?: boolean }) => void;
}

interface SourceItem {
  kind: string; id?: string; code: string | null; species: string | null; scientific: string | null;
  cites?: boolean; vol?: number | null; disponible?: number | null; costoUnitario?: number | null; moneda?: string | null;
  quantity?: number | null; unit?: string | null; productType?: string | null;
}

const PRODUCT_TYPES = ["Madera aserrada", "Madera escuadrada", "Madera cuartoneada", "Tablillas", "Tablones", "Listones", "Durmientes", "Leña", "Carbón vegetal", "Otro"];
const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

const META: Record<CtpSection, { label: string; help: string; icon: typeof Boxes; sourceTitle: string }> = {
  produccion: { label: "Producción", help: "Transformación de materia prima en producto", icon: Boxes, sourceTitle: "Elegí el ingreso (materia prima)" },
  despacho: { label: "Despacho de producto", help: "Salida de producto transformado con GTF", icon: Truck, sourceTitle: "Elegí de qué corridas sale el despacho" },
};

export default function CtpEntryForm({ section, onClose, onSaved }: Props) {
  const meta = META[section];
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [materiaPrimaRef, setMateriaPrimaRef] = useState("");
  const [speciesCommon, setSpeciesCommon] = useState("");
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [volumeInputM3, setVolumeInputM3] = useState("");
  const [volumeTouched, setVolumeTouched] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"m3" | "kg" | "unidad" | "pt">("m3");
  const [pieces, setPieces] = useState("");
  const [gtfNumber, setGtfNumber] = useState("");
  const [destino, setDestino] = useState("");
  const [observations, setObservations] = useState("");

  // Producción: una corrida real mezcla varias guías (ADR-134). Cada fila es
  // un consumo (ingreso + m³ atribuidos); ver CtpConsumosPicker.
  const [consumos, setConsumos] = useState<ConsumoRow[]>([]);
  const [costoProceso, setCostoProceso] = useState("");

  // Despacho: de qué corridas de producción salió el producto (ADR-135).
  // Espejo de consumos, del otro lado de la cadena; ver CtpOrigenesPicker.
  const [origenes, setOrigenes] = useState<OrigenRow[]>([]);
  const [quantityTouched, setQuantityTouched] = useState(false);
  // 1ª corrida elegida fija producto/especie/unidad: el backend rechaza mezclar (TENANT_MISMATCH).
  const despachoLocked = section === "despacho" && origenes.length > 0;

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loadingSrc, setLoadingSrc] = useState(false);
  const [srcQuery, setSrcQuery] = useState("");

  const loadSources = useCallback(async () => {
    setLoadingSrc(true);
    try {
      const r = await fetch(`/api/admin/forestal/ctp?available=${section}`, { credentials: "include" });
      setSources(r.ok ? (await r.json()).items ?? [] : []);
    } catch { setSources([]); }
    finally { setLoadingSrc(false); }
  }, [section]);
  useEffect(() => { loadSources(); }, [loadSources]);

  function pick(it: SourceItem) {
    if (it.species) setSpeciesCommon(it.species);
    if (section === "produccion") {
      const id = it.id;
      if (!id) return;
      setConsumos((prev) => {
        if (prev.some((c) => c.woodEntryId === id)) return prev; // ya agregado: el backend lo rechaza igual (I1)
        const disponible = it.disponible ?? it.vol ?? 0;
        return [...prev, {
          woodEntryId: id, code: it.code, species: it.species,
          disponible, costoUnitario: it.costoUnitario ?? null, moneda: it.moneda ?? "PEN",
          volumeM3: disponible > 0 ? String(disponible) : "",
        }];
      });
    } else {
      const id = it.id;
      if (!id || origenes.some((o) => o.produccionEntryId === id)) return; // ya agregada: el backend la rechaza igual (I4)
      if (origenes.length === 0) {
        // 1ª corrida fija producto/unidad — a partir de acá el picker filtra el resto.
        if (it.productType) setProductType(it.productType);
        if (it.unit === "m3" || it.unit === "kg" || it.unit === "unidad" || it.unit === "pt") setUnit(it.unit);
      }
      const disponible = it.disponible ?? 0;
      setOrigenes((prev) => [...prev, {
        produccionEntryId: id, code: it.code, species: it.species,
        disponible, quantity: disponible > 0 ? String(disponible) : "",
      }]);
    }
  }

  const filtered = useMemo(() => {
    const q = srcQuery.trim().toLowerCase();
    let list = q ? sources.filter((s) => (s.code ?? "").toLowerCase().includes(q) || (s.species ?? "").toLowerCase().includes(q) || (s.productType ?? "").toLowerCase().includes(q)) : sources;
    if (section === "produccion") {
      // Un ingreso ya elegido desaparece del buscador: no se puede agregar dos veces.
      const picked = new Set(consumos.map((c) => c.woodEntryId));
      list = list.filter((s) => !s.id || !picked.has(s.id));
    }
    if (section === "despacho") {
      // Una corrida ya elegida desaparece del buscador: no se puede agregar dos veces.
      const picked = new Set(origenes.map((o) => o.produccionEntryId));
      list = list.filter((s) => !s.id || !picked.has(s.id));
      // El backend rechaza mezclar producto/especie/unidad distintos en un mismo
      // despacho: mejor filtrar acá que dejar elegir y fallar al guardar (TENANT_MISMATCH).
      if (origenes.length > 0) {
        const pt = productType.trim().toLowerCase();
        const sp = speciesCommon.trim().toLowerCase();
        list = list.filter((s) => (s.productType ?? "").trim().toLowerCase() === pt && (s.species ?? "").trim().toLowerCase() === sp && (s.unit ?? "") === unit);
      }
    }
    return list.slice(0, 60);
  }, [sources, srcQuery, section, consumos, origenes, productType, speciesCommon, unit]);

  /**
   * El vacío del picker tiene varias causas distintas y decirle "no hay nada" a
   * todas es mentira: el operador que ya eligió todas sus guías/corridas
   * creería que el módulo perdió sus datos.
   */
  const emptyPickerMsg = useMemo(() => {
    if (srcQuery.trim()) return "Ninguna coincide con la búsqueda.";
    if (section === "despacho") {
      if (sources.length > 0 && origenes.length > 0) return "Ya agregaste todas las corridas de este producto.";
      return "Sin corridas de producción con saldo para despachar.";
    }
    if (sources.length > 0) return "Ya agregaste todas las guías disponibles.";
    return "Sin ingresos de materia prima validados y con saldo.";
  }, [sources, srcQuery, section, origenes]);

  const rendimiento = useMemo(() => {
    const i = Number(volumeInputM3), o = Number(quantity);
    return section === "produccion" && i > 0 && o > 0 && unit === "m3" ? Math.round((o / i) * 10000) / 100 : null;
  }, [volumeInputM3, quantity, unit, section]);

  // Volumen/cantidad declarada: se autocompleta con el total atribuido (caso normal),
  // pero deja de seguirlo apenas el usuario lo edita a mano (atribución parcial legítima).
  const totalAtribuido = useMemo(
    () => (section === "produccion" ? sumConsumos(consumos) : sumOrigenes(origenes)),
    [consumos, origenes, section],
  );
  useEffect(() => {
    if (section === "produccion" && !volumeTouched) setVolumeInputM3(totalAtribuido > 0 ? String(totalAtribuido) : "");
    if (section === "despacho" && !quantityTouched) setQuantity(totalAtribuido > 0 ? String(totalAtribuido) : "");
  }, [totalAtribuido, volumeTouched, quantityTouched, section]);

  const consumosOk = section !== "produccion" || consumos.every((c) => {
    const v = Number(c.volumeM3);
    return v > 0 && v <= c.disponible + 1e-9;
  });
  const sobreAtribuido = section === "produccion" && consumos.length > 0
    && Math.round((totalAtribuido - (Number(volumeInputM3) || 0)) * 10000) / 10000 > 0;

  const origenesOk = section !== "despacho" || origenes.every((o) => {
    const v = Number(o.quantity);
    return v > 0 && v <= o.disponible + 1e-9;
  });
  const sobreAtribuidoDespacho = section === "despacho" && origenes.length > 0
    && Math.round((totalAtribuido - (Number(quantity) || 0)) * 10000) / 10000 > 0;

  const isValid = section === "produccion"
    ? productType.trim().length > 0 && Number(quantity) > 0 && consumosOk && !sobreAtribuido
    : productType.trim().length > 0 && Number(quantity) > 0 && gtfNumber.trim().length > 0 && origenesOk && !sobreAtribuidoDespacho;

  async function submit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (submitting || !isValid) { if (!isValid) setError("Completá los campos obligatorios."); return; }
    setSubmitting(true); setError(null);
    const matched = findSpeciesByCommonName(speciesCommon);
    try {
      const payload: Record<string, unknown> = {
        section, entryDate: new Date(entryDate).toISOString(),
        speciesCommon: speciesCommon.trim() || null, speciesScientific: matched?.scientificName ?? null, cites: matched?.cites ?? false,
        productType, quantity: Number(quantity), unit, observations: observations.trim() || null,
      };
      if (section === "produccion") {
        // GTF de ingreso ya no se tipea a mano: se resume de las guías elegidas.
        payload.gtfIngreso = consumos.length ? consumos.map((c) => c.code).filter(Boolean).join(", ") : null;
        payload.materiaPrimaRef = materiaPrimaRef.trim() || null;
        payload.volumeInputM3 = volumeInputM3 ? Number(volumeInputM3) : null;
        payload.costoProceso = costoProceso ? Number(costoProceso) : null;
        if (consumos.length) payload.consumos = consumos.map((c) => ({ woodEntryId: c.woodEntryId, volumeM3: Number(c.volumeM3) }));
      } else {
        payload.pieces = pieces ? Number(pieces) : null;
        payload.gtfNumber = gtfNumber.trim() || null;
        payload.destino = destino.trim() || null;
        if (origenes.length) payload.origenes = origenes.map((o) => ({ produccionEntryId: o.produccionEntryId, quantity: Number(o.quantity) }));
      }
      let r: Response;
      try {
        r = await fetch("/api/admin/forestal/ctp", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      } catch (netErr) {
        // Sin señal en el patio: se anota en el equipo y sube sola después. El
        // dato NO se pierde y NO se dice que quedó en el libro (no quedó).
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const { anotar, URL_CTP } = await import("@/lib/forestal/patio-cola");
          await anotar(section, payload, URL_CTP);
          onSaved({ offline: true });
          return;
        }
        throw netErr;
      }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      if (keepOpen) {
        setMateriaPrimaRef(""); setVolumeInputM3(""); setVolumeTouched(false); setQuantity(""); setPieces(""); setGtfNumber(""); setDestino(""); setObservations("");
        setConsumos([]); setCostoProceso("");
        setOrigenes([]); setQuantityTouched(false);
        setSubmitting(false); onSaved({ keepOpen: true }); loadSources();
      } else onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const Icon = meta.icon;
  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:max-w-[1200px]">
      <div className="flex h-full max-h-[92vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">{meta.label}</CardTitle>
              <p className="truncate text-xs text-[var(--text-tertiary)]">CTP · {meta.help}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
        <form id="ctp-entry-form" onSubmit={submit} className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4 sm:content-start [&>*]:min-w-0 max-sm:space-y-4">
          {error && <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] sm:col-span-2">{error}</div>}

          <Field label="Fecha" required><input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className={I} /></Field>

          {/* Picker data-driven */}
          <div className="space-y-2 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 sm:col-span-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-700)]">{meta.sourceTitle}</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input value={srcQuery} onChange={(e) => setSrcQuery(e.target.value)} placeholder="Buscar..." className={`${I} h-9 pl-8`} />
            </div>
            <div className="max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
              {loadingSrc ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
                : filtered.length === 0 ? <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">{emptyPickerMsg}</div>
                : filtered.map((it, i) => (
                  <button key={i} type="button" onClick={() => pick(it)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--data-success-50)]">
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{it.code ?? it.productType ?? "—"}</span>
                      {it.kind === "corrida" && it.productType && <span className="truncate text-xs text-[var(--text-secondary)]">{it.productType}</span>}
                      {it.species && <span className="truncate text-sm text-[var(--text-secondary)]">{it.species}</span>}
                      {it.cites && <span className="rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{it.disponible != null ? `${Number(it.disponible).toFixed(4)} ${it.unit ? (UNIT_LABELS[it.unit] ?? it.unit) : "m³"} disp.` : it.vol != null ? `${Number(it.vol).toFixed(4)} m³` : it.quantity != null ? `stock ${Number(it.quantity).toFixed(2)} ${it.unit ?? ""}` : ""}</span>
                  </button>
                ))}
            </div>
          </div>

          <Field label="Especie" hint={despachoLocked ? "Lo fija la corrida elegida" : undefined}>
            <input value={speciesCommon} onChange={(e) => setSpeciesCommon(e.target.value)} disabled={despachoLocked} placeholder="Tornillo" className={`${I} disabled:cursor-not-allowed disabled:opacity-60`} />
          </Field>

          {section === "despacho" && (
            <div className="sm:col-span-2">
              <CtpOrigenesPicker
                origenes={origenes}
                onChangeQuantity={(id, value) => setOrigenes((prev) => prev.map((o) => (o.produccionEntryId === id ? { ...o, quantity: value } : o)))}
                onRemove={(id) => setOrigenes((prev) => prev.filter((o) => o.produccionEntryId !== id))}
                totalAtribuido={totalAtribuido}
                quantityDeclared={Number(quantity) || 0}
                unitLabel={UNIT_LABELS[unit] ?? unit}
              />
            </div>
          )}

          {section === "produccion" && (
            <>
              <Field label="Ref. materia prima" hint="Lote o acopio de origen (libre)"><input value={materiaPrimaRef} onChange={(e) => setMateriaPrimaRef(e.target.value)} placeholder="lote / acopio" className={I} /></Field>
              <div className="sm:col-span-2">
              <CtpConsumosPicker
                consumos={consumos}
                onChangeVolume={(id, value) => setConsumos((prev) => prev.map((c) => (c.woodEntryId === id ? { ...c, volumeM3: value } : c)))}
                onRemove={(id) => setConsumos((prev) => prev.filter((c) => c.woodEntryId !== id))}
                totalAtribuido={totalAtribuido}
                volumeDeclared={Number(volumeInputM3) || 0}
                costoProceso={costoProceso}
                onCostoProcesoChange={setCostoProceso}
                producedQty={Number(quantity) || 0}
                producedUnitLabel={UNIT_LABELS[unit] ?? unit}
              />
              </div>
              <Field label="Volumen consumido (m³)" hint="Se autocompleta con el total atribuido; editalo si la atribución es parcial">
                <input type="number" step="0.0001" value={volumeInputM3} onChange={(e) => { setVolumeInputM3(e.target.value); setVolumeTouched(true); }} placeholder="2.13" className={`${I} font-mono tabular-nums`} />
              </Field>
            </>
          )}

          <Field label="Tipo de producto" required hint={despachoLocked ? "Lo fija la corrida elegida" : undefined}>
            <select value={productType} onChange={(e) => setProductType(e.target.value)} disabled={despachoLocked} className={`${I} disabled:cursor-not-allowed disabled:opacity-60`}>{PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          </Field>

          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            {section === "despacho" && <Field label="N° piezas"><input type="number" min="0" value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="25" className={I} /></Field>}
            <Field label={section === "produccion" ? "Producido" : "Cantidad"} required hint={section === "despacho" ? "Se autocompleta con el total atribuido" : undefined}>
              <input type="number" step="0.0001" value={quantity} onChange={(e) => { setQuantity(e.target.value); if (section === "despacho") setQuantityTouched(true); }} placeholder="1.90" className={`${I} font-mono tabular-nums`} />
            </Field>
            <Field label="Unidad" required hint={despachoLocked ? "Lo fija la corrida elegida" : undefined}>
              <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} disabled={despachoLocked} className={`${I} disabled:cursor-not-allowed disabled:opacity-60`}><option value="m3">m³</option><option value="kg">Kg</option><option value="pt">pt</option><option value="unidad">Unidad</option></select>
            </Field>
          </div>

          {rendimiento != null && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--data-success-50)] px-3 py-2 text-xs text-[var(--data-success-700)] sm:col-span-2"><Check className="h-3.5 w-3.5" /> Rendimiento: <b>{rendimiento}%</b> (producido / consumido)</div>
          )}

          {section === "despacho" && (
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Field label="N° de GTF" required><input value={gtfNumber} onChange={(e) => setGtfNumber(e.target.value)} placeholder="001-00000025" className={`${I} font-mono`} /></Field>
              <Field label="Destino"><input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Industria / cliente" className={I} /></Field>
            </div>
          )}

          <div className="sm:col-span-2"><Field label="Observaciones"><textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} placeholder="Información adicional..." className={`${I} h-auto resize-none py-2.5`} /></Field></div>
        </form>

        {/* ── Panel derecho: vista previa en vivo (lg+) ─────────── */}
        <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[var(--rule-base)] bg-[var(--surface-canvas)] lg:flex">
          <div className="border-b border-[var(--rule-soft)] px-5 py-3.5">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Vista previa del registro</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-5">
              <CardTitle className="text-lg font-bold leading-tight text-[var(--text-primary)]">{productType}</CardTitle>
              {speciesCommon.trim() && <p className="mt-0.5 text-xs italic text-[var(--text-tertiary)]">{speciesCommon.trim()}</p>}
            </div>
            <div className="mb-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{section === "produccion" ? "Producido" : "A despachar"}</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">{quantity ? Number(quantity).toLocaleString("es-PE", { maximumFractionDigits: 4 }) : "0"}<span className="ml-1 text-sm font-medium text-[var(--text-tertiary)]">{UNIT_LABELS[unit] ?? unit}</span></div>
              {section === "produccion" && rendimiento != null && <div className="mt-1.5 flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]"><Check className="h-3 w-3" /> Rendimiento {rendimiento}%</div>}
            </div>
            <dl className="space-y-2.5">
              <PreviewRow label="Fecha" value={entryDate || "—"} />
              {section === "produccion" ? (
                <>
                  <PreviewRow label="Consumido" value={volumeInputM3 ? `${volumeInputM3} m³` : "—"} mono />
                  <PreviewRow label="Atribuido" value={totalAtribuido > 0 ? totalAtribuido.toFixed(4) : "—"} mono />
                  <PreviewRow label="Costo proceso" value={costoProceso ? `S/ ${costoProceso}` : "—"} mono />
                </>
              ) : (
                <>
                  <PreviewRow label="GTF salida" value={gtfNumber.trim() || "—"} mono />
                  <PreviewRow label="Destino" value={destino.trim() || "—"} />
                  <PreviewRow label="Piezas" value={pieces ? Number(pieces).toLocaleString("es-PE") : "—"} />
                  <PreviewRow label="Atribuido" value={totalAtribuido > 0 ? totalAtribuido.toFixed(4) : "—"} mono />
                </>
              )}
            </dl>
          </div>
          <div className="border-t border-[var(--rule-soft)] px-5 py-4">
            {isValid ? (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--data-success-50)] px-3 py-2 text-sm font-medium text-[var(--data-success-700)]"><Check className="h-4 w-4 shrink-0" /> Listo para registrar</div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--data-warning-50)] px-3 py-2 text-sm font-medium text-[var(--data-warning-700)]"><AlertCircle className="h-4 w-4 shrink-0" /> Completá los obligatorios</div>
            )}
          </div>
        </aside>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3.5 sm:px-6">
          <div className="hidden items-center gap-1.5 text-xs text-[var(--text-tertiary)] sm:flex">
            {isValid ? <><Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" /><span>Listo para registrar</span></> : <span>Completá los obligatorios</span>}
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Btn variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Btn>
            <Btn variant="secondary" onClick={(e) => submit(e, true)} disabled={!isValid || submitting}>Guardar y otro</Btn>
            <Btn variant="primary" type="submit" form="ctp-entry-form" disabled={!isValid || submitting}>{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar"}</Btn>
          </div>
        </footer>
      </div>
    </AdminModal>
  );
}

function PreviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
