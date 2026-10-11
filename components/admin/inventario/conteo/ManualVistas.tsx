import { BlockTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, History, Play, RefreshCw, Save, Search } from "@buleje/design-system/icons";
import { useState, type ReactNode } from "react";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { colorDiferencia, diferenciaDe, MOTIVOS } from "./manual-tipos";
import type { ConteoManual } from "./use-conteo-manual";

const Aviso = ({ children, tono }: { children: ReactNode; tono: "ok" | "error" | "aviso" }) => (
  <div
    role={tono === "error" ? "alert" : "status"}
    className={cn(
      "flex items-center gap-2 rounded-lg border p-3 text-sm",
      tono === "ok" && "border-[var(--data-success-500)]/30 bg-primary/10 text-[var(--data-success-ink)]",
      tono === "error" && "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-ink)]",
      tono === "aviso" && "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-ink)]",
    )}
  >
    {children}
  </div>
);

/** Para empezar: el conteo de hoy o los anteriores. */
export function ManualInicio({ m }: { m: ConteoManual }) {
  const pendiente = m.sessions[0]?.status === "pendiente" ? m.sessions[0] : null;
  return (
    <div className="space-y-4">
      {m.error && <Aviso tono="error">{m.error}</Aviso>}
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={m.handleStart} disabled={m.loading} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-5 text-left transition-colors hover:bg-primary/10 disabled:opacity-60">
          {m.loading ? <RefreshCw className="h-8 w-8 shrink-0 animate-spin text-primary" aria-hidden /> : <Play className="h-8 w-8 shrink-0 text-primary" aria-hidden />}
          <span>
            <span className="block font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">Empezar el conteo de hoy</span>
            <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">Carga todos tus productos con su stock actual</span>
          </span>
        </button>
        <button type="button" onClick={() => m.setView("history")} className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--rule-base)] p-5 text-left transition-colors hover:bg-[var(--surface-sunken)]">
          <History className="h-8 w-8 shrink-0 text-[var(--text-secondary)]" aria-hidden />
          <span>
            <span className="block font-bold text-[var(--text-primary)]">Ver conteos anteriores</span>
            <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">
              {m.sessions.length} guardado{m.sessions.length !== 1 ? "s" : ""}
            </span>
          </span>
        </button>
      </div>
      {pendiente && (
        <Aviso tono="aviso">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Tienes un conteo sin cerrar del {pendiente.date}. Si empiezas uno nuevo hoy, retomas ese.
        </Aviso>
      )}
    </div>
  );
}

/** Contando: una fila por producto, con la casilla grande para escribir lo que hay. */
export function ManualContando({ m }: { m: ConteoManual }) {
  const s = m.session;
  if (!s) return null;
  const contados = s.rows.filter((r) => r.realStock !== "").length;
  const total = s.rows.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BlockTitle>Conteo del {s.date}</BlockTitle>
          <p className="text-sm text-[var(--text-secondary)]">{contados} de {total} productos contados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => m.setView("reconcile")} className={button({ variant: "secondary", className: "rounded-xl" })}>
            <AlertTriangle className="h-4 w-4" aria-hidden /> Ver diferencias
          </button>
          <button type="button" onClick={m.handleSave} disabled={m.saving} className={button({ variant: "primary", className: "rounded-xl" })}>
            <Save className="h-4 w-4" aria-hidden /> {m.saving ? "Guardando…" : "Guardar conteo"}
          </button>
        </div>
      </div>

      {m.success && <Aviso tono="ok"><CheckCircle className="h-4 w-4 shrink-0" aria-hidden />{m.success}</Aviso>}

      <div className="h-2 w-full rounded-full bg-[var(--rule-soft)]" role="progressbar" aria-valuenow={contados} aria-valuemin={0} aria-valuemax={total} aria-label="Avance del conteo">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${total ? (contados / total) * 100 : 0}%` }} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden />
        <input
          type="search"
          placeholder="Buscar producto o código…"
          aria-label="Buscar producto o código"
          value={m.search}
          onChange={(e) => m.setSearch(e.target.value)}
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {m.filteredRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">No hay productos con ese nombre o código.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {m.filteredRows.map((row) => {
            const d = diferenciaDe(row);
            const hayDif = row.realStock !== "" && d !== 0;
            return (
              <li key={row.productId} className={cn("flex items-center gap-3 px-3 py-2", hayDif && "bg-[var(--data-error-50)]/40")}>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium leading-tight text-[var(--text-primary)]">
                    {/* A medio conteo lo tipeado no está guardado: la ficha va en otra pestaña. */}
                    <EnlacePanel cosa="producto" id={String(row.productId)} target="_blank" rel="noopener" apariencia="heredada">{row.productName}</EnlacePanel>
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {row.sku ? `${row.sku} · ` : ""}Sistema: <span className="font-mono">{row.systemStock}</span>
                    {row.realStock !== "" && (
                      <span className={cn("ml-2 font-mono font-bold", d === 0 ? "text-[var(--data-success-ink)]" : colorDiferencia(d))}>{d > 0 ? `+${d}` : d}</span>
                    )}
                  </p>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={row.realStock}
                  onChange={(e) => m.updateRow(row.productId, "realStock", e.target.value)}
                  placeholder="—"
                  aria-label={`Contado de ${row.productName}`}
                  className="h-12 w-24 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-xl font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Diferencias y motivo de cada una, antes de ajustar el stock. */
export function ManualReconciliar({ m }: { m: ConteoManual }) {
  const s = m.session;
  if (!s) return null;
  const n = m.withDiff.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BlockTitle>Diferencias del {s.date}</BlockTitle>
          <p className="text-sm text-[var(--text-secondary)]">{n} diferencia{n !== 1 ? "s" : ""} encontrada{n !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => m.setView("counting")} className={button({ variant: "secondary", className: "rounded-xl" })}>Volver al conteo</button>
          <button type="button" onClick={m.handleApply} disabled={m.applying || !n || s.status === "aplicado"} className={button({ variant: "primary", className: "rounded-xl" })}>
            <CheckCircle className="h-4 w-4" aria-hidden />
            {m.applying ? "Aplicando…" : s.status === "aplicado" ? "Ya aplicado" : "Aplicar ajustes"}
          </button>
        </div>
      </div>

      {m.error && <Aviso tono="error">{m.error}</Aviso>}
      {m.success && <Aviso tono="ok"><CheckCircle className="h-4 w-4 shrink-0" aria-hidden />{m.success}</Aviso>}

      {n === 0 ? (
        <div className="rounded-xl border border-[var(--data-success-500)]/30 bg-primary/10 p-6 text-center">
          <CheckCircle className="mx-auto mb-2 h-10 w-10 text-[var(--data-success-ink)]" aria-hidden />
          <p className="font-semibold text-[var(--data-success-ink)]">Sin diferencias</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Lo que contaste coincide con el sistema en todos los productos.</p>
        </div>
      ) : (
        <DataTable className="min-w-[560px]">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Sistema</th>
              <th className="text-right">Contado</th>
              <th className="text-right">Diferencia</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {m.withDiff.map((row) => {
              const d = diferenciaDe(row);
              return (
                <tr key={row.productId}>
                  <td>
                    <p className="font-medium text-[var(--text-primary)]">
                      <EnlacePanel cosa="producto" id={String(row.productId)} target="_blank" rel="noopener" apariencia="heredada">{row.productName}</EnlacePanel>
                    </p>
                    {row.sku && <p className="text-sm text-[var(--text-secondary)]">{row.sku}</p>}
                  </td>
                  <td className="text-right font-mono text-[var(--text-secondary)]">{row.systemStock}</td>
                  <td className="text-right font-mono text-[var(--text-primary)]">{row.realStock}</td>
                  <td className={cn("text-right font-mono font-bold", colorDiferencia(d))}>{d > 0 ? `+${d}` : d}</td>
                  <td>
                    <select
                      value={row.reason}
                      onChange={(e) => m.updateRow(row.productId, "reason", e.target.value)}
                      disabled={s.status === "aplicado"}
                      aria-label={`Motivo de la diferencia en ${row.productName}`}
                      className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {MOTIVOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

/** Los conteos anteriores de este navegador, con lo que se encontró en cada uno. */
export function ManualHistorial({ m }: { m: ConteoManual }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BlockTitle>Conteos anteriores</BlockTitle>
        <button type="button" onClick={() => m.setView("start")} className={button({ variant: "secondary", className: "rounded-xl" })}>Volver</button>
      </div>
      {m.success && <Aviso tono="ok"><CheckCircle className="h-4 w-4 shrink-0" aria-hidden />{m.success}</Aviso>}

      {m.sessions.length === 0 ? (
        <p className="rounded-xl border border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">Aún no guardaste ningún conteo.</p>
      ) : (
        <div className="space-y-2">
          {m.sessions.map((s) => {
            const abierta = abierto === s.id;
            return (
              <div key={s.id} className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
                <button type="button" aria-expanded={abierta} onClick={() => setAbierto(abierta ? null : s.id)} className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold", s.status === "aplicado" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]")}>
                      {s.status === "aplicado" ? "Aplicado" : "Sin cerrar"}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">{s.date}</span>
                    <span className="hidden text-sm text-[var(--text-secondary)] sm:block">
                      {s.totalCounted} productos · {s.differences} diferencia{s.differences !== 1 ? "s" : ""}
                    </span>
                  </span>
                  {abierta ? <ChevronUp className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />}
                </button>
                {abierta && (
                  <div className="space-y-3 border-t border-[var(--rule-soft)] px-4 py-3">
                    <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
                      <span>Contados: <strong className="text-[var(--text-primary)]">{s.totalCounted}</strong></span>
                      <span>Diferencias: <strong className={s.differences > 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]"}>{s.differences}</strong></span>
                    </div>
                    {s.status === "pendiente" && (
                      <button type="button" onClick={() => m.retomar(s)} className={button({ variant: "secondary", className: "rounded-xl" })}>Retomar este conteo</button>
                    )}
                    {s.differences > 0 && (
                      <DataTable className="min-w-[400px]">
                        <thead>
                          <tr><th>Producto</th><th className="text-right">Sistema</th><th className="text-right">Contado</th><th className="text-right">Dif.</th></tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--rule-soft)]">
                          {s.rows.filter((r) => r.realStock !== "" && r.realStock !== r.systemStock).map((r) => {
                            const d = diferenciaDe(r);
                            return (
                              <tr key={r.productId}>
                                <td className="text-[var(--text-primary)]"><EnlacePanel cosa="producto" id={String(r.productId)} apariencia="heredada">{r.productName}</EnlacePanel></td>
                                <td className="text-right font-mono text-[var(--text-secondary)]">{r.systemStock}</td>
                                <td className="text-right font-mono">{r.realStock}</td>
                                <td className={cn("text-right font-mono font-bold", colorDiferencia(d))}>{d > 0 ? `+${d}` : d}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </DataTable>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
