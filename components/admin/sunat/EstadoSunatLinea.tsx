"use client";

/**
 * EstadoSunatLinea — el estado de SUNAT en UNA línea, arriba de Facturas y
 * boletas (plan «panel unificado», ola 3, fusión F15).
 *
 * La tarjeta «Modo SUNAT Oficial» estaba montada dos veces (acá y en
 * Configuración › Cobros y comprobantes). Se queda en Configuración, que es
 * donde se arregla; acá queda lo que hace falta para emitir: si los
 * comprobantes salen oficiales o no, qué falta (en la ⓘ) y el enlace a donde se
 * configura. Quien emite pero no ve Configuración (un cajero) lee el estado y
 * sabe a quién pedírselo.
 */

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, ShieldCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { origenesDeVista } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { logger } from "@/lib/logger";
import { SUNAT_BLOCKER_LABEL, type SunatModoOficialState } from "@/lib/sunat/modo-oficial.types";

const DESTINO_CONEXION = { tab: "config", params: { vista: "cobros" } } as const;

/** El origen con que el panel ofrece Configuración › Cobros (el registrado; si no hay, la pestaña). */
function origenDeCobros(): readonly Tab[] {
  const vista = vistasDelModulo(DESTINO_CONEXION.tab).find((v) => v.key === DESTINO_CONEXION.params.vista);
  return origenesDeVista(DESTINO_CONEXION.tab, vista ?? {}) as readonly Tab[];
}

type Carga =
  | { fase: "cargando" }
  | { fase: "error" }
  | { fase: "lista"; estado: SunatModoOficialState };

function useEstadoSunat(): Carga {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/sunat/modo-oficial", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; state?: SunatModoOficialState } | null) => {
        setCarga(j?.ok && j.state ? { fase: "lista", estado: j.state } : { fase: "error" });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        logger.warn("[comprobantes] estado SUNAT no se pudo leer", { error: String(err) });
        setCarga({ fase: "error" });
      });
    return () => ac.abort();
  }, []);
  return carga;
}

/** Qué decir del estado: la frase de la línea, el tono y el detalle de la ⓘ. */
function lecturaDe(estado: SunatModoOficialState): { frase: string; ok: boolean; detalle: string } {
  const ambiente = estado.ambiente === "produccion" ? "producción" : "pruebas";
  if (estado.enabled) {
    return {
      ok: true,
      frase: `oficial (${ambiente}).`,
      detalle: "Cada comprobante que emites acá viaja a SUNAT y vuelve con su constancia.",
    };
  }
  const faltan = estado.bloqueos.map((b) => SUNAT_BLOCKER_LABEL[b]);
  return {
    ok: false,
    frase:
      faltan.length > 0
        ? `aún no es oficial: falta${faltan.length === 1 ? "" : "n"} ${faltan.length} requisito${faltan.length === 1 ? "" : "s"}.`
        : "todo listo: falta que soporte active el modo oficial.",
    detalle:
      faltan.length > 0
        ? `${faltan.join(" ")} Mientras tanto, lo que emites queda como comprobante interno.`
        : "Escríbele a soporte de Buleje y lo activa. Mientras tanto, lo que emites queda como comprobante interno.",
  };
}

export default function EstadoSunatLinea() {
  const carga = useEstadoSunat();

  if (carga.fase === "cargando") {
    return (
      <div
        aria-hidden
        className="h-10 animate-pulse rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
      />
    );
  }

  const lectura = carga.fase === "lista" ? lecturaDe(carga.estado) : null;
  const Icono = lectura === null ? ShieldCheck : lectura.ok ? CheckCircle : AlertCircle;
  const tono =
    lectura === null
      ? "text-[var(--text-tertiary)]"
      : lectura.ok
        ? "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]"
        : "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";

  return (
    <div
      role="status"
      className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-0 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-1"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icono className={`h-4 w-4 shrink-0 ${tono}`} aria-hidden />
        <span className="text-sm text-[var(--text-primary)]">
          <span className="font-bold">SUNAT:</span>{" "}
          {lectura?.frase ?? "no se pudo leer el estado de la conexión."}
        </span>
        {lectura && <InfoTip title="Estado de SUNAT" what={lectura.detalle} side="bottom" />}
      </span>
      <span className="ml-auto text-sm">
        <PermisoDe
          origen={origenDeCobros()}
          sinPermiso={<span className="text-[var(--text-secondary)]">Lo configura el dueño en Configuración.</span>}
        >
          <EnlacePanel href={hrefDeDestino(DESTINO_CONEXION)}>Conexión →</EnlacePanel>
        </PermisoDe>
      </span>
    </div>
  );
}
