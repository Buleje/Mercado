"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { BellRing, ChevronDown, Loader2, MoreHorizontal, Plus, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ORDEN_SEVERIDAD, type Severidad } from "@/lib/churn/playbook-catalog";
import { ReglaFila } from "./ReglaFila";
import { ReglaForm, type ValoresRegla } from "./ReglaForm";
import { alertasQueLeTocan, useReglasRetencion, type GrupoAbierto, type Regla } from "./use-reglas-retencion";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const LIMA_MS = 5 * 60 * 60 * 1000;

function fechaCorta(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(new Date(iso).getTime() - LIMA_MS);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Alertas abiertas que ninguna regla ACTIVA atendería (nadie va a actuar sobre ellas). */
function sinRegla(grupos: GrupoAbierto[], reglas: Regla[]): number {
  const activas = reglas.filter((r) => r.isActive);
  return grupos
    .filter(
      (g) =>
        !activas.some(
          (r) =>
            r.triggerSignal === g.signalType &&
            (ORDEN_SEVERIDAD[g.severity as Severidad] ?? 0) >= (ORDEN_SEVERIDAD[r.triggerSeverity as Severidad] ?? 0),
        ),
    )
    .reduce((s, g) => s + g.total, 0);
}

const NUEVA: ValoresRegla = {
  triggerSignal: "trial_expiring",
  triggerSeverity: "high",
  action: "email",
  templateId: null,
  discountPercent: null,
  discountDays: null,
};

export function ReglasRetencion() {
  const { datos, cargando, error, guardando, cargar, guardar, crear } = useReglasRetencion();
  const [kpisAbiertos, setKpisAbiertos] = useLocalStorage("superadmin:retencion:reglas:kpis-abiertos", true);
  const [creando, setCreando] = useState(false);
  const [errorNueva, setErrorNueva] = useState<string | null>(null);

  const reglas = useMemo(() => datos?.playbooks ?? [], [datos]);
  const grupos = useMemo(() => datos?.abiertas.grupos ?? [], [datos]);
  const cifras = useMemo(() => {
    const abiertas = grupos.reduce((s, g) => s + g.total, 0);
    const criticas = grupos.filter((g) => g.severity === "critical").reduce((s, g) => s + g.total, 0);
    return {
      abiertas,
      criticas,
      sinRegla: sinRegla(grupos, reglas),
      activas: reglas.filter((r) => r.isActive).length,
      ultima: fechaCorta(datos?.abiertas.ultimaSenalAt ?? null),
    };
  }, [grupos, reglas, datos]);

  const crearRegla = async (v: ValoresRegla) => {
    const name = `${v.triggerSignal}_${v.action}_${v.triggerSeverity}`;
    const err = await crear({ ...v, name, isActive: true });
    setErrorNueva(err);
    if (!err) setCreando(false);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <SectionTitle>Reglas de retención</SectionTitle>
        <InfoTip
          title="Reglas de retención"
          what="Qué hace Buleje cuando un negocio da señales de irse: dejó de entrar, cayeron sus pedidos o su prueba gratis vence."
          affects="El cron de cada madrugada guarda la alerta y, si la regla está activa, manda el correo o WhatsApp una sola vez por alerta."
          example="«Su prueba gratis vence · desde riesgo Alto» → correo «Tu prueba termina pronto» al dueño."
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCreando(true);
              setErrorNueva(null);
            }}
            aria-label="Nueva regla"
            title="Nueva regla"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-sm font-bold text-white sm:px-3"
          >
            <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Nueva regla</span>
          </button>
          <ActionMenu
            label="Más acciones"
            icon={MoreHorizontal}
            soloIcono
            actions={[{ id: "recargar", label: "Recargar", icon: RefreshCw, onSelect: () => void cargar() }]}
          />
        </div>
      </header>

      {datos && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
          <BellRing className={`mt-0.5 h-4 w-4 shrink-0 ${datos.autorun ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]"}`} aria-hidden />
          <span className="min-w-0 flex-1 font-bold text-[var(--text-primary)]">
            {datos.autorun ? "Envía los mensajes de verdad" : "Modo prueba: guarda las alertas, no envía mensajes"}{" "}
            <InfoTip
            title="Modo de envío"
            what="Lo decide la variable CHURN_AUTORUN de Vercel. Las alertas se guardan siempre; esto sólo prende el correo, WhatsApp, descuento o llamada."
            affects="Para que envíe: CHURN_AUTORUN=true en Vercel (Production) y redeploy."
              example="Con el modo prueba ves a quién le tocaría el mensaje sin que nadie lo reciba."
            />
          </span>
          <Link href="/superadmin/alerts" className="shrink-0 text-xs font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver alertas
          </Link>
        </div>
      )}

      {datos && (
        <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <button
            type="button"
            aria-expanded={kpisAbiertos}
            onClick={() => setKpisAbiertos(!kpisAbiertos)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)]"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${kpisAbiertos ? "" : "-rotate-90"}`} aria-hidden />
            <span className="tabular-nums">
              {cifras.abiertas} abiertas · {cifras.criticas} críticas · {cifras.sinRegla} sin regla · {cifras.activas} de {reglas.length} reglas activas · última {cifras.ultima}
            </span>
          </button>
          {kpisAbiertos && (
            <div className="grid grid-cols-2 gap-2 px-3 pb-3 lg:grid-cols-4">
              <SAKpiCard label="Alertas abiertas" value={cifras.abiertas} sub={`${cifras.criticas} críticas`} tone={cifras.criticas > 0 ? "bad" : "default"} />
              <SAKpiCard label="Sin regla que actúe" value={cifras.sinRegla} sub="nadie las atiende" tone={cifras.sinRegla > 0 ? "warn" : "good"} />
              <SAKpiCard label="Reglas activas" value={`${cifras.activas} de ${reglas.length}`} />
              <SAKpiCard label="Última alerta" value={cifras.ultima} sub="la guarda el cron diario" />
            </div>
          )}
        </section>
      )}

      {creando && (
        <section className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <CardTitle>Nueva regla</CardTitle>
          <ReglaForm
            inicial={NUEVA}
            conSenal
            guardando={guardando === "nueva"}
            error={errorNueva}
            onGuardar={(v) => void crearRegla(v)}
            onCancelar={() => setCreando(false)}
          />
        </section>
      )}

      {cargando && !datos ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando reglas…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm font-bold text-[var(--data-error-600,var(--data-error-500))]">{error}</p>
      ) : reglas.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no hay reglas: crea la primera.</p>
      ) : (
        <ul className="space-y-2" aria-label="Reglas de retención">
          {reglas.map((r) => (
            <ReglaFila
              key={r.id}
              regla={r}
              leTocan={alertasQueLeTocan(r, grupos, reglas)}
              guardando={guardando === r.id}
              onGuardar={(cambios) => guardar(r.id, cambios)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
