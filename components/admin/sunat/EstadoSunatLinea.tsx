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

import { AlertCircle, CheckCircle, ShieldCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { origenesDeVista } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { SunatModoOficialState } from "@/lib/sunat/modo-oficial.types";
import { requisitosDeEmision } from "./requisitos-emision";
import type { CargaEstadoSunat } from "./use-estado-sunat";

export const DESTINO_CONEXION = { tab: "config", params: { vista: "cobros" } } as const;

/** El origen con que el panel ofrece Configuración › Cobros (el registrado; si no hay, la pestaña). */
export function origenDeCobros(): readonly Tab[] {
  const vista = vistasDelModulo(DESTINO_CONEXION.tab).find((v) => v.key === DESTINO_CONEXION.params.vista);
  return origenesDeVista(DESTINO_CONEXION.tab, vista ?? {}) as readonly Tab[];
}

/**
 * Qué decir del estado: la frase de la línea, el tono y el detalle de la ⓘ.
 * Con el modo apagado `generate-invoice` rechaza y no crea nada: antes decía
 * «lo que emites queda como comprobante interno», y no era cierto (17-10).
 */
function lecturaDe(estado: SunatModoOficialState): { frase: string; ok: boolean; detalle: string } {
  if (estado.enabled) {
    return estado.ambiente === "produccion"
      ? { ok: true, frase: "oficial: lo que emites viaja a SUNAT.", detalle: "Cada comprobante vuelve con su constancia de SUNAT." }
      : {
          ok: false,
          frase: "en prueba: lo que emites no vale ante SUNAT.",
          detalle: "Va al facturador de prueba. Para que valga, pasa a producción en Configuración › Cobros y comprobantes.",
        };
  }
  const requisitos = requisitosDeEmision(estado);
  const faltan = requisitos.filter((r) => !r.ok);
  return {
    ok: false,
    frase: `no se emiten comprobantes electrónicos: falta${faltan.length === 1 ? "" : "n"} ${faltan.length} de ${requisitos.length} requisitos.`,
    detalle: `${faltan.map((r) => `${r.etiqueta}: ${r.queHacer}`).join(" ")} Mientras tanto no se crea ningún comprobante: tus ventas siguen con su ticket interno.`,
  };
}

export default function EstadoSunatLinea({ carga }: { carga: CargaEstadoSunat }) {

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
