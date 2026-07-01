"use client";

/**
 * CacaoProducerDrawer — perfil del productor + historial + edición (ADR-128).
 * Drawer derecho. Agrega lo que la API ya soporta (update_producer) y muestra
 * el historial agregado (kg, pagado, calidad) calculado en el backend.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Loader2,
  X as XIcon,
  Pencil,
  Check,
  Scale,
  Coins,
  PackageCheck,
  MapPin,
  Phone,
  MessageCircle,
  Award,
  Power,
  Printer,
  AlertTriangle,
  HandCoins,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  CACAO_VARIEDADES,
  CACAO_CERTIFICACIONES,
  GRADO_LABEL,
  type CacaoGrado,
} from "@/lib/cacao/cacao-quality";
import { printCacaoLiquidacion } from "@/lib/cacao/cacao-liquidacion";
import { shareCacaoText } from "@/lib/cacao/cacao-print";
import LeafletMap from "@/components/LeafletMap";

interface Producer {
  id: string;
  codigo: string | null;
  nombre: string;
  dni: string | null;
  sector: string | null;
  parcelaHa: string | null;
  variedad: string | null;
  certificacion: string | null;
  altitudMsnm: number | null;
  latitud: string | null;
  longitud: string | null;
  telefono: string | null;
  observaciones: string | null;
  status: string;
}
interface LoteRow {
  id: string;
  loteCode: string;
  fecha: string;
  variedad: string | null;
  tipoGrano: string;
  pesoKg: string;
  humedadPct: string | null;
  grado: string | null;
  indiceFermentacion: string | null;
  totalPagado: string | null;
  montoPagado: string | null;
  estadoPago: string;
}
interface Agg {
  loteCount: number;
  totalKg: number;
  totalPagado: number; // monto DEBIDO (liquidación)
  montoPagado: number; // abonado al productor
  saldo: number; // debido − pagado
  avgIndice: number | null;
  gradoCounts: Record<string, number>;
  lastFecha: string | null;
}

const fdate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
};
const n2 = (v: string | number | null) => (v == null || v === "" ? "—" : Number(v).toFixed(2));
const I =
  "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function CacaoProducerDrawer({
  producerId,
  onClose,
  onChanged,
  onOpenLote,
}: {
  producerId: string;
  onClose: () => void;
  onChanged?: () => void;
  onOpenLote?: (id: string) => void;
}) {
  const [producer, setProducer] = useState<Producer | null>(null);
  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [agg, setAgg] = useState<Agg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Producer>>({});
  // Registro de pago al productor (estado de cuenta, ADR-302)
  const [payLote, setPayLote] = useState<LoteRow | null>(null);
  const [payMonto, setPayMonto] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/cacao?view=producer-detail&id=${encodeURIComponent(producerId)}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const d = await r.json();
      setProducer(d.producer ?? null);
      setLotes(d.lotes ?? []);
      setAgg(d.agg ?? null);
      setForm(d.producer ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [producerId]);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(p: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "update_producer", id: producerId, patch: p }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Registra el monto pagado ACUMULADO (adelanto + abonos) sobre un lote.
  async function registrarPago() {
    if (!payLote) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          action: "pago_acopio",
          id: payLote.id,
          montoPagado: payMonto === "" ? 0 : Number(payMonto),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setPayLote(null);
      setPayMonto("");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Saldo por lote (debido − pagado), para la lista y el badge de estado.
  const loteSaldo = (l: LoteRow) =>
    Math.max(0, Number(l.totalPagado ?? 0) - Number(l.montoPagado ?? 0));

  async function saveEdit() {
    await patch({
      nombre: form.nombre,
      dni: form.dni ?? null,
      sector: form.sector ?? null,
      parcelaHa: form.parcelaHa ? Number(form.parcelaHa) : null,
      variedad: form.variedad ?? null,
      certificacion: form.certificacion ?? null,
      altitudMsnm: form.altitudMsnm ? Number(form.altitudMsnm) : null,
      telefono: form.telefono ?? null,
      observaciones: form.observaciones ?? null,
    });
    setEditing(false);
  }

  const set = (k: keyof Producer, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const inactive = producer?.status === "inactivo";

  return (
    <>
    <AdminModal open onClose={onClose} variant="side" hideCloseButton className="!max-w-[480px]">
      <div className="flex h-full max-h-screen flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Productor {producer?.codigo ? `· ${producer.codigo}` : ""}
                {inactive && " · inactivo"}
              </p>
              <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                {producer?.nombre ?? "…"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
            </div>
          )}
          {error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-[var(--data-error-700)]">
              {error}
            </div>
          )}

          {producer && !loading && (
            <>
              {/* KPIs historial */}
              <div className="grid grid-cols-3 gap-2">
                <KStat icon={PackageCheck} label="Lotes" value={String(agg?.loteCount ?? 0)} />
                <KStat icon={Scale} label="Kg comprados" value={n2(agg?.totalKg ?? 0)} />
                <KStat icon={Coins} label="A pagar" value={`S/ ${n2(agg?.totalPagado ?? 0)}`} />
              </div>

              {/* Estado de cuenta con el productor (deuda / abonado / saldo) */}
              {agg && agg.totalPagado > 0 && (
                <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Estado de cuenta
                    </span>
                    {agg.saldo > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-900)]">
                        <AlertTriangle className="h-3 w-3" /> Debés S/ {n2(agg.saldo)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-100)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-900)]">
                        <Check className="h-3 w-3" /> Al día
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <AcctCell label="Debido" value={`S/ ${n2(agg.totalPagado)}`} />
                    <AcctCell label="Pagado" value={`S/ ${n2(agg.montoPagado)}`} tone="success" />
                    <AcctCell
                      label="Saldo"
                      value={`S/ ${n2(agg.saldo)}`}
                      tone={agg.saldo > 0 ? "warning" : "muted"}
                    />
                  </div>
                </div>
              )}
              {agg && (agg.avgIndice != null || Object.keys(agg.gradoCounts).length > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {agg.avgIndice != null && (
                    <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 font-medium text-[var(--text-secondary)]">
                      Índice ferm. prom: <b>{agg.avgIndice}%</b>
                    </span>
                  )}
                  {Object.entries(agg.gradoCounts).map(([g, c]) => (
                    <span
                      key={g}
                      className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 font-medium text-[var(--text-secondary)]"
                    >
                      {g === "sin_clasificar" ? "Sin clasif." : (GRADO_LABEL[g as CacaoGrado] ?? g)}
                      : <b>{c}</b>
                    </span>
                  ))}
                </div>
              )}

              {/* Perfil / edición */}
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Perfil</h3>
                  {!editing ? (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={saving || !form.nombre?.trim()}
                      onClick={saveEdit}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent-600,var(--accent))] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}{" "}
                      Guardar
                    </button>
                  )}
                </div>
                {!editing ? (
                  <div className="space-y-1.5">
                    <PRow icon={Users} label="DNI" value={producer.dni ?? "—"} />
                    <PRow icon={MapPin} label="Sector" value={producer.sector ?? "—"} />
                    <PRow
                      icon={Scale}
                      label="Parcela"
                      value={
                        producer.parcelaHa ? `${Number(producer.parcelaHa).toFixed(1)} ha` : "—"
                      }
                    />
                    <PRow
                      icon={MapPin}
                      label="Altitud"
                      value={producer.altitudMsnm != null ? `${producer.altitudMsnm} msnm` : "—"}
                    />
                    <PhoneRow phone={producer.telefono} nombre={producer.nombre} />
                    <PRow
                      icon={Award}
                      label="Certificación"
                      value={
                        producer.certificacion ? producer.certificacion.replace("_", " ") : "—"
                      }
                    />
                    {producer.variedad && (
                      <PRow icon={Award} label="Variedad" value={producer.variedad} />
                    )}
                    {producer.observaciones && (
                      <p className="pt-1 text-[var(--text-secondary)]">{producer.observaciones}</p>
                    )}
                    {producer.latitud && producer.longitud && (
                      <div className="pt-2">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                            <MapPin className="h-3.5 w-3.5" /> Parcela
                          </span>
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${producer.latitud}&mlon=${producer.longitud}#map=15/${producer.latitud}/${producer.longitud}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-bold text-[var(--accent)] hover:underline"
                          >
                            Ver en mapa
                          </a>
                        </div>
                        <div className="overflow-hidden rounded-xl border-2 border-[var(--rule-base)]">
                          <LeafletMap
                            lat={Number(producer.latitud)}
                            lon={Number(producer.longitud)}
                            height={160}
                            zoom={14}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <Lbl span="Nombre">
                      <input
                        value={form.nombre ?? ""}
                        onChange={(e) => set("nombre", e.target.value)}
                        className={I}
                      />
                    </Lbl>
                    <Lbl span="DNI">
                      <input
                        value={form.dni ?? ""}
                        onChange={(e) => set("dni", e.target.value)}
                        className={I}
                      />
                    </Lbl>
                    <Lbl span="Sector">
                      <input
                        value={form.sector ?? ""}
                        onChange={(e) => set("sector", e.target.value)}
                        className={I}
                      />
                    </Lbl>
                    <Lbl span="Parcela (ha)">
                      <input
                        type="number"
                        step="0.1"
                        value={form.parcelaHa ?? ""}
                        onChange={(e) => set("parcelaHa", e.target.value)}
                        className={`${I} font-mono`}
                      />
                    </Lbl>
                    <Lbl span="Altitud (msnm)">
                      <input
                        type="number"
                        value={form.altitudMsnm ?? ""}
                        onChange={(e) => set("altitudMsnm", e.target.value)}
                        className={`${I} font-mono`}
                      />
                    </Lbl>
                    <Lbl span="Teléfono">
                      <input
                        value={form.telefono ?? ""}
                        onChange={(e) => set("telefono", e.target.value)}
                        className={I}
                      />
                    </Lbl>
                    <Lbl span="Variedad">
                      <select
                        value={form.variedad ?? ""}
                        onChange={(e) => set("variedad", e.target.value)}
                        className={I}
                      >
                        <option value="">—</option>
                        {CACAO_VARIEDADES.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Lbl>
                    <Lbl span="Certificación">
                      <select
                        value={form.certificacion ?? ""}
                        onChange={(e) => set("certificacion", e.target.value)}
                        className={I}
                      >
                        <option value="">—</option>
                        {CACAO_CERTIFICACIONES.map((c) => (
                          <option key={c} value={c}>
                            {c.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </Lbl>
                    <div className="col-span-2">
                      <Lbl span="Observaciones">
                        <textarea
                          value={form.observaciones ?? ""}
                          onChange={(e) => set("observaciones", e.target.value)}
                          rows={2}
                          className={`${I} h-auto resize-none py-2`}
                        />
                      </Lbl>
                    </div>
                  </div>
                )}
              </div>

              {/* Historial de lotes */}
              <div>
                <h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">
                  Historial de lotes ({lotes.length})
                </h3>
                <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
                  {lotes.length === 0 ? (
                    <p className="p-4 text-center text-[var(--text-tertiary)]">
                      Sin lotes registrados.
                    </p>
                  ) : (
                    lotes.map((l) => {
                      const debido = Number(l.totalPagado ?? 0);
                      const saldo = loteSaldo(l);
                      return (
                        <div
                          key={l.id}
                          className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2.5 last:border-0 hover:bg-[var(--surface-sunken)]"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenLote?.(l.id)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                          >
                            <span className="min-w-0">
                              <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                                {l.loteCode}
                              </span>
                              <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                                {fdate(l.fecha)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                                {n2(l.pesoKg)} kg
                              </span>
                              <GradoMini grado={l.grado} />
                              <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                                {l.totalPagado ? `S/ ${n2(l.totalPagado)}` : "—"}
                              </span>
                            </span>
                          </button>
                          {debido > 0 &&
                            (saldo > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayLote(l);
                                  setPayMonto(String(debido));
                                }}
                                title={`Saldo S/ ${n2(saldo)}`}
                                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border-2 border-[var(--data-warning-400)] bg-[var(--data-warning-50)] px-2 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-900)] hover:brightness-95"
                              >
                                <HandCoins className="h-3.5 w-3.5" /> Pagar
                              </button>
                            ) : (
                              <span
                                title="Pagado"
                                className="inline-flex h-8 shrink-0 items-center gap-1 px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]"
                              >
                                <Check className="h-3.5 w-3.5" /> Pagado
                              </span>
                            ))}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {producer && !loading && (
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--rule-base)] px-5 py-3.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => patch({ status: inactive ? "activo" : "inactivo" })}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border-2 px-3.5 text-sm font-bold ${inactive ? "border-[var(--data-success-300)] text-[var(--data-success-700)] hover:bg-[var(--data-success-50)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
            >
              <Power className="h-4 w-4" /> {inactive ? "Activar" : "Desactivar"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!producer || !agg}
                onClick={() => {
                  if (!producer || !agg) return;
                  const t = [
                    `*Estado de cuenta — ${producer.nombre}*`,
                    `Kg comprados: ${n2(agg.totalKg)} kg`,
                    `A pagar: S/ ${n2(agg.totalPagado)}`,
                    `Pagado: S/ ${n2(agg.montoPagado)}`,
                    `Saldo: S/ ${n2(agg.saldo)}`,
                    `Lotes: ${agg.loteCount}`,
                  ].join("\n");
                  shareCacaoText(`Estado de cuenta — ${producer.nombre}`, t);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--data-success-400)] px-3.5 text-sm font-bold text-[var(--data-success-700)] hover:bg-[var(--data-success-50)] disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" />
                Compartir
              </button>
              <button
                type="button"
                disabled={lotes.length === 0}
                onClick={() =>
                  producer &&
                  printCacaoLiquidacion(
                    {
                      nombre: producer.nombre,
                      codigo: producer.codigo,
                      dni: producer.dni,
                      sector: producer.sector,
                    },
                    lotes.map((l) => ({
                      loteCode: l.loteCode,
                      fecha: l.fecha,
                      variedad: l.variedad,
                      pesoKg: l.pesoKg,
                      grado: l.grado,
                      humedadPct: l.humedadPct,
                      totalPagado: l.totalPagado,
                    })),
                  )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Liquidación
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                Cerrar
              </button>
            </div>
          </footer>
        )}
      </div>
    </AdminModal>

    {payLote && (
      <AdminModal open onClose={() => setPayLote(null)} variant="centered-sm" hideCloseButton>
        <div className="bg-[var(--surface-raised)] p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <HandCoins className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Registrar pago — lote {payLote.loteCode}
              </h3>
              <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                Debido S/ {n2(payLote.totalPagado)} · pagado S/ {n2(payLote.montoPagado)} · saldo S/{" "}
                {n2(loteSaldo(payLote))}
              </p>
            </div>
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Monto pagado acumulado (adelanto + abonos)
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={payMonto}
              onChange={(e) => setPayMonto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) registrarPago();
              }}
              className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
              Es el total pagado, no solo el abono de hoy. Igual o mayor al debido = liquidado.
            </span>
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPayLote(null)}
              className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={registrarPago}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar pago
            </button>
          </div>
        </div>
      </AdminModal>
    )}
    </>
  );
}

function AcctCell({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "muted";
}) {
  const color =
    tone === "success"
      ? "text-[var(--data-success-700)]"
      : tone === "warning"
        ? "text-[var(--data-warning-700)]"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-lg bg-[var(--surface-raised)] px-2 py-1.5">
      <div className={`font-mono text-sm font-extrabold tabular-nums ${color}`}>{value}</div>
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </div>
    </div>
  );
}

function KStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-[var(--accent)]" />
      <div className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">
        {value}
      </div>
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </div>
    </div>
  );
}
function PRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
/** Normaliza un teléfono peruano a solo dígitos con prefijo país 51 para wa.me. */
function waDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("51")) return d;
  if (d.length === 9 && d.startsWith("9")) return `51${d}`;
  return d;
}
/** Fila de teléfono con accesos directos a WhatsApp (canal primario) y llamada. */
function PhoneRow({ phone, nombre }: { phone: string | null; nombre: string }) {
  if (!phone?.trim()) return <PRow icon={Phone} label="Teléfono" value="—" />;
  const wa = waDigits(phone);
  const msg = encodeURIComponent(`Hola ${nombre}, te escribo de la acopiadora de cacao.`);
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Phone className="h-3.5 w-3.5" /> Teléfono
      </span>
      <span className="flex items-center gap-2">
        <span className="font-medium text-[var(--text-primary)]">{phone}</span>
        <a
          href={`https://wa.me/${wa}?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Escribir por WhatsApp"
          aria-label={`Escribir a ${nombre} por WhatsApp`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[var(--data-success-500)] text-[var(--data-success-700)] hover:bg-[var(--data-success-50)]"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
        <a
          href={`tel:${phone.replace(/\s/g, "")}`}
          onClick={(e) => e.stopPropagation()}
          title="Llamar"
          aria-label={`Llamar a ${nombre}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        >
          <Phone className="h-4 w-4" />
        </a>
      </span>
    </div>
  );
}
function Lbl({ span, children }: { span: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{span}</span>
      {children}
    </label>
  );
}
function GradoMini({ grado }: { grado: string | null }) {
  if (!grado) return null;
  const g = grado as CacaoGrado;
  const cls =
    g === "I"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]"
      : g === "II"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"
        : "bg-[var(--data-error-100)] text-[var(--data-error-700)]";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${cls}`}>
      {g === "fuera_norma" ? "FN" : g}
    </span>
  );
}
