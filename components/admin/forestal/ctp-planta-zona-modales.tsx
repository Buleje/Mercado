"use client";

/**
 * Modales de las zonas del Mapa de Planta (sacados de CtpPlantaMapa, 2026-10-03):
 * crear una zona desde el dibujo, crearla o ir a ella por coordenadas GPS, y la
 * ficha para editar o borrar. Los usan las dos capas — satélite y croquis —; en
 * el croquis el polígono va en METROS (`plano: "croquis"`) y el área es plana.
 */
import { useState } from "react";
import { Pencil, Check, X, MapPin, Loader2, Trash2, Navigation } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { geodesicAreaM2, haversineM, formatDist } from "@/lib/cacao/geo-area";
import { areaPlanaM2, centroidePlano, perimetroPlanoM } from "@/lib/forestal/planta-croquis";
import { ZONA_TIPOS, isCategoriaComponente, zonaTipoMeta, type CategoriaComponente, type PlanoPlanta, type PlantaZona, type ZonaTipo } from "@/lib/forestal/planta-zona-types";
import { CATEGORIAS, numeroDeCodigo, tipoDeComponente } from "@/lib/forestal/croquis-componentes";
import { Btn, CampoGrid, Field, I, MODAL_BODY, ModalBody, ModalFooter } from "./ctp-shared";
import { formatNumber } from "@/lib/format";

const fmtArea = (m2: number) => (m2 >= 10000 ? `${formatNumber(m2 / 10000, { max: 2 })} ha` : `${formatNumber(Math.round(m2))} m²`);
const centroid = (pts: [number, number][]): [number, number] => {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]] as [number, number], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
};

export function parseCoordText(text: string): [number, number][] {
  const pts: [number, number][] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/(-?\d+(?:\.\d+)?)[,;\s]+(-?\d+(?:\.\d+)?)/);
    if (!m) continue;
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) pts.push([lat, lng]);
  }
  return pts;
}

export function CoordenadasModal({ onClose, onCreate, onGoTo }: { onClose: () => void; onCreate: (pts: [number, number][]) => void; onGoTo: (lat: number, lng: number) => void }) {
  const [text, setText] = useState("");
  const [goLat, setGoLat] = useState("");
  const [goLng, setGoLng] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pts = parseCoordText(text);
  const area = pts.length >= 3 ? geodesicAreaM2(pts) : 0;
  function crear() { if (pts.length < 3) { setError("Necesitas al menos 3 coordenadas válidas (una «lat, lng» por línea)."); return; } onCreate(pts); }
  function ir() {
    const lat = parseFloat(goLat), lng = parseFloat(goLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError("Coordenada inválida."); return; }
    onGoTo(lat, lng);
  }
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      icon={Navigation}
      title="Mapeo por coordenadas"
      description="Crea una zona desde tu levantamiento GPS o ve a una coordenada exacta."
      footer={
        <ModalFooter error={error} nota={`${pts.length} punto(s) válido(s)${area > 0 ? ` · ${fmtArea(area)}` : ""}`}>
          <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
          <Btn variant="primary" onClick={crear} disabled={pts.length < 3}>
            <Check className="h-4 w-4" />
            Crear la zona
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-4">
        <div>
          <p className="mb-2 flex items-center gap-1 text-sm font-bold text-[var(--text-primary)]">
            Crear zona por coordenadas
            <InfoTip
              title="Zona por coordenadas"
              what="Pega los vértices, una coordenada por línea: latitud, longitud."
              affects="Se cierra el polígono solo."
              example={"-8.38200, -74.53100\n-8.38150, -74.52950"}
            />
          </p>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={6} placeholder={"-8.38200, -74.53100\n-8.38150, -74.52950\n-8.38300, -74.52980"} className={`${I} h-auto py-2 font-mono`} />
        </div>
        <div className="border-t border-[var(--rule-base)] pt-4">
          <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">Ir a una coordenada</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Latitud">
              <input value={goLat} onChange={(e) => setGoLat(e.target.value)} placeholder="-8.3820" className={`${I} w-36 font-mono`} />
            </Field>
            <Field label="Longitud">
              <input value={goLng} onChange={(e) => setGoLng(e.target.value)} placeholder="-74.5310" className={`${I} w-36 font-mono`} />
            </Field>
            <Btn variant="secondary" onClick={ir}><Navigation className="h-4 w-4" />Ir</Btn>
          </div>
        </div>
      </ModalBody>
    </AdminModal>
  );
}

export function AsignarZonaModal({ poligono, suggest, onClose, onSaved, plano = "satelite" }: { poligono: [number, number][]; suggest: (t: ZonaTipo) => string; onClose: () => void; onSaved: () => void; plano?: PlanoPlanta }) {
  const enCroquis = plano === "croquis";
  const areaCalc = enCroquis ? areaPlanaM2(poligono) : geodesicAreaM2(poligono);
  let perimCalc = 0;
  if (enCroquis) perimCalc = perimetroPlanoM(poligono);
  else for (let i = 0; i < poligono.length; i++) perimCalc += haversineM(poligono[i], poligono[(i + 1) % poligono.length]);
  const [tipo, setTipo] = useState<ZonaTipo>("patio_trozas");
  const [f, setF] = useState({ codigo: suggest("patio_trozas"), nombre: "", notas: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = enCroquis ? centroidePlano(poligono) : centroid(poligono);
  const valido = f.codigo.trim().length >= 1;

  function onTipo(t: ZonaTipo) { setTipo(t); setF((s) => ({ ...s, codigo: s.codigo && !/^[A-Za-z]{1,2}-\d/.test(s.codigo) ? s.codigo : suggest(t) })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !valido) { if (!valido) setError("El código es obligatorio (ej. PT-01)."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        codigo: f.codigo.trim(), nombre: f.nombre.trim() || null, tipo, notas: f.notas.trim() || null,
        poligono: JSON.stringify(poligono), lat: Number(c[0].toFixed(7)), lng: Number(c[1].toFixed(7)), areaM2: Math.round(areaCalc),
        // En el croquis el polígono está en metros: sin esto se leería como lat/lng.
        ...(enCroquis ? { plano: "croquis" as const } : {}),
      };
      const r = await fetch("/api/admin/forestal/ctp/planta", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="default"
      icon={Pencil}
      title="Nueva zona de la planta"
      description={`${poligono.length} puntos · ${fmtArea(areaCalc)} · ${formatDist(perimCalc)} de perímetro`}
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose}><X className="h-4 w-4" />Cancelar</Btn>
          {/* El submit vive fuera del <form>: `form=` lo vuelve a atar. */}
          <Btn variant="primary" type="submit" form="planta-zona-nueva" disabled={!valido || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar zona
          </Btn>
        </ModalFooter>
      }
    >
      <form id="planta-zona-nueva" onSubmit={submit} className={`space-y-4 ${MODAL_BODY}`}>
        <div>
          <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">Tipo de zona *</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ZONA_TIPOS.map((t) => (
              <button key={t.tipo} type="button" onClick={() => onTipo(t.tipo)} className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-xs font-bold transition ${tipo === t.tipo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.ring }} />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <CampoGrid>
          <Field label="Código" required span={6}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- primer campo al abrir el formulario de zona, foco intencional */}
            <input value={f.codigo} onChange={(e) => setF((s) => ({ ...s, codigo: e.target.value }))} placeholder="PT-01" className={`${I} font-mono uppercase`} autoFocus />
          </Field>
          <Field label="Nombre" span={6}>
            <input value={f.nombre} onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))} placeholder="Patio principal" className={I} />
          </Field>
          <Field label="Notas" span={12}>
            <textarea value={f.notas} onChange={(e) => setF((s) => ({ ...s, notas: e.target.value }))} rows={2} placeholder="Capacidad, referencia, qué se guarda acá…" className={`${I} h-auto py-2`} />
          </Field>
        </CampoGrid>
      </form>
    </AdminModal>
  );
}

export function ZonaFichaModal({ zona, onClose, onSaved, onDeleted }: { zona: PlantaZona; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [tipo, setTipo] = useState<ZonaTipo>(zona.tipo);
  const [f, setF] = useState({ codigo: zona.codigo, nombre: zona.nombre ?? "", notas: zona.notas ?? "" });
  /** Qué es según la leyenda (solo croquis); "" = sin identificar. Cambiarlo sugiere el tipo. */
  const [categoria, setCategoria] = useState<CategoriaComponente | "">(zona.componente?.categoria ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = zonaTipoMeta(tipo);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !f.codigo.trim()) { if (!f.codigo.trim()) setError("El código es obligatorio."); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp/planta", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          id: zona.id, codigo: f.codigo.trim(), nombre: f.nombre.trim() || null, tipo, notas: f.notas.trim() || null, poligono: zona.poligono, lat: zona.lat, lng: zona.lng, areaM2: zona.areaM2,
          // El renglón de la leyenda se conserva; sin componente previo, sale del nombre y el código (PT-08 → 8).
          ...(zona.plano === "croquis" ? { plano: "croquis", componente: categoria ? { numero: zona.componente?.numero ?? numeroDeCodigo(f.codigo.trim()), nombre: (zona.componente?.nombre || f.nombre.trim() || f.codigo.trim()).slice(0, 120), categoria } : null } : {}),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }
  async function del() {
    setSubmitting(true); setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/ctp/planta?id=${encodeURIComponent(zona.id)}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onDeleted();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); setConfirmDel(false); }
  }
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="default"
      icon={MapPin}
      title={`Zona ${zona.codigo}`}
      description={`${meta.label}${zona.areaM2 != null ? ` · ${fmtArea(zona.areaM2)}` : ""}`}
      footer={
        <ModalFooter error={error}>
          {/* Borrar queda a la izquierda, separado de guardar: son opuestos y
              pegados uno al lado del otro se aprieta el que no era. */}
          <span className="mr-auto">
            {!confirmDel ? (
              <Btn variant="danger" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" />Borrar zona</Btn>
            ) : (
              <Btn variant="danger" onClick={() => void del()} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirmar borrar
              </Btn>
            )}
          </span>
          <Btn variant="ghost" onClick={onClose}><X className="h-4 w-4" />Cerrar</Btn>
          <Btn variant="primary" type="submit" form="planta-zona-ficha" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <form id="planta-zona-ficha" onSubmit={save} className={`space-y-4 ${MODAL_BODY}`}>
        {zona.plano === "croquis" && (
          <Field label="Qué es en el plano">
            <select
              value={categoria}
              onChange={(e) => { const v = e.target.value; if (v === "") setCategoria(""); else if (isCategoriaComponente(v)) { setCategoria(v); setTipo(tipoDeComponente(v, zona.componente?.nombre || f.nombre)); } }}
              className={I}
            >
              <option value="">Sin identificar</option>
              {CATEGORIAS.map((c) => <option key={c.categoria} value={c.categoria}>{c.label} · {c.hint}</option>)}
            </select>
          </Field>
        )}
        <div>
          <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">Tipo de zona</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ZONA_TIPOS.map((t) => (
              <button key={t.tipo} type="button" onClick={() => setTipo(t.tipo)} className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-xs font-bold transition ${tipo === t.tipo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.ring }} />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <CampoGrid>
          <Field label="Código" required span={6}>
            <input value={f.codigo} onChange={(e) => setF((s) => ({ ...s, codigo: e.target.value }))} className={`${I} font-mono uppercase`} />
          </Field>
          <Field label="Nombre" span={6}>
            <input value={f.nombre} onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))} className={I} />
          </Field>
          <Field label="Notas" span={12}>
            <textarea value={f.notas} onChange={(e) => setF((s) => ({ ...s, notas: e.target.value }))} rows={2} className={`${I} h-auto py-2`} />
          </Field>
        </CampoGrid>
      </form>
    </AdminModal>
  );
}
