"use client";

/** CacaoProducerForm — alta de productor de cacao (ADR-128, v2 rediseñado).
 *  Layout 2 columnas: formulario seccionado + tarjeta viva del productor. */
import { useState } from "react";
import { Users, Loader2, X, MapPin, Phone, Award, Leaf, CreditCard, Gauge, Navigation } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import LeafletMap from "@/components/LeafletMap";
import { csrfHeaders } from "@/lib/csrf-client";
import { CACAO_VARIEDADES, CACAO_CERTIFICACIONES } from "@/lib/cacao/cacao-quality";
import { BRAND_GEO } from "@/lib/geo";

const I = "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";
const CERT_LABEL: Record<string, string> = { organico: "Orgánico", comercio_justo: "Comercio justo", convencional: "Convencional" };

export default function CacaoProducerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [f, setF] = useState({ nombre: "", dni: "", sector: "", parcelaHa: "", variedad: "", certificacion: "", altitudMsnm: "", latitud: "", longitud: "", telefono: "", observaciones: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isValid = f.nombre.trim().length >= 2;

  // GPS del teléfono: el acopiador suele estar EN la parcela al registrar.
  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tu dispositivo no permite ubicación GPS.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((s) => ({ ...s, latitud: pos.coords.latitude.toFixed(6), longitud: pos.coords.longitude.toFixed(6) }));
        setGeoLoading(false);
      },
      (err) => { setError(`No se pudo obtener la ubicación: ${err.message}`); setGeoLoading(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !isValid) { if (!isValid) setError("El nombre es obligatorio."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        nombre: f.nombre.trim(), dni: f.dni.trim() || null, sector: f.sector.trim() || null,
        parcelaHa: f.parcelaHa ? Number(f.parcelaHa) : null, variedad: f.variedad || null,
        certificacion: f.certificacion || null, altitudMsnm: f.altitudMsnm ? Number(f.altitudMsnm) : null,
        latitud: f.latitud ? Number(f.latitud) : null, longitud: f.longitud ? Number(f.longitud) : null,
        telefono: f.telefono.trim() || null, observaciones: f.observaciones.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=producer", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="!max-w-[860px]"
      footer={
        <div className="flex items-center justify-end gap-2 px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="submit" form="cacao-producer-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar productor"}</button>
        </div>
      }
    >
      <div className="flex h-full max-h-[90vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Users className="h-5 w-5" strokeWidth={1.75} /></span>
            <div><CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">Nuevo productor</CardTitle><p className="text-xs text-[var(--text-tertiary)]">Proveedor de cacao · maestro</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <form id="cacao-producer-form" onSubmit={submit} className="space-y-5 px-5 py-5">
              {error && <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">{error}</div>}

              <Section icon={CreditCard} title="Identidad">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre" required><input value={f.nombre} onChange={set("nombre")} placeholder="Juan Pérez / Cooperativa…" className={I} /></Field>
                  <Field label="DNI / RUC"><input value={f.dni} onChange={set("dni")} placeholder="12345678" className={I} /></Field>
                </div>
              </Section>

              <Section icon={Leaf} title="Parcela & cacao">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sector / caserío"><input value={f.sector} onChange={set("sector")} placeholder="ej: Aguaytía" className={I} /></Field>
                  <Field label="Hectáreas de cacao"><input type="number" step="0.1" value={f.parcelaHa} onChange={set("parcelaHa")} placeholder="2.5" className={`${I} font-mono tabular-nums`} /></Field>
                  <Field label="Variedad predominante"><select value={f.variedad} onChange={set("variedad")} className={I}><option value="">—</option>{CACAO_VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
                  <Field label="Certificación"><select value={f.certificacion} onChange={set("certificacion")} className={I}><option value="">—</option>{CACAO_CERTIFICACIONES.map((c) => <option key={c} value={c}>{CERT_LABEL[c]}</option>)}</select></Field>
                  <Field label="Altitud (msnm)"><input type="number" value={f.altitudMsnm} onChange={set("altitudMsnm")} placeholder="600" className={`${I} font-mono tabular-nums`} /></Field>
                </div>
              </Section>

              <Section icon={MapPin} title="Ubicación de la parcela">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={geoLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-[var(--accent)] px-3 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-60"
                  >
                    {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                    Usar mi ubicación (GPS)
                  </button>
                  {f.latitud && f.longitud && (
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      {Number(f.latitud).toFixed(5)}, {Number(f.longitud).toFixed(5)}
                    </span>
                  )}
                  {(f.latitud || f.longitud) && (
                    <button
                      type="button"
                      onClick={() => setF((s) => ({ ...s, latitud: "", longitud: "" }))}
                      className="text-xs font-bold text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Tocá el mapa para marcar la parcela, o usá el GPS del teléfono si estás ahí. Sirve
                  para logística de recojo y trazabilidad de origen.
                </p>
                <div className="overflow-hidden rounded-xl border-2 border-[var(--rule-base)]">
                  <LeafletMap
                    lat={f.latitud ? Number(f.latitud) : BRAND_GEO.lat}
                    lon={f.longitud ? Number(f.longitud) : BRAND_GEO.lng}
                    zoom={f.latitud ? 15 : 12}
                    height={200}
                    onPick={(la, lo) =>
                      setF((s) => ({ ...s, latitud: la.toFixed(6), longitud: lo.toFixed(6) }))
                    }
                  />
                </div>
              </Section>

              <Section icon={Phone} title="Contacto">
                <Field label="Teléfono / WhatsApp"><input value={f.telefono} onChange={set("telefono")} placeholder="9XXXXXXXX" className={I} /></Field>
                <Field label="Observaciones"><textarea value={f.observaciones} onChange={set("observaciones")} rows={2} placeholder="Notas…" className={`${I} h-auto resize-none py-2.5`} /></Field>
              </Section>
            </form>

            {/* Tarjeta viva */}
            <aside className="border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 px-5 py-5 lg:sticky lg:top-0 lg:self-start lg:border-l-2 lg:border-t-0">
              <p className="mb-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Tarjeta del productor</p>
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Users className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold text-[var(--text-primary)]">{f.nombre.trim() || "Nuevo productor"}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">El código (P-00X) se asigna al guardar</p>
                  </div>
                </div>
                {(f.variedad || f.certificacion) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {f.variedad && <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">{f.variedad}</span>}
                    {f.certificacion && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]"><Award className="h-3 w-3" />{CERT_LABEL[f.certificacion]}</span>}
                  </div>
                )}
                <div className="mt-3 space-y-1.5 border-t border-[var(--rule-soft)] pt-3 text-sm">
                  <Row icon={CreditCard} value={f.dni.trim()} fallback="DNI / RUC" />
                  <Row icon={MapPin} value={f.sector.trim()} fallback="Sector" />
                  <Row icon={Leaf} value={f.parcelaHa ? `${Number(f.parcelaHa).toFixed(1)} ha` : ""} fallback="Hectáreas" />
                  <Row icon={Gauge} value={f.altitudMsnm ? `${f.altitudMsnm} msnm` : ""} fallback="Altitud" />
                  <Row icon={Phone} value={f.telefono.trim()} fallback="Teléfono" />
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">El productor podrá vincularse a los lotes de acopio y verás su historial de compras y calidad.</p>
            </aside>
          </div>
        </div>

      </div>
    </AdminModal>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-sunken)] text-[var(--accent)]"><Icon className="h-4 w-4" /></span>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      </div>
      {children}
    </section>
  );
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{label}{required && <span className="text-[var(--data-error-600)]">*</span>}</span>
      {children}
    </label>
  );
}
function Row({ icon: Icon, value, fallback }: { icon: typeof Users; value: string; fallback: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
      <span className={value ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}>{value || fallback}</span>
    </div>
  );
}
