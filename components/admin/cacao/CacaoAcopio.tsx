"use client";

/**
 * CacaoAcopio — Módulo admin de Acopio & Beneficio de Cacao (ADR-128).
 * Gating: spec:agricola:cacao-acopio. 8 sub-vistas agrupadas en 3 familias
 * (Operación · Gestión · Inteligencia, ver lib/cacao/cacao-views); la sub-vista
 * activa se deep-linkea vía ?cacaoView= para navegar desde el sidebar.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Leaf,
  Plus,
  RefreshCw,
  Search,
  Scale,
  Coins,
  PackageCheck,
  AlertCircle,
  Download,
  Filter,
  AlertTriangle,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { GRADO_LABEL, CACAO_VARIEDADES, type CacaoGrado } from "@/lib/cacao/cacao-quality";
import {
  CACAO_VIEW_GROUPS,
  CACAO_VIEW_PARAM,
  DEFAULT_CACAO_VIEW,
  isCacaoView,
  type CacaoView,
} from "@/lib/cacao/cacao-views";
import CacaoLoteForm from "./CacaoLoteForm";
import CacaoBeneficio from "./CacaoBeneficio";
import CacaoLoteDrawer from "./CacaoLoteDrawer";
import CacaoNoticiero from "./CacaoNoticiero";
import CacaoNews from "./CacaoNews";
import CacaoAsesor from "./CacaoAsesor";
import CacaoResumen from "./CacaoResumen";
import CacaoInventario from "./CacaoInventario";
import CacaoProductores from "./CacaoProductores";
import CacaoVentas from "./CacaoVentas";
import CacaoAlertsBell from "./CacaoAlertsBell";

interface Lote {
  id: string;
  loteCode: string;
  fecha: string;
  productorId: string | null;
  productorNombre: string | null;
  variedad: string | null;
  tipoGrano: string;
  pesoKg: string;
  humedadPct: string | null;
  precioPorKg: string | null;
  totalPagado: string | null;
  indiceFermentacion: string | null;
  grado: string | null;
  status: string;
  annulledReason: string | null;
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
const n2 = (v: string | number | null) => (v == null ? "—" : Number(v).toFixed(2));

export default function CacaoAcopio() {
  const [view, setView] = useState<CacaoView>(DEFAULT_CACAO_VIEW);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showLote, setShowLote] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [loteDrawerId, setLoteDrawerId] = useState<string | null>(null);
  // Filtros de acopio (task #4)
  const [fVariedad, setFVariedad] = useState("");
  const [fGrado, setFGrado] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(
    async (
      v: CacaoView,
      fOverride?: { variedad?: string; grado?: string; from?: string; to?: string },
    ) => {
      // Solo "acopio" se renderiza inline; el resto son componentes self-fetch.
      if (v !== "acopio") {
        setLoading(false);
        return;
      } // ventas/inventario/etc. self-fetch
      setLoading(true);
      setError(null);
      const fv = fOverride?.variedad ?? fVariedad,
        fg = fOverride?.grado ?? fGrado,
        ff = fOverride?.from ?? fFrom,
        ft = fOverride?.to ?? fTo;
      try {
        const q = new URLSearchParams({ view: "lotes" });
        if (search.trim()) q.set("search", search.trim());
        if (fv) q.set("variedad", fv);
        if (fg) q.set("grado", fg);
        if (ff) q.set("from", new Date(ff).toISOString());
        if (ft) q.set("to", new Date(ft + "T23:59:59").toISOString());
        const r = await fetch(`/api/admin/cacao?${q}`, { credentials: "include" });
        if (!r.ok)
          throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
        setLotes((await r.json()).lotes ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [search, fVariedad, fGrado, fFrom, fTo],
  );
  useEffect(() => {
    load(view); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [view]);

  // Cambia de sub-vista y persiste en la URL (?cacaoView=) para deep-link/refresh.
  const selectView = useCallback((v: CacaoView) => {
    setView(v);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set(CACAO_VIEW_PARAM, v);
    window.history.replaceState(null, "", url.toString());
  }, []);

  // Deep-link inicial: leer ?cacaoView= tras montar (evita hydration mismatch).
  // El sidebar del admin navega a una sub-vista disparando el evento cacao:navigate.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(CACAO_VIEW_PARAM);
    if (isCacaoView(fromUrl)) setView(fromUrl);
    const onNav = (e: Event) => {
      const v = (e as CustomEvent<string>).detail;
      if (isCacaoView(v)) setView(v);
    };
    window.addEventListener("cacao:navigate", onNav);
    return () => window.removeEventListener("cacao:navigate", onNav);
  }, []);

  async function annul() {
    if (!annulId || annulReason.trim().length < 3) return;
    try {
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "annul_lote", id: annulId, reason: annulReason.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null);
      setAnnulReason("");
      load("acopio");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const kpis = useMemo(() => {
    const reg = lotes.filter((l) => l.status === "registrado");
    const kg = reg.reduce((a, l) => a + Number(l.pesoKg ?? 0), 0);
    const valor = reg.reduce((a, l) => a + Number(l.totalPagado ?? 0), 0);
    const gradoI = reg.filter((l) => l.grado === "I").length;
    return { count: reg.length, kg, valor, gradoI };
  }, [lotes]);

  function exportCsv() {
    const head = [
      "Lote",
      "Fecha",
      "Productor",
      "Variedad",
      "Tipo",
      "Peso (kg)",
      "Humedad %",
      "Indice ferm %",
      "Grado",
      "Precio/kg",
      "Total pagado",
      "Estado",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = lotes.map((l) =>
      [
        l.loteCode,
        new Date(l.fecha).toISOString().slice(0, 10),
        l.productorNombre ?? "",
        l.variedad ?? "",
        l.tipoGrano,
        n2(l.pesoKg),
        l.humedadPct ?? "",
        l.indiceFermentacion ?? "",
        l.grado ?? "",
        l.precioPorKg ?? "",
        l.totalPagado ?? "",
        l.status,
      ]
        .map(esc)
        .join(","),
    );
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cacao-acopio-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const activeFilters = [fVariedad, fGrado, fFrom, fTo].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Agrícola · Especialización"
        title="Acopio & Beneficio de Cacao"
        description="Libro de acopio de cacao en grano: productores, lotes, calidad (prueba de corte + humedad NTP-ISO) y liquidación al productor. Alineado a NTP 208.040."
        icon={Leaf}
      >
        <CacaoAlertsBell onNavigate={selectView} />
        {view === "acopio" && (
          <>
            <button
              type="button"
              onClick={() => load(view)}
              disabled={loading}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
              aria-label="Recargar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span>Recargar</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLote(true)}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-5 w-5" />
              Nuevo lote
            </button>
          </>
        )}
      </AdminModuleHeader>

      {/* Sub-nav agrupado en 3 familias (Operación · Gestión · Inteligencia) para
          no acumular 8 pestañas planas en una sola. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b-2 border-[var(--rule-soft)] pb-3">
        {CACAO_VIEW_GROUPS.map((group, gi) => (
          <div key={group.id} className="flex items-center gap-1.5">
            {gi > 0 && (
              <span className="mr-2.5 hidden h-6 w-px bg-[var(--rule-base)] sm:block" aria-hidden />
            )}
            {group.views.map((v) => {
              const Icon = v.icon;
              const active = view === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => selectView(v.key)}
                  title={v.hint}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${active ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {/* ACOPIO */}
      {view === "acopio" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Lotes acopiados"
              value={String(kpis.count)}
              icon={PackageCheck}
              emphasis="neutral"
            />
            <StatCard
              label="Kg acopiados"
              value={`${n2(kpis.kg)} kg`}
              icon={Scale}
              emphasis="success"
            />
            <StatCard
              label="Pagado a productores"
              value={`S/ ${n2(kpis.valor)}`}
              icon={Coins}
              emphasis="neutral"
            />
            <StatCard
              label="Lotes Grado I"
              value={String(kpis.gradoI)}
              subValue="mejor calidad"
              icon={Leaf}
              emphasis={kpis.gradoI > 0 ? "success" : "neutral"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[200px] flex-1">
              <SearchBar
                value={search}
                onChange={setSearch}
                onEnter={() => load("acopio")}
                placeholder="Buscar por lote, productor o variedad…"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold ${showFilters || activeFilters ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"} hover:bg-[var(--surface-canvas)]`}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFilters > 0 && (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-[length:var(--ts-2xs)] font-bold text-white">
                  {activeFilters}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={lotes.length === 0}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-4 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Variedad
                </span>
                <select
                  value={fVariedad}
                  onChange={(e) => setFVariedad(e.target.value)}
                  className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Todas</option>
                  {CACAO_VARIEDADES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Grado
                </span>
                <select
                  value={fGrado}
                  onChange={(e) => setFGrado(e.target.value)}
                  className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Todos</option>
                  <option value="I">Grado I</option>
                  <option value="II">Grado II</option>
                  <option value="fuera_norma">Fuera de norma</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Desde
                </span>
                <input
                  type="date"
                  value={fFrom}
                  onChange={(e) => setFFrom(e.target.value)}
                  className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Hasta
                </span>
                <input
                  type="date"
                  value={fTo}
                  onChange={(e) => setFTo(e.target.value)}
                  className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              <div className="col-span-2 flex gap-2 sm:col-span-4">
                <button
                  type="button"
                  onClick={() => load("acopio")}
                  className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90"
                >
                  Aplicar filtros
                </button>
                {activeFilters > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFVariedad("");
                      setFGrado("");
                      setFFrom("");
                      setFTo("");
                      load("acopio", { variedad: "", grado: "", from: "", to: "" });
                    }}
                    className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr>
                  <Th>Lote</Th>
                  <Th>Fecha</Th>
                  <Th>Productor</Th>
                  <Th>Variedad</Th>
                  <Th className="text-right">Peso (kg)</Th>
                  <Th className="text-right">Humedad</Th>
                  <Th>Grado</Th>
                  <Th className="text-right">Pagado</Th>
                  <Th className="text-right">Acción</Th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => {
                  const annul = l.status === "anulado";
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setLoteDrawerId(l.id)}
                      className={`cursor-pointer border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)] ${annul ? "opacity-50" : ""}`}
                    >
                      <Td>
                        <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                          {l.loteCode}
                        </span>
                        {annul && (
                          <span className="ml-2 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                            ANULADO
                          </span>
                        )}
                      </Td>
                      <Td className="text-[var(--text-secondary)]">{fdate(l.fecha)}</Td>
                      <Td className="font-medium text-[var(--text-primary)]">
                        {l.productorNombre ?? "—"}
                        {l.productorNombre && !l.productorId && (
                          <span
                            title="Productor no vinculado al padrón"
                            className="ml-1.5 inline-flex rounded bg-[var(--data-warning-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-900)]"
                          >
                            sin vincular
                          </span>
                        )}
                      </Td>
                      <Td className="text-[var(--text-secondary)]">
                        {l.variedad ?? "—"}{" "}
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {l.tipoGrano === "humedo" ? "(húmedo)" : ""}
                        </span>
                      </Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                        {n2(l.pesoKg)}
                      </Td>
                      <Td className="text-right font-mono tabular-nums">
                        <span
                          className={
                            l.humedadPct && Number(l.humedadPct) > 7
                              ? "text-[var(--data-warning-700)]"
                              : "text-[var(--text-secondary)]"
                          }
                        >
                          {l.humedadPct ? `${Number(l.humedadPct).toFixed(1)}%` : "—"}
                        </span>
                      </Td>
                      <Td>
                        <GradoBadge grado={l.grado} />
                      </Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                        {l.totalPagado ? `S/ ${n2(l.totalPagado)}` : "—"}
                      </Td>
                      <Td className="text-right">
                        {annul ? (
                          <span className="text-xs text-[var(--text-tertiary)]">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAnnulId(l.id);
                              setAnnulReason("");
                            }}
                            className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]"
                          >
                            Anular
                          </button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <EmptyOrLoading
              loading={loading}
              empty={lotes.length === 0}
              icon={PackageCheck}
              msg="Empezá tu libro de acopio"
              hint="Registrá el primer lote de cacao: peso, calidad (prueba de corte) y liquidación al productor — todo se calcula al vuelo."
              cta={{ label: "Registrar primer lote", onClick: () => setShowLote(true) }}
              searchActive={!!search.trim() || activeFilters > 0}
            />
          </div>
        </>
      )}

      {/* PRODUCTORES — componente propio (self-fetch + agregados + sus modales) */}
      {view === "productores" && <CacaoProductores />}

      {/* BENEFICIO — componente propio (self-fetch + KPIs + anular + ficha lote) */}
      {view === "beneficio" && <CacaoBeneficio />}

      {/* INVENTARIO */}
      {/* INVENTARIO — componente propio (self-fetch + integración precio intl.) */}
      {view === "inventario" && <CacaoInventario />}

      {/* VENTAS — componente propio (self-fetch + descuenta inventario) */}
      {view === "ventas" && <CacaoVentas />}

      {/* RESUMEN — dashboard de campaña (componente propio, self-fetch) */}
      {view === "resumen" && <CacaoResumen />}

      {/* MERCADO (precio en vivo) */}
      {view === "mercado" && <CacaoNoticiero />}

      {/* NOTICIAS (feed separado) */}
      {view === "noticias" && <CacaoNews />}

      {/* ASESOR */}
      {view === "asesor" && <CacaoAsesor />}

      {showLote && (
        <CacaoLoteForm
          onClose={() => setShowLote(false)}
          onSaved={(o) => {
            if (!o?.keepOpen) setShowLote(false);
            load("acopio");
          }}
        />
      )}

      {loteDrawerId && (
        <CacaoLoteDrawer loteId={loteDrawerId} onClose={() => setLoteDrawerId(null)} />
      )}

      {annulId && (
        <AdminModal open onClose={() => setAnnulId(null)} variant="centered-sm" hideCloseButton>
          <div className="bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--data-error-50)] text-[var(--data-error-600)]">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Anular lote {lotes.find((l) => l.id === annulId)?.loteCode ?? ""}
                </h3>
                <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                  El lote queda marcado como anulado y sale de los totales.{" "}
                  <strong className="text-[var(--text-secondary)]">No se borra</strong> — queda con
                  su motivo en el historial.
                </p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                Motivo de la anulación
              </span>
              <input
                autoFocus
                value={annulReason}
                onChange={(e) => setAnnulReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && annulReason.trim().length >= 3) annul();
                }}
                placeholder="Ej: error de pesaje, lote duplicado…"
                className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
              />
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                Mínimo 3 caracteres.
              </span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnnulId(null)}
                className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={annulReason.trim().length < 3}
                onClick={annul}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" />
                Anular lote
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
function SearchBar({
  value,
  onChange,
  onEnter,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
      <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder={placeholder}
        className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
      />
    </div>
  );
}
function GradoBadge({ grado }: { grado: string | null }) {
  if (!grado) return <span className="text-xs text-[var(--text-tertiary)]">sin clasificar</span>;
  const g = grado as CacaoGrado;
  const cls =
    g === "I"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]"
      : g === "II"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"
        : "bg-[var(--data-error-100)] text-[var(--data-error-700)]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      {GRADO_LABEL[g] ?? grado}
    </span>
  );
}
function EmptyOrLoading({
  loading,
  empty,
  icon: Icon,
  msg,
  hint,
  cta,
  searchActive,
}: {
  loading: boolean;
  empty: boolean;
  icon: typeof Leaf;
  msg: string;
  hint?: string;
  cta?: { label: string; onClick: () => void };
  searchActive?: boolean;
}) {
  if (loading)
    return (
      <div className="p-8 text-center text-[var(--text-tertiary)]">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2 text-sm">Cargando…</p>
      </div>
    );
  if (!empty) return null;
  if (searchActive)
    return (
      <div className="p-12 text-center text-[var(--text-tertiary)]">
        <Search className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-base font-medium">Sin resultados para tu búsqueda.</p>
        <p className="mt-1 text-sm">Probá con otro término o limpiá los filtros.</p>
      </div>
    );
  return (
    <div className="p-12 text-center text-[var(--text-tertiary)]">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon className="h-7 w-7" />
      </span>
      <p className="text-base font-bold text-[var(--text-primary)]">{msg}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm">{hint}</p>}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {cta.label}
        </button>
      )}
    </div>
  );
}
