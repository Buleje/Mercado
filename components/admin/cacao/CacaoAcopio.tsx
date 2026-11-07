"use client";

/**
 * CacaoAcopio — Módulo admin de Acopio & Beneficio de Cacao (ADR-128).
 * Gating: spec:agricola:cacao-acopio. 13 sub-vistas agrupadas en 3 familias
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
  RotateCcw,
  AlertTriangle,
  Wallet,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { FiltrosEnBoton } from "@/components/admin/shared";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";
import LibroChrome, { type LibroAction } from "@/components/admin/shared/libro-chrome";
import { TablaSkeleton } from "@/components/admin/shared/module-primitives";
import CacaoLoteCardMobile from "./CacaoLoteCardMobile";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  GRADO_LABEL,
  ESTADO_PAGO_LABEL,
  type CacaoGrado,
  type CacaoEstadoPago,
} from "@/lib/cacao/cacao-quality";
import {
  CACAO_VIEW_GROUPS,
  CACAO_VIEW_PARAM,
  DEFAULT_CACAO_VIEW,
  aCacaoView,
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
import CacaoLiquidaciones from "./CacaoLiquidaciones";
import CacaoMapa from "./CacaoMapa";
import CacaoCertificacion from "./CacaoCertificacion";
import CacaoCierrePanel from "./CacaoCierrePanel";
import CacaoCampo from "./CacaoCampo";
import CacaoVentas from "./CacaoVentas";
import CacaoAlertsBell from "./CacaoAlertsBell";
import TablaAcopio, { GradoBadge, PagoBadge } from "./acopio/TablaAcopio";
import { QUICK_CHIPS, SIN_GRADO, fdate, n2, saldoDe, tienePendiente, type Lote, type Quick, type SortKey } from "./acopio/columnas-filtro-acopio";
import CampoBuscar from "@/components/ui-system/CampoBuscar";

export default function CacaoAcopio() {
  const [view, setView] = useState<CacaoView>(DEFAULT_CACAO_VIEW);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showLote, setShowLote] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  // Registro de pago al productor desde el libro (estado de cuenta, ADR-302).
  const [payId, setPayId] = useState<string | null>(null);
  const [payMonto, setPayMonto] = useState("");
  const [paying, setPaying] = useState(false);
  const [loteDrawerId, setLoteDrawerId] = useState<string | null>(null);
  // Filtros de acopio (task #4) — sólo el rango de fechas queda server-side
  // (recorta qué se pide, no algo que ya esté en cada fila cargada).
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  // Refinamiento client-side sobre los lotes ya cargados (chips + orden +
  // autofiltro de columna en Variedad y Grado).
  const [quick, setQuick] = useState<Quick>("todos");
  const [varFilter, setVarFilter] = useState<string[]>([]);
  const [gradoFilter, setGradoFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "fecha", dir: "desc" });
  // Columnas de la tabla de Acopio: arrastrar el título para reordenarlas.
  const ordenAcopio = useOrdenColumnas("cacao-acopio-lotes", ["lote", "fecha", "productor", "variedad", "pesoKg", "humedad", "grado", "totalPagado"]);

  const load = useCallback(
    async (v: CacaoView, fOverride?: { from?: string; to?: string }) => {
      // Solo "acopio" se renderiza inline; el resto son componentes self-fetch.
      if (v !== "acopio") {
        setLoading(false);
        return;
      } // ventas/inventario/etc. self-fetch
      setLoading(true);
      setError(null);
      const ff = fOverride?.from ?? fFrom,
        ft = fOverride?.to ?? fTo;
      try {
        const q = new URLSearchParams({ view: "lotes" });
        if (search.trim()) q.set("search", search.trim());
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
    [search, fFrom, fTo],
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

  /** La cabina navega con strings; acá se valida contra las vistas reales. */
  const irA = useCallback((v: string) => { const cv = aCacaoView(v); if (cv) selectView(cv); }, [selectView]);

  // Deep-link inicial: leer ?cacaoView= tras montar (evita hydration mismatch).
  // El sidebar del admin navega a una sub-vista disparando el evento cacao:navigate.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(CACAO_VIEW_PARAM);
    /* `aCacaoView`: un nombre viejo (`noticias`) abre su casa de hoy (Mercado). */
    const deUrl = aCacaoView(fromUrl);
    if (deUrl && deUrl !== fromUrl) selectView(deUrl); // reescribe el nombre viejo en la URL
    else if (deUrl) setView(deUrl);
    const onNav = (e: Event) => {
      const v = aCacaoView((e as CustomEvent<string>).detail);
      if (v) setView(v);
    };
    window.addEventListener("cacao:navigate", onNav);
    return () => window.removeEventListener("cacao:navigate", onNav);
  }, [selectView]);

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

  // Registra el monto ACUMULADO abonado al productor (adelanto + abonos) sobre un
  // lote. Mismo contrato que el drawer del productor: el backend deriva estadoPago.
  async function pagar() {
    if (!payId) return;
    const monto = payMonto === "" ? 0 : Number(payMonto);
    if (!Number.isFinite(monto) || monto < 0) return;
    setPaying(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "pago_acopio", id: payId, montoPagado: monto }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setPayId(null);
      setPayMonto("");
      load("acopio");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  }

  // Abre el modal de pago precargando lo ya abonado (el input es el total acumulado).
  const openPay = useCallback((l: Lote) => {
    setPayId(l.id);
    setPayMonto(l.montoPagado != null && Number(l.montoPagado) > 0 ? String(Number(l.montoPagado)) : "");
  }, []);

  const kpis = useMemo(() => {
    const reg = lotes.filter((l) => l.status === "registrado");
    const kg = reg.reduce((a, l) => a + Number(l.pesoKg ?? 0), 0);
    const liquidacion = reg.reduce((a, l) => a + Number(l.totalPagado ?? 0), 0);
    const abonado = reg.reduce((a, l) => a + Number(l.montoPagado ?? 0), 0);
    const porPagar = reg.reduce((a, l) => a + (l.estadoPago !== "pagado" ? saldoDe(l) : 0), 0);
    const nPorPagar = reg.filter(tienePendiente).length;
    const gradoI = reg.filter((l) => l.grado === "I").length;
    return { count: reg.length, kg, liquidacion, abonado, porPagar, nPorPagar, gradoI };
  }, [lotes]);

  // Contadores para los chips rápidos (sobre el set cargado, registrados).
  const quickCounts = useMemo(() => {
    const reg = lotes.filter((l) => l.status === "registrado");
    return {
      todos: reg.length,
      saldo: reg.filter(tienePendiente).length,
      sin_vincular: reg.filter((l) => l.productorNombre && !l.productorId).length,
      humedo: reg.filter((l) => l.tipoGrano === "humedo").length,
    };
  }, [lotes]);

  // Peso de cada Variedad/Grado sobre TODOS los lotes cargados (no sobre lo ya
  // filtrado por el otro autofiltro o los chips) — Excel: la propia columna no
  // se recorta a sí misma.
  const varOptions = useMemo<FacetaOpcion[]>(() => {
    const counts: Record<string, number> = {};
    for (const l of lotes) if (l.variedad) counts[l.variedad] = (counts[l.variedad] ?? 0) + 1;
    return Object.entries(counts).map(([value, count]) => ({ value, count }));
  }, [lotes]);
  const gradoOptions = useMemo<FacetaOpcion[]>(() => {
    const counts: Record<string, number> = {};
    for (const l of lotes) {
      const k = l.grado ?? SIN_GRADO;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return Object.entries(counts).map(([value, count]) => ({ value, count }));
  }, [lotes]);

  // Filas visibles: chips + autofiltro de columna + orden (client-side, sin refetch).
  const rows = useMemo(() => {
    let r = lotes;
    if (quick === "saldo") r = r.filter(tienePendiente);
    else if (quick === "sin_vincular") r = r.filter((l) => l.productorNombre && !l.productorId);
    else if (quick === "humedo") r = r.filter((l) => l.tipoGrano === "humedo");
    if (varFilter.length > 0) r = r.filter((l) => l.variedad != null && varFilter.includes(l.variedad));
    if (gradoFilter.length > 0) r = r.filter((l) => gradoFilter.includes(l.grado ?? SIN_GRADO));
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (l: Lote) =>
      sort.key === "fecha" ? new Date(l.fecha).getTime() : Number(l[sort.key] ?? 0);
    return [...r].sort((a, b) => (val(a) - val(b)) * dir);
  }, [lotes, quick, varFilter, gradoFilter, sort]);

  // Totales del set visible (pie de tabla).
  const rowTotals = useMemo(
    () => ({
      kg: rows.reduce((a, l) => a + Number(l.pesoKg ?? 0), 0),
      liquidacion: rows.reduce((a, l) => a + Number(l.totalPagado ?? 0), 0),
      saldo: rows.reduce((a, l) => a + saldoDe(l), 0),
    }),
    [rows],
  );

  const toggleSort = useCallback((key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }, []);

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
      "Liquidación",
      "Abonado",
      "Saldo",
      "Estado pago",
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
        l.montoPagado ?? "",
        l.totalPagado ? saldoDe(l).toFixed(2) : "",
        ESTADO_PAGO_LABEL[l.estadoPago as CacaoEstadoPago] ?? l.estadoPago,
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
  const activeFilters = [fFrom, fTo].filter(Boolean).length;
  const limpiarFechas = () => {
    setFFrom("");
    setFTo("");
    load("acopio", { from: "", to: "" });
  };
  const chipsFecha = [
    fFrom && { id: "desde", label: `Desde ${fdate(fFrom)}`, onQuitar: () => { setFFrom(""); load("acopio", { from: "", to: fTo }); } },
    fTo && { id: "hasta", label: `Hasta ${fdate(fTo)}`, onQuitar: () => { setFTo(""); load("acopio", { from: fFrom, to: "" }); } },
  ].filter((c): c is { id: string; label: string; onQuitar: () => void } => !!c);

  /** Lo que se baja una vez por campaña: plegado, no ocupando la cabecera. */
  const acciones: LibroAction[] = [
    ...(view === "acopio" && ordenAcopio.cambiado
      ? [{
          id: "restablecer-columnas",
          label: "Restablecer columnas",
          hint: "Vuelve al orden original de la tabla",
          icon: RotateCcw,
          onSelect: ordenAcopio.restablecer,
        }]
      : []),
    {
      id: "csv",
      label: "Exportar lotes (CSV)",
      hint: "Los lotes del filtro actual, con calidad y liquidación",
      icon: Download,
      disabled: lotes.length === 0,
      onSelect: exportCsv,
    },
  ];

  return (
    <LibroChrome
      moduleId="cacao-acopio"
      eyebrow="Agrícola · NTP 208.040"
      title="Acopio & Beneficio de Cacao"
      icon={Leaf}
      groups={CACAO_VIEW_GROUPS}
      view={view}
      onView={irA}
      status={<CacaoAlertsBell onNavigate={selectView} />}
      tools={
        view === "acopio" ? (
          <>
            <button
              type="button"
              onClick={() => load(view)}
              disabled={loading}
              aria-label="Recargar"
              title="Recargar los lotes"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowLote(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Nuevo lote
            </button>
          </>
        ) : undefined
      }
      actions={acciones}
    >

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
              subValue={kpis.gradoI > 0 ? `${kpis.gradoI} de Grado I` : undefined}
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
              label="Liquidación total"
              value={`S/ ${n2(kpis.liquidacion)}`}
              subValue={`S/ ${n2(kpis.abonado)} abonado`}
              icon={Coins}
              emphasis="neutral"
            />
            <StatCard
              label="Por pagar a productores"
              value={`S/ ${n2(kpis.porPagar)}`}
              subValue={
                kpis.nPorPagar > 0
                  ? `${kpis.nPorPagar} lote${kpis.nPorPagar === 1 ? "" : "s"} pendiente${kpis.nPorPagar === 1 ? "" : "s"}`
                  : "todo al día"
              }
              icon={Wallet}
              emphasis={kpis.porPagar > 0 ? "warning" : "success"}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[200px] flex-1">
              <CampoBuscar
                valor={search}
                onCambiar={setSearch}
                onEnter={() => load("acopio")}
                placeholder="Buscar por lote, productor o variedad…"
                etiqueta="Buscar en el acopio"
              />
            </div>
            <FiltrosEnBoton
              activos={activeFilters}
              chips={chipsFecha}
              onLimpiar={limpiarFechas}
            >
              <div className="grid grid-cols-2 gap-3">
              {/* Variedad y Grado son columnas de la tabla: en desktop su
                  filtro vive en el propio `<th>` (autofiltro instantáneo). En
                  el celular la tabla es tarjetas y no hay `<th>` que lo
                  sostenga — se repite acá, mismo estado, sólo `sm:hidden`. */}
              {/* `<div>`, no `<label>`: FiltroColumnaMulti ya trae su propio
                  aria-label — un `<label>` sin control real dispara
                  jsx-a11y/label-has-associated-control. */}
              <div className="col-span-2 block sm:hidden">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Variedad
                </span>
                <FiltroColumnaMulti
                  label="Variedad"
                  value={varFilter}
                  options={varOptions}
                  onChange={setVarFilter}
                  placeholder="Todas"
                  className="!mt-0"
                />
              </div>
              <div className="col-span-2 block sm:hidden">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Grado
                </span>
                <FiltroColumnaMulti
                  label="Grado"
                  value={gradoFilter}
                  options={gradoOptions}
                  etiqueta={(v) => (v === SIN_GRADO ? "Sin clasificar" : GRADO_LABEL[v as CacaoGrado] ?? v)}
                  onChange={setGradoFilter}
                  placeholder="Todos"
                  className="!mt-0"
                />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Desde
                </span>
                <input
                  type="date"
                  value={fFrom}
                  onChange={(e) => setFFrom(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"
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
                  className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => load("acopio")}
                    className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Aplicar filtros
                  </button>
                </div>
              </div>
            </FiltrosEnBoton>
          </div>
          {/* Chips de filtro rápido (client-side sobre el set cargado). */}
          {lotes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_CHIPS.map((c) => {
                const count = quickCounts[c.key];
                if (c.key !== "todos" && count === 0) return null;
                const active = quick === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setQuick(c.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                  >
                    {c.label}
                    <span
                      className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[length:var(--ts-2xs)] ${active ? "bg-white/25 text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* Desktop: tabla. Móvil: cards a medida (abajo) — la conversión
              automática `.admin-mobile-cards` dejaba tarjetas de 120px de ancho
              con la fecha partida en tres líneas. */}
          <TablaAcopio
            rows={rows} rowTotals={rowTotals} sort={sort} onSort={toggleSort} ordenAcopio={ordenAcopio}
            varFilter={varFilter} onVarFilter={setVarFilter} varOptions={varOptions}
            gradoFilter={gradoFilter} onGradoFilter={setGradoFilter} gradoOptions={gradoOptions}
            onOpenLote={setLoteDrawerId} onPagar={openPay} onAnular={(id) => { setAnnulId(id); setAnnulReason(""); }}
          />

          {/* Móvil: una card por lote (dual-render del DS). */}
          {rows.length > 0 && (
            <div className="space-y-3 sm:hidden">
              {rows.map((l) => (
                <CacaoLoteCardMobile
                  key={l.id}
                  lote={l}
                  fecha={fdate(l.fecha)}
                  peso={n2(l.pesoKg)}
                  saldo={l.totalPagado ? `S/ ${n2(l.totalPagado)}` : "—"}
                  pendiente={tienePendiente(l)}
                  gradoBadge={<GradoBadge grado={l.grado} />}
                  pagoBadge={l.totalPagado ? <PagoBadge estado={l.estadoPago} saldo={saldoDe(l)} /> : null}
                  onOpen={() => setLoteDrawerId(l.id)}
                  onPagar={() => openPay(l)}
                  onAnular={() => { setAnnulId(l.id); setAnnulReason(""); }}
                />
              ))}
              {/* El total también en móvil: es el número con el que se cierra el día. */}
              <p className="flex items-center justify-between rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm">
                <span className="font-bold text-[var(--text-secondary)]">Total · {rows.length} lote{rows.length === 1 ? "" : "s"}</span>
                <span className="text-right">
                  <b className="block font-mono tabular-nums text-[var(--text-primary)]">{n2(rowTotals.kg)} kg · S/ {n2(rowTotals.liquidacion)}</b>
                  {rowTotals.saldo > 0 && (
                    <span className="block text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      S/ {n2(rowTotals.saldo)} por pagar
                    </span>
                  )}
                </span>
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] empty:hidden">
            <EmptyOrLoading
              loading={loading}
              empty={rows.length === 0}
              icon={PackageCheck}
              msg="Empieza tu libro de acopio"
              hint="Registra el primer lote de cacao: peso, calidad (prueba de corte) y liquidación al productor — todo se calcula al vuelo."
              cta={{ label: "Registrar primer lote", onClick: () => setShowLote(true) }}
              searchActive={!!search.trim() || activeFilters > 0 || quick !== "todos"}
            />
          </div>
        </>
      )}

      {/* PRODUCTORES — componente propio (self-fetch + agregados + sus modales) */}
      {view === "productores" && <CacaoProductores />}

      {/* LIQUIDACIONES — cuentas por pagar al productor (worklist + pago batch) */}
      {view === "liquidaciones" && <CacaoLiquidaciones />}

      {/* MAPA — parcelas de productores geolocalizadas (multi-marker) */}
      {view === "mapa" && <CacaoMapa />}

      {/* CERTIFICACIÓN — cumplimiento EUDR (geolocalización) + certificaciones */}
      {view === "certificacion" && <CacaoCertificacion />}

      {view === "cierre" && <CacaoCierrePanel />}

      {/* CAMPO — maqueta de la chacra en grilla + labores por sección */}
      {view === "campo" && <CacaoCampo />}

      {/* BENEFICIO — componente propio (self-fetch + KPIs + anular + ficha lote) */}
      {view === "beneficio" && <CacaoBeneficio />}

      {/* INVENTARIO */}
      {/* INVENTARIO — componente propio (self-fetch + integración precio intl.) */}
      {view === "inventario" && <CacaoInventario />}

      {/* VENTAS — componente propio (self-fetch + descuenta inventario) */}
      {view === "ventas" && <CacaoVentas />}

      {/* RESUMEN — dashboard de campaña (componente propio, self-fetch) */}
      {view === "resumen" && <CacaoResumen />}

      {/* MERCADO — el precio en vivo y, debajo, las noticias que lo mueven (las
          dos leen /market; hasta la ola 2 del panel unificado eran dos vistas). */}
      {view === "mercado" && (
        <div className="space-y-6">
          <CacaoNoticiero />
          <CacaoNews />
        </div>
      )}

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
          <div className="bg-[var(--surface-raised)] px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--data-error-50)] text-[var(--data-error-600)]">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <div role="heading" aria-level={3} className="text-base font-bold text-[var(--text-primary)]">
                  Anular lote {lotes.find((l) => l.id === annulId)?.loteCode ?? ""}
                </div>
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
                ref={(el) => el?.focus()}
                value={annulReason}
                onChange={(e) => setAnnulReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && annulReason.trim().length >= 3) annul();
                }}
                placeholder="Ej: error de pesaje, lote duplicado…"
                className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
              />
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                Mínimo 3 caracteres.
              </span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnnulId(null)}
                className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={annulReason.trim().length < 3}
                onClick={annul}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" />
                Anular lote
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {payId &&
        (() => {
          const l = lotes.find((x) => x.id === payId);
          if (!l) return null;
          const debido = Number(l.totalPagado ?? 0);
          const montoNum = payMonto === "" ? 0 : Number(payMonto);
          const saldoLive = Math.max(0, debido - (Number.isFinite(montoNum) ? montoNum : 0));
          const invalido = !Number.isFinite(montoNum) || montoNum < 0;
          return (
            <AdminModal open onClose={() => setPayId(null)} variant="centered-sm" hideCloseButton>
              <div className="bg-[var(--surface-raised)] px-5 py-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    <Wallet className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <div role="heading" aria-level={3} className="text-base font-bold text-[var(--text-primary)]">
                      Registrar pago · {l.loteCode}
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                      {l.productorNombre ?? "Productor sin vincular"} — anota cuánto le pagaste por
                      este lote.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-3 text-center">
                  <div>
                    <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Debido
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      S/ {n2(debido)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Abonado
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-[var(--data-success-700)]">
                      S/ {n2(montoNum)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Saldo
                    </span>
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${saldoLive > 0 ? "text-[var(--data-warning-700)]" : "text-[var(--data-success-700)]"}`}
                    >
                      S/ {n2(saldoLive)}
                    </span>
                  </div>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-[var(--text-primary)]">
                    Total abonado al productor (S/)
                    <button
                      type="button"
                      onClick={() => setPayMonto(String(debido))}
                      className="text-xs font-bold text-[var(--accent)] hover:underline"
                    >
                      Pagar todo (S/ {n2(debido)})
                    </button>
                  </span>
                  <input
                    ref={(el) => el?.focus()}
                    inputMode="decimal"
                    value={payMonto}
                    onChange={(e) => setPayMonto(e.target.value.replace(/[^0-9.]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !invalido && !paying) pagar();
                    }}
                    placeholder="0.00"
                    className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                  <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                    Es el total acumulado pagado por este lote (adelanto + abonos), no solo el último
                    abono.
                  </span>
                </label>

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPayId(null)}
                    className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={invalido || paying}
                    onClick={pagar}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Wallet className="h-4 w-4" />
                    {paying ? "Guardando…" : "Registrar pago"}
                  </button>
                </div>
              </div>
            </AdminModal>
          );
        })()}
    </LibroChrome>
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
  // Silueta de lo que viene, no un spinner con "Cargando…": el ojo ya sabe
  // dónde va a aparecer cada dato y la vista no salta al llegar.
  if (loading) return <TablaSkeleton filas={4} columnas={7} />;
  if (!empty) return null;
  if (searchActive)
    return (
      <div className="p-12 text-center text-[var(--text-tertiary)]">
        <Search className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-base font-medium">Sin resultados para tu búsqueda.</p>
        <p className="mt-1 text-sm">Prueba con otro término o limpia los filtros.</p>
      </div>
    );
  return (
    <div className="p-12 text-center text-[var(--text-tertiary)]">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <Icon className="h-7 w-7" />
      </span>
      <p className="text-base font-bold text-[var(--text-primary)]">{msg}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm">{hint}</p>}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {cta.label}
        </button>
      )}
    </div>
  );
}
