"use client";

/**
 * CacaoCampoMapa — mapa satelital para DIBUJAR el terreno y dividirlo en
 * secciones (polígonos) con código. Cada sección dibujada se colorea por el
 * estado de sus labores y abre su ficha al tocarla. Dibujo manual (click a
 * click, sin leaflet-draw). Fase 2 del tab Campo. Brandon 2026-07-02.
 */
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Undo2, Check, X, Layers, MapPin, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { BRAND_GEO } from "@/lib/geo";
import { PARCELA_STATUS } from "@/lib/cacao/cacao-labores";
import type { Parcela } from "./CacaoCampo";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const VARIEDADES = ["CCN-51", "criollo", "trinitario", "forastero", "nacional"];

function parseCoords(json: string | null): [number, number][] | null {
  if (!json) return null;
  try {
    const a = JSON.parse(json);
    if (Array.isArray(a) && a.length >= 3 && a.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"))) return a as [number, number][];
  } catch { /* json inválido */ }
  return null;
}
const centroid = (pts: [number, number][]): [number, number] => {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]] as [number, number], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
};

export default function CacaoCampoMapa({ parcelas, onOpenParcela, onChanged }: { parcelas: Parcela[]; onOpenParcela: (id: string) => void; onChanged: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet instances (dynamic import)
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polysRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streetRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [nVerts, setNVerts] = useState(0);
  const [layer, setLayer] = useState<"sat" | "street">("sat");
  const [pending, setPending] = useState<[number, number][] | null>(null);
  const vertsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const parcelasRef = useRef(parcelas);
  parcelasRef.current = parcelas;
  const onOpenRef = useRef(onOpenParcela);
  onOpenRef.current = onOpenParcela;

  const redrawDrawing = useCallback(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!drawRef.current) drawRef.current = L.layerGroup().addTo(map);
    drawRef.current.clearLayers();
    const v = vertsRef.current;
    if (v.length === 0) return;
    if (v.length >= 2) L.polygon(v, { color: "#facc15", weight: 2, dashArray: "5,5", fillOpacity: 0.15 }).addTo(drawRef.current);
    v.forEach((p, i) => L.circleMarker(p, { radius: 5, color: "#facc15", fillColor: "#fff", fillOpacity: 1, weight: 2 }).bindTooltip(String(i + 1)).addTo(drawRef.current));
  }, []);

  const renderPolys = useCallback(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!polysRef.current) polysRef.current = L.layerGroup().addTo(map);
    polysRef.current.clearLayers();
    const bounds: [number, number][] = [];
    for (const p of parcelasRef.current) {
      const pts = parseCoords(p.poligono ?? null);
      if (!pts) continue;
      const m = PARCELA_STATUS[p.laborStatus];
      const poly = L.polygon(pts, { color: m.ring, fillColor: m.ring, fillOpacity: 0.35, weight: 2 });
      poly.bindTooltip(`${p.codigo}${p.areaHa != null ? ` · ${p.areaHa} ha` : ""}`, { sticky: true });
      poly.on("click", () => { if (!drawingRef.current) onOpenRef.current(p.id); });
      poly.addTo(polysRef.current);
      pts.forEach((pt) => bounds.push(pt));
    }
    if (bounds.length) { try { map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 17 }); } catch { /* noop */ } }
  }, []);

  // Init once
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center: [BRAND_GEO.lat, BRAND_GEO.lng], zoom: 15 });
      mapRef.current = map;
      satRef.current = L.tileLayer(SAT, { maxZoom: 19, attribution: "Tiles © Esri, Maxar, Earthstar Geographics" }).addTo(map);
      streetRef.current = L.tileLayer(STREET, { maxZoom: 19, attribution: '© OpenStreetMap' });
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (!drawingRef.current) return;
        vertsRef.current = [...vertsRef.current, [e.latlng.lat, e.latlng.lng]];
        setNVerts(vertsRef.current.length);
        redrawDrawing();
      });
      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 200);
      setReady(true);
      renderPolys();
    });
    return () => { destroyed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render polygons when data changes
  useEffect(() => { if (ready) renderPolys(); }, [parcelas, ready, renderPolys]);

  // Switch base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !satRef.current || !streetRef.current) return;
    if (layer === "sat") { map.removeLayer(streetRef.current); satRef.current.addTo(map); }
    else { map.removeLayer(satRef.current); streetRef.current.addTo(map); }
  }, [layer]);

  function startDraw() { vertsRef.current = []; setNVerts(0); drawingRef.current = true; setDrawing(true); redrawDrawing(); }
  function cancelDraw() { vertsRef.current = []; setNVerts(0); drawingRef.current = false; setDrawing(false); if (drawRef.current) drawRef.current.clearLayers(); }
  function undo() { vertsRef.current = vertsRef.current.slice(0, -1); setNVerts(vertsRef.current.length); redrawDrawing(); }
  function finishDraw() { if (vertsRef.current.length < 3) return; setPending(vertsRef.current); }

  const hasPolygons = parcelas.some((p) => parseCoords(p.poligono ?? null));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!drawing ? (
          <button type="button" onClick={startDraw} disabled={!ready} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Pencil className="h-4 w-4" />Dibujar sección</button>
        ) : (
          <>
            <span className="inline-flex h-11 items-center rounded-xl bg-[var(--data-warning-50)] px-3 text-sm font-bold text-[var(--data-warning-900)]">Tocá el mapa para marcar los vértices ({nVerts})</span>
            <button type="button" onClick={undo} disabled={nVerts === 0} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Undo2 className="h-4 w-4" />Deshacer</button>
            <button type="button" onClick={finishDraw} disabled={nVerts < 3} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Check className="h-4 w-4" />Terminar ({nVerts})</button>
            <button type="button" onClick={cancelDraw} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          </>
        )}
        <button type="button" onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))} className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Layers className="h-4 w-4" />{layer === "sat" ? "Satélite" : "Calles"}</button>
      </div>

      <div className="relative">
        <div ref={containerRef} style={{ height: 480, cursor: drawing ? "crosshair" : "" }} className="w-full overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]" />
        {ready && !hasPolygons && !drawing && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-xs rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 text-center shadow-[var(--shadow-lg)]">
              <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Pencil className="h-6 w-6" /></span>
              <p className="text-sm font-bold text-[var(--text-primary)]">Dibujá tu primera sección para verla en el mapa</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Tocá “Dibujar sección” y marcá el contorno de tu terreno. Aparecerá acá coloreada por su estado.</p>
              <button type="button" onClick={startDraw} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"><Pencil className="h-4 w-4" />Dibujar sección</button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--text-tertiary)]"><MapPin className="mr-1 inline h-3 w-3" />Tocá una sección dibujada para ver y registrar sus labores. Dibujá con al menos 3 puntos.</p>

      {pending && <AsignarSeccionModal poligono={pending} onClose={() => setPending(null)} onSaved={() => { setPending(null); cancelDraw(); onChanged(); }} />}
    </div>
  );
}

function AsignarSeccionModal({ poligono, onClose, onSaved }: { poligono: [number, number][]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ codigo: "", nombre: "", areaHa: "", variedad: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valido = f.codigo.trim().length >= 1;
  const c = centroid(poligono);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !valido) { if (!valido) setError("El código es obligatorio (ej. A-01)."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        codigo: f.codigo.trim(), nombre: f.nombre.trim() || null,
        areaHa: f.areaHa ? Number(f.areaHa) : null, variedad: f.variedad || null,
        poligono: JSON.stringify(poligono), latitud: Number(c[0].toFixed(7)), longitud: Number(c[1].toFixed(7)),
      };
      const r = await fetch("/api/admin/cacao/campo?type=parcela", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <AdminModal open onClose={onClose} variant="default" icon={Pencil} title="Nueva sección dibujada" description={`${poligono.length} puntos · centro ${c[0].toFixed(4)}, ${c[1].toFixed(4)}`}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold text-[var(--text-primary)]">Código *<input value={f.codigo} onChange={set("codigo")} placeholder="A-01" className={`mt-1 ${I}`} autoFocus /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Nombre<input value={f.nombre} onChange={set("nombre")} placeholder="Lote alto" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Área (ha)<input type="number" step="0.01" min="0" value={f.areaHa} onChange={set("areaHa")} placeholder="1.0" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Variedad<select value={f.variedad} onChange={set("variedad")} className={`mt-1 ${I}`}><option value="">—</option>{VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        </div>
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          <button type="submit" disabled={!valido || submitting} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar sección</button>
        </div>
      </form>
    </AdminModal>
  );
}
