"use client";

/**
 * PorCobrarDashboard — la lista única de lo que te deben.
 *
 * Era un tablero de cuatro tarjetas que sólo sumaban y enlazaban: para ver UNA
 * deuda había que entrar a otra pestaña (Brandon 2026-09-21: «una sola vista
 * compacta, para reducir el tiempo de ir buscando cada uno»). Ahora la vista ES
 * la tabla: una fila por deuda, ordenada por urgencia de cobranza, con las
 * cifras en una línea y en los chips que filtran. Todas salen del backend
 * (`?detalle=1` deriva el resumen de las MISMAS filas que lista: la cabecera no
 * puede decir un número que la tabla no sume).
 *
 * Lo que NO cambia: el cobro se registra en cada módulo y cada fila lleva ahí.
 * La madera vive en el Libro CTP (otro módulo): ese salto lo recarga entero.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DataTable, BadgeStatus, SectionTitle } from "@buleje/design-system";
import {
  Wallet, CreditCard, Landmark, DollarSign, ArrowRight, RefreshCw, Trees, Search, Gauge,
} from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { tenantFetch } from "@/lib/tenant-fetch";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

type Tipo = "fiado" | "prestamo" | "adelanto" | "madera";

/** Espejo de `PorCobrarFila` del backend (el .db.ts es `server-only`). */
interface Fila {
  id: string; tipo: Tipo; quien: string; monto: number;
  desde: string | null; vence: string | null; nota: string | null;
}
interface Bucket { total: number; count: number; }
interface Detalle { fiados: Bucket; prestamos: Bucket; adelantos: Bucket; madera: Bucket; totalGeneral: number; items: Fila[]; }

const CERO = { total: 0, count: 0 };
const VACIO: Detalle = { fiados: CERO, prestamos: CERO, adelantos: CERO, madera: CERO, totalGeneral: 0, items: [] };

/** Un tipo de deuda: cómo se dice, de qué color es y dónde se cobra. */
const TIPOS: Record<Tipo, {
  label: string; /** El plural va escrito: «maderas» no existe. */ plural: string;
  bucket: keyof Omit<Detalle, "totalGeneral" | "items">;
  icon: typeof CreditCard; chip: string; destino: string; externo?: boolean;
}> = {
  fiado:     { label: "Fiado",    plural: "Fiados",    bucket: "fiados",    icon: CreditCard, chip: "bg-[var(--accent)]/15 text-[var(--accent-ink)] dark:text-[var(--accent)]", destino: "fiados" },
  prestamo:  { label: "Préstamo", plural: "Préstamos", bucket: "prestamos", icon: Landmark,   chip: "bg-[var(--data-info-500)]/15 text-[var(--data-info-500)]", destino: "prestamos" },
  adelanto:  { label: "Adelanto", plural: "Adelantos", bucket: "adelantos", icon: DollarSign, chip: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]", destino: "adelantos" },
  /* La madera NO es sección hermana de Mi Plata: su detalle vive en el Libro
     CTP y hay que recargar ese módulo entero. */
  madera:    { label: "Madera",   plural: "Madera",    bucket: "madera",    icon: Trees,      chip: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", destino: "ctp-libro-operaciones", externo: true },
};
const ORDEN: Tipo[] = ["fiado", "prestamo", "adelanto", "madera"];

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const CHIP = "inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-colors";
const CHIP_ON = "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50";
/* 44 px de alto en el celular (el dedo), 36 en la tabla del escritorio. */
const BOTON_FILA = "inline-flex h-11 items-center sm:h-9 justify-center gap-1 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";

/** «jue 10/09» — a mano, sin `Intl`: el ICU cambia los nombres entre versiones. */
function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${DIAS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Días entre dos `YYYY-MM-DD`, en UTC (date-only: sin husos de por medio). */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Salto a otro módulo del panel: recarga el módulo destino entero. */
function goTab(tab: string) {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab } }));
}

export default function PorCobrarDashboard({ onIr }: { onIr?: (seccion: string) => void } = {}) {
  const [data, setData] = useState<Detalle>(VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Tipo | "todo">("todo");
  const [q, setQ] = useState("");
  /* Número de carga: dos toques al botón de actualizar y la respuesta lenta de
     la primera pisaba a la segunda. Sólo manda la última pedida. */
  const ultima = useRef(0);

  const load = useCallback(() => {
    const mia = ++ultima.current;
    setLoading(true);
    setError(null);
    tenantFetch("/api/admin/por-cobrar?detalle=1")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Detalle>;
      })
      .then((d) => {
        if (mia !== ultima.current) return;
        if (d && Array.isArray(d.items)) setData(d);
        else throw new Error("Respuesta inesperada");
      })
      .catch((err: unknown) => {
        if (mia !== ultima.current) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar");
      })
      .finally(() => { if (mia === ultima.current) setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const hoy = limaDateKey();
  const filas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return data.items.filter((f) => {
      if (filtro !== "todo" && f.tipo !== filtro) return false;
      if (!texto) return true;
      return `${f.quien} ${f.nota ?? ""}`.toLowerCase().includes(texto);
    });
  }, [data.items, filtro, q]);

  /* Las cifras SIEMPRE salen del backend: el chip activo manda cuál se muestra,
     nunca se re-suma en el navegador. */
  const cifra = filtro === "todo"
    ? { total: data.totalGeneral, count: data.items.length, rotulo: "Te deben" }
    : { total: data[TIPOS[filtro].bucket].total, count: data[TIPOS[filtro].bucket].count, rotulo: `Te deben en ${TIPOS[filtro].plural.toLowerCase()}` };

  /** Sección hermana → salto instantáneo; otro módulo (o sin padre) → recarga. */
  const irASeccion = (destino: string, externo = false) => {
    if (onIr && !externo) onIr(destino);
    else goTab(destino);
  };
  const irA = (tipo: Tipo) => irASeccion(TIPOS[tipo].destino, TIPOS[tipo].externo);

  return (
    <div className="space-y-4">
      <AdminModuleHeader title="Por cobrar" description="Todo lo que te deben, en una sola lista" icon={Wallet}>
        <button
          onClick={load}
          className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition-colors"
          title="Actualizar"
          aria-label="Actualizar la lista"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      {error && (
        <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-500)]">
          No se pudo cargar lo que te deben ({error}). Toca actualizar para reintentar.
        </p>
      )}

      {loading && data.items.length === 0 && !error && (
        <p className="text-sm text-[var(--text-tertiary)]">Cargando lo que te deben…</p>
      )}
      {!loading && !error && data.items.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          <Wallet className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden="true" />
          Nadie te debe nada ahora mismo: ni fiados, ni préstamos, ni adelantos, ni madera despachada a cuenta.
        </p>
      )}

      {data.items.length > 0 && (
        <>
          {/* Cifras en UNA línea, no cinco tarjetas */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <SectionTitle as="h3">{cifra.rotulo}</SectionTitle>
            <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(cifra.total)}</span>
            <span className="text-sm text-[var(--text-tertiary)]">
              en {cifra.count} cuenta{cifra.count === 1 ? "" : "s"}
            </span>
          </div>

          {/* Chips por tipo: filtran y muestran su cifra */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFiltro("todo")}
              aria-pressed={filtro === "todo"}
              className={cn(CHIP, filtro === "todo" ? CHIP_ON : CHIP_OFF)}
            >
              Todo · {formatCurrency(data.totalGeneral, { decimals: 0 })}
            </button>
            {ORDEN.map((tipo) => {
              const t = TIPOS[tipo];
              const b = data[t.bucket];
              const Icon = t.icon;
              const activo = filtro === tipo;
              return (
                <button
                  key={tipo}
                  onClick={() => setFiltro(activo ? "todo" : tipo)}
                  aria-pressed={activo}
                  disabled={b.count === 0}
                  className={cn(CHIP, activo ? CHIP_ON : CHIP_OFF, b.count === 0 && "cursor-not-allowed opacity-45")}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t.plural} · {formatCurrency(b.total, { decimals: 0 })}
                  <span className="text-[length:var(--ts-xs)] font-black tabular-nums text-[var(--text-tertiary)]">{b.count}</span>
                </button>
              );
            })}
          </div>

          {/* Buscador pegado a la tabla que filtra */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca por nombre o detalle"
              aria-label="Busca por nombre o detalle"
              className="h-11 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
          </div>

          {/* `sm:pr-14`: el botón flotante «Abrir acciones rápidas» es fixed en
              x 1200-1256 y se comía 45 de los 82 px del «Cobrar» de la fila que
              quedara a esa altura (medido con `elementFromPoint`). En una lista
              cuyo único gesto es cobrar, ese corredor tiene que quedar libre. */}
          <DataTable zebra wrapperClassName="sm:pr-14">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Quién te debe</th>
                <th className="text-right">Monto</th>
                <th>Desde</th>
                <th>Vence</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const t = TIPOS[f.tipo];
                const Icon = t.icon;
                const atraso = f.vence ? diasEntre(f.vence, hoy) : 0;
                return (
                  <tr key={`${f.tipo}-${f.id}`}>
                    <td>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[length:var(--ts-xs)] font-bold", t.chip)}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />{t.label}
                      </span>
                    </td>
                    <td>
                      <span className="font-bold text-[var(--text-primary)]">{f.quien}</span>
                      {f.nota && <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{f.nota}</span>}
                    </td>
                    <td className="text-right font-extrabold tabular-nums">{formatCurrency(f.monto)}</td>
                    <td className="whitespace-nowrap text-[var(--text-secondary)]">{fechaCorta(f.desde)}</td>
                    <td className="whitespace-nowrap">
                      {f.vence === null
                        ? <span className="text-[var(--text-tertiary)]">Sin plazo</span>
                        : atraso > 0
                          ? <BadgeStatus variant="error" size="sm" label={`Vencido hace ${atraso} d`} />
                          : <span className="text-[var(--text-secondary)]">{fechaCorta(f.vence)}</span>}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {f.tipo === "fiado" && (
                        <button
                          onClick={() => irASeccion("scoring")}
                          title={`Ver el scoring de ${f.quien}`}
                          aria-label={`Ver el scoring crediticio de ${f.quien}`}
                          className={cn(BOTON_FILA, "mr-1 w-11 sm:w-9")}
                        >
                          <Gauge className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => irA(f.tipo)}
                        aria-label={`Abrir ${t.plural.toLowerCase()} para cobrar a ${f.quien}`}
                        className={cn(BOTON_FILA, "px-3 text-[length:var(--ts-xs)] font-bold")}
                      >
                        Cobrar <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm font-bold text-[var(--text-tertiary)]">
                    Ninguna cuenta con ese filtro. Toca «Todo» para verlas todas.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>

          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Mostrando {filas.length} de {data.items.length} cuentas. «Cobrar» te deja en el módulo
            que corresponde; la madera se cobra desde la cuenta corriente del Libro CTP. El scoring
            sale del historial completo del cliente, no de la deuda de esta fila: por eso es un
            botón por fila y no una columna.
          </p>
        </>
      )}
    </div>
  );
}
