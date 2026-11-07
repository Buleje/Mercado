"use client";

/**
 * Lo que dice el Registro Nacional de Infractores de SERFOR del permiso o de su
 * titular. Sale con el mismo botón que OSINFOR, debajo de su respuesta. Solo
 * consulta al tocar (lista pública); no guarda nada.
 */

import { ExternalLink } from "@buleje/design-system/icons";
import { logger } from "@/lib/logger";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  ENLACE_REGISTRO_INFRACTORES,
  type MotivoCoincidencia,
  type ResumenInfractores,
} from "@/lib/forestal/serfor-infractores";
import { fmtFechaCorta } from "./contratos-ui";

/** Lo que se sabe del titular para buscarlo (además del código del permiso). */
export interface TitularConsultable {
  documento?: string | null;
  nombre?: string | null;
}

const CLASE: Record<ResumenInfractores["certeza"], string> = {
  segura:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  del_permiso:
    "border-[var(--data-warning-500)]/30 bg-[var(--surface-sunken)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  por_nombre: "border-[var(--data-warning-500)]/30 bg-[var(--surface-sunken)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  sin_datos: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  ninguna:
    "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
};

const MOTIVO_TEXTO: Record<MotivoCoincidencia, string> = {
  documento: "por su RUC/DNI",
  permiso: "por el permiso",
  permiso_otro: "por el permiso, a otra persona",
  nombre: "solo por el nombre",
};

const MAX_FILAS_VISTAS = 3;

export async function pedirInfractores(codigo: string, titular?: TitularConsultable): Promise<ResumenInfractores> {
  const q = new URLSearchParams();
  if (codigo.trim()) q.set("codigo", codigo.trim());
  if (titular?.documento?.trim()) q.set("doc", titular.documento.trim());
  if (titular?.nombre?.trim()) q.set("nombre", titular.nombre.trim());
  let r: Response;
  try {
    r = await fetch(`/api/admin/forestal/serfor-infractores?${q.toString()}`, { credentials: "include" });
  } catch (err) {
    logger.warn("[serfor-infractores] sin conexión", { error: String(err) });
    throw new Error("Sin conexión con SERFOR: revisa el internet y vuelve a tocar.");
  }
  const cuerpo = (await r.json().catch((err: unknown) => {
    logger.warn("[serfor-infractores] respuesta sin JSON", { status: r.status, error: String(err) });
    return null;
  })) as { data?: ResumenInfractores; error?: string } | null;
  if (!r.ok || !cuerpo?.data) throw new Error(cuerpo?.error ?? `SERFOR no respondió (error ${r.status}).`);
  return cuerpo.data;
}

export function SerforInfractoresResultado({ resumen }: { resumen: ResumenInfractores }) {
  const vistas = resumen.coincidencias.slice(0, MAX_FILAS_VISTAS);
  const ocultas = resumen.total - vistas.length;
  return (
    <div className={`rounded-xl border px-3 py-2 ${CLASE[resumen.certeza]}`} role="status" data-serfor={resumen.certeza}>
      <p className="flex items-center gap-1.5 text-sm font-bold">
        SERFOR: {resumen.titulo}
        <InfoTip
          title="Registro de Infractores de SERFOR"
          what={resumen.detalle}
          affects={`Lista pública de SERFOR${resumen.corte ? ` actualizada el ${fmtFechaCorta(resumen.corte)}` : ""}: sanciones firmes de ARFFS, OSINFOR, SERNANP y SERFOR. Se busca al tocar el botón; no cambia nada del permiso.`}
          example="Un RUC 10 de persona natural se busca también por su DNI."
        />
      </p>
      {vistas.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
          {vistas.map((c) => (
            <li key={`${c.resolucion}-${c.infractor}-${c.documento ?? ""}-${c.motivo}`} className="tabular-nums">
              <b className="text-[var(--text-primary)]">{c.infractor}</b>
              {c.documento ? ` (${c.documento})` : ""} · {c.resolucion} · {c.fecha ? fmtFechaCorta(c.fecha) : "sin fecha"}
              {c.ambito ? ` · ${c.ambito}` : ""} · {MOTIVO_TEXTO[c.motivo]}
            </li>
          ))}
          {ocultas > 0 && <li>y {ocultas === 1 ? "1 coincidencia más" : `${ocultas} coincidencias más`}</li>}
        </ul>
      )}
      <p className="mt-1.5 text-xs font-semibold">
        <a
          href={ENLACE_REGISTRO_INFRACTORES}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-1 underline"
        >
          Ver el registro de SERFOR <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </p>
    </div>
  );
}
