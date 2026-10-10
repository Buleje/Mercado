"use client";

/**
 * Medidor de IA del mes (Comandos IA, 2026-10-09). Lee `/api/admin/ai-costs`,
 * que desde hoy usa el MISMO plan y tope que `canSpend` (lib/ai/cost-control.ts):
 * lo que se ve acá es el tope que de verdad frena a la IA.
 *
 * - `compacto`: franja de una línea arriba de Comandos IA.
 * - grande: tarjeta de «Lo que hizo la IA». Mientras hay una grande montada, la
 *   franja se calla (dos medidores en la misma pantalla = repetido).
 * Sólo admin/dueño: el resto (o un 403) no ve nada.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Sparkles } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cachedJson } from "@/lib/client-cache-fetch";
import { formatNumber } from "@/lib/format";
import { useMiRol } from "@/hooks/use-mi-rol";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { usd } from "./historial/use-recibos";

interface AiCosts {
  spentUsd: number;
  capUsd: number;
  percentUsed: number;
  remainingUsd: number;
  plan: string;
  planEnTabla?: boolean;
}

/**
 * Lo que cuesta, como MÁXIMO, leer un papel con IA, para traducir dólares a «papeles».
 * Sale de papel/entender/route.ts: (6.000 caracteres ÷ 3 + 900 de respuesta) = 2.900
 * tokens × US$0,000001 = US$0,0029. Redondeado hacia arriba: el «~N papeles» no promete de más.
 */
const USD_POR_PAPEL = 0.003;

// ── ¿Hay un medidor grande en pantalla? ─────────────────────────────────────
let grandes = 0;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};
const hayGrande = () => grandes > 0;

/** `undefined` = todavía leyendo (la tarjeta grande guarda su lugar); `null` = nada que mostrar. */
function useMedidor(): AiCosts | null | undefined {
  const rol = useMiRol();
  const puede = rol === "admin" || rol === "owner";
  const [datos, setDatos] = useState<AiCosts | null | undefined>(undefined);
  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    void cachedJson<AiCosts>("/api/admin/ai-costs", 60_000).then((d) => {
      if (vivo) setDatos(d && typeof d.capUsd === "number" ? d : null);
    });
    return () => {
      vivo = false;
    };
  }, [puede]);
  return puede ? datos : null;
}

function nivel(pct: number): "ok" | "ambar" | "rojo" {
  if (pct >= 90) return "rojo";
  if (pct >= 75) return "ambar";
  return "ok";
}

const BARRA: Record<ReturnType<typeof nivel>, string> = {
  ok: "bg-[var(--accent)]",
  ambar: "bg-[var(--data-warning-500)]",
  rojo: "bg-[var(--data-error-500)]",
};

function Info({ d }: { d: AiCosts }) {
  return (
    <InfoTip
      title="IA este mes"
      what="Suma de lo que gastó la IA de tu negocio desde el día 1: leer papeles, redactar mensajes, entender órdenes. Se reinicia cada mes."
      affects={`Tu plan (${d.plan}) tiene un tope de ${usd(d.capUsd)} al mes${
        d.planEnTabla === false ? ": tu plan usa el tope de free" : ""
      }. Al llegar, la IA se pausa y los mensajes salen con la plantilla de siempre.`}
      example={`Leer un papel ≈ ${usd(USD_POR_PAPEL)} · redactar 10 mensajes ≈ $0.001.`}
      side="bottom"
      className="shrink-0"
    />
  );
}

function Barra({ pct, alto }: { pct: number; alto: string }) {
  const n = nivel(pct);
  return (
    <div
      className={`overflow-hidden rounded-full bg-[var(--surface-sunken)] ${alto}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="IA usada este mes"
    >
      <div
        className={`h-full rounded-full ${BARRA[n]}`}
        style={{ width: `${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct))}%` }}
      />
    </div>
  );
}

function AvisoPoco({ agotado }: { agotado: boolean }) {
  return (
    <p className="flex items-start gap-1.5 text-xs font-medium text-[var(--data-error)]">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      {agotado
        ? "Se acabó el tope de este mes: los mensajes salen con la plantilla de siempre."
        : "Te queda poco: los mensajes saldrán con la plantilla de siempre."}
    </p>
  );
}

/** Mismo alto que la tarjeta grande: la lista de abajo no salta cuando llega el dato. */
function TarjetaCargando() {
  return (
    <section
      aria-busy
      aria-label="Leyendo lo que gastó la IA"
      className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <div className="h-5 w-32 animate-pulse rounded bg-[var(--surface-sunken)]" />
      <div className="h-8 w-40 animate-pulse rounded bg-[var(--surface-sunken)]" />
      <div className="h-2 w-full animate-pulse rounded-full bg-[var(--surface-sunken)]" />
      <div className="h-6 w-64 max-w-full animate-pulse rounded-full bg-[var(--surface-sunken)]" />
    </section>
  );
}

export default function ConsumoIA({ compacto }: { compacto?: boolean }) {
  const d = useMedidor();
  const grandeEnPantalla = useSyncExternalStore(suscribir, hayGrande, () => false);

  useEffect(() => {
    if (compacto) return;
    grandes += 1;
    avisar();
    return () => {
      grandes -= 1;
      avisar();
    };
  }, [compacto]);

  if (compacto && grandeEnPantalla) return null;
  if (d === undefined) return compacto ? null : <TarjetaCargando />;
  if (!d) return null;
  const pct = d.percentUsed;
  const papeles = Math.floor(d.remainingUsd / USD_POR_PAPEL);
  const rojo = nivel(pct) === "rojo";
  const agotado = pct >= 100 || d.remainingUsd <= 0;

  if (compacto) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="font-semibold text-[var(--text-primary)]">
              IA este mes: {usd(d.spentUsd)} de {usd(d.capUsd)}
            </span>
            {/* En celular va en su propia línea, sin el «·» colgando al inicio. */}
            <span className="block whitespace-nowrap sm:inline">
              <span className="hidden sm:inline"> · </span>~{formatNumber(papeles, 0)}{" "}
              papeles más
            </span>
          </span>
          <Barra pct={pct} alto="h-1.5 w-12 shrink-0 sm:w-28" />
          <Info d={d} />
        </div>
        {rojo && <AvisoPoco agotado={agotado} />}
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <CardTitle>IA este mes</CardTitle>
        <Info d={d} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
          {usd(d.spentUsd)}
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          de {usd(d.capUsd)} · {Math.round(pct)} %
        </span>
      </div>
      <Barra pct={pct} alto="h-2 w-full" />
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[var(--text-secondary)]">
          Queda {usd(d.remainingUsd)}
        </span>
        <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[var(--text-secondary)]">
          ~{formatNumber(papeles, 0)} papeles más
        </span>
        <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[var(--text-secondary)]">
          Plan {d.plan}
          {d.planEnTabla === false && " · usa el tope de free"}
        </span>
      </div>
      {rojo && <AvisoPoco agotado={agotado} />}
    </section>
  );
}
