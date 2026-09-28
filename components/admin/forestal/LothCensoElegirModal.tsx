"use client";

/**
 * «Ver censo» — el censo entero del plan, encima del formulario de tala, para
 * elegir el árbol sabiendo qué se usó: disponibles, talados (en qué línea,
 * cuántas trozas salieron, cuántas se despacharon), semilleros y bajo DMC.
 *
 * Pedido de Brandon (28-09): «una tabla… con todo del censo y saldrá cuál
 * madera ya se usó, sus medidas, DAP, etc., poniendo los disponibles,
 * talados, para tomar mejores decisiones».
 *
 * Elegir un árbol disponible lo carga en el formulario. Un talado o descartado
 * no se elige y dice por qué. Uno que no se debe tumbar (semillero o
 * remanente del regente, bajo DMC) se ve igual, pero pide confirmar.
 *
 * En el trozado (`para="trozado"`) es al revés: se elige uno que YA tiene su
 * línea de tala, y el modal abre en «Talados».
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, MapPin, RefreshCw, Search, ShieldAlert, Trees } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  contarFiltros,
  distanciaAlArbol,
  filtrarCenso,
  FILTROS_CENSO,
  ordenarCenso,
  totalesCenso,
  type ArbolParaElegir,
  type ColumnaCenso,
  type FiltroCenso,
} from "@/lib/forestal/loth-censo-uso";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { CensoDeTala } from "./hooks/use-censo-de-tala";
import LothCensoElegirTabla, { type OrdenCenso } from "./LothCensoElegirTabla";

interface Props {
  open: boolean;
  onClose: () => void;
  censo: CensoDeTala;
  /** «Plan PO 12 — Maderera El Aguajal SAC». */
  planLabel: string | null;
  /** Código que ya está en el formulario (se resalta). */
  elegido: string;
  /** GPS del teléfono que ya tiene el formulario: las distancias salen solas. */
  posicion: { lat: number; lng: number } | null;
  onElegir: (a: ArbolParaElegir) => void;
  /** Tala: un árbol en pie. Trozado: uno con su tala en el libro. */
  para?: "tala" | "trozado";
}

const INPUT =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20";
const BTN =
  "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60";

export default function LothCensoElegirModal({ open, onClose, censo, planLabel, elegido, posicion, onElegir, para = "tala" }: Props) {
  const [filtro, setFiltro] = useState<FiltroCenso>(para === "trozado" ? "talados" : "disponibles");
  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<OrdenCenso>({ columna: "codigo", dir: "asc" });
  const [pos, setPos] = useState(posicion);
  const [ubicando, setUbicando] = useState(false);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  /** El árbol que pide confirmar antes de cargarlo (semillero, bajo DMC…). */
  const [pendiente, setPendiente] = useState<ArbolParaElegir | null>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);

  /* Por los números: el formulario arma el objeto en cada render. */
  const latForm = posicion?.lat;
  const lngForm = posicion?.lng;
  useEffect(() => {
    if (latForm == null || lngForm == null) return;
    setPos({ lat: latForm, lng: lngForm });
    // Con el GPS del teléfono, lo primero que se busca es el árbol de al lado.
    setOrden({ columna: "distancia", dir: "asc" });
  }, [latForm, lngForm]);
  useEffect(() => {
    if (pendiente) confirmarRef.current?.focus();
  }, [pendiente]);

  const cuenta = useMemo(() => contarFiltros(censo.arboles), [censo.arboles]);
  const distancias = useMemo(() => {
    if (!pos) return null;
    const m = new Map<string, number>();
    for (const a of censo.arboles) {
      const d = distanciaAlArbol(a, pos.lat, pos.lng);
      if (d != null) m.set(a.id, d);
    }
    return m;
  }, [censo.arboles, pos]);
  const filas = useMemo(
    () => ordenarCenso(filtrarCenso(censo.arboles, filtro, texto), orden.columna, orden.dir, distancias ?? undefined),
    [censo.arboles, filtro, texto, orden, distancias],
  );
  const tot = useMemo(() => totalesCenso(filas), [filas]);
  const taladoLibroM3 = useMemo(() => filas.reduce((s, a) => s + (a.uso?.tala?.volumeM3 ?? 0), 0), [filas]);

  function ordenar(col: ColumnaCenso) {
    setOrden((o) => (o.columna === col ? { columna: col, dir: o.dir === "asc" ? "desc" : "asc" } : { columna: col, dir: "asc" }));
  }

  function ubicarme() {
    if (!navigator.geolocation) {
      setErrorGps("Este equipo no da la ubicación.");
      return;
    }
    setUbicando(true);
    setErrorGps(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setOrden({ columna: "distancia", dir: "asc" });
        setUbicando(false);
      },
      (err) => {
        setErrorGps(`No se pudo obtener la ubicación: ${err.message}`);
        setUbicando(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function elegir(a: ArbolParaElegir) {
    if (para === "tala" && a.reparo && pendiente?.id !== a.id) {
      setPendiente(a);
      return;
    }
    setPendiente(null);
    onElegir(a);
  }

  const vacio = censo.arboles.length === 0
    ? "Este plan no tiene árboles en el censo. Cárgalos en Plan de manejo · Censo."
    : texto.trim()
      ? "Ningún árbol coincide con la búsqueda."
      : "Ningún árbol en este filtro.";

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      aboveModals
      variant="info"
      icon={Trees}
      title="Censo del plan"
      description={planLabel ?? undefined}
      claveVentana="loth-censo-elegir"
      // 10 columnas con la distancia: a 64 rem «En el libro» quedaba fuera,
      // detrás de «Elegir» (medido 28-09 a 1280). 74 rem entran a 1280.
      className="sm:max-w-[74rem]"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
            <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{formatNumber(tot.arboles)}</span> {tot.arboles === 1 ? "árbol" : "árboles"} ·{" "}
            <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(tot.m3)}</span> m³ estimados
            {taladoLibroM3 > 0 && (
              <> · <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(taladoLibroM3)}</span> m³ talados en el libro</>
            )}
          </p>
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filtrar el censo" className="flex flex-wrap gap-1.5">
            {FILTROS_CENSO.map((f) => {
              const activo = filtro === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setFiltro(f.key)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                    activo
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {f.label}
                  <span className="font-mono text-xs tabular-nums opacity-80">{cuenta[f.key]}</span>
                </button>
              );
            })}
            <span className="inline-flex h-9 items-center">
              <InfoTip
                icono="ayuda"
                title="Cómo se lee"
                what={
                  para === "trozado"
                    ? "«En el libro» sale de las líneas asentadas: en el trozado se elige un árbol que ya tiene su tala; el que no la tiene no tiene qué trozar."
                    : "«En el libro» sale de las líneas asentadas: si el árbol ya tiene tala, no se elige aunque el censo diga «en pie»."
                }
                affects="Semillero o remanente del regente y bajo DMC se ven, pero piden confirmar: tumbarlos es infracción."
                example="Categoría POA «Semillero» sin que el regente lo diga: es la reserva que calcula el plan con los más gruesos."
              />
            </span>
          </div>
          <div className="relative min-w-0 grow basis-[12rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, especie, nombre nativo…" aria-label="Buscar en el censo" className={INPUT} />
          </div>
          <button type="button" onClick={ubicarme} disabled={ubicando} className={BTN} title="Ordenar por distancia desde donde estás">
            {ubicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4 text-[var(--data-success-600)]" />}
            {pos ? "Más cerca" : "Por cercanía"}
          </button>
        </div>

        {errorGps && (
          <p className="flex items-center gap-1.5 text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {errorGps}
          </p>
        )}
        {!censo.usoLeido && !censo.cargando && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No se pudo cruzar con el libro: «disponible» es lo que dice el censo.
          </p>
        )}

        {pendiente?.reparo && (
          <div
            role="alert"
            className={`flex flex-wrap items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-sm ${
              pendiente.reparo.nivel === "infraccion"
                ? "border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
                : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
            }`}
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <b>Árbol {pendiente.treeCode}: {pendiente.reparo.titulo}.</b> {pendiente.reparo.detalle}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setPendiente(null)} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                Volver
              </button>
              <button ref={confirmarRef} type="button" onClick={() => elegir(pendiente)} className="inline-flex h-9 items-center rounded-lg border-2 border-current px-3 text-sm font-bold">
                Elegirlo igual
              </button>
            </div>
          </div>
        )}

        {censo.error ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2.5 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{censo.error}</span>
            <button type="button" onClick={censo.recargar} className={BTN}><RefreshCw className="h-4 w-4" />Reintentar</button>
          </div>
        ) : censo.cargando && censo.arboles.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando el censo…
          </div>
        ) : (
          <LothCensoElegirTabla
            arboles={filas}
            orden={orden}
            onOrdenar={ordenar}
            distancias={distancias}
            elegido={elegido}
            onElegir={elegir}
            vacio={vacio}
            para={para}
          />
        )}
        {censo.truncado && (
          <p className="text-xs text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
            El censo tiene más árboles de los que se cargaron: acá no se ven todos.
          </p>
        )}
      </div>
    </AdminModal>
  );
}
