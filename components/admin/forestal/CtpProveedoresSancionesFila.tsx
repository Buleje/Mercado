"use client";

/**
 * Una fila de «Proveedores en OSINFOR y SERFOR»: quién es, qué dice SERFOR
 * (sanciones sin repetir) y qué dice OSINFOR de cada uno de sus permisos.
 */

import { ExternalLink } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { hrefDe } from "@/lib/admin/enlaces-panel";
import { nombreComparable } from "@/lib/forestal/serfor-infractores";
import type {
  FilaRevision,
  NivelRevision,
  PermisoRevisado,
} from "@/lib/forestal/revision-proveedores";
import { fmtFechaCorta } from "./contratos-ui";
import { Btn } from "./ctp-shared";

const CHIP: Record<NivelRevision, { texto: string; clase: string }> = {
  rojo: {
    texto: "Sancionado",
    clase:
      "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  },
  ambar: {
    texto: "Revisar",
    clase:
      "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  nombre: {
    texto: "Mismo nombre",
    clase:
      "bg-[var(--surface-sunken)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  limpio: {
    texto: "Sin alertas",
    clase:
      "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  sin_datos: {
    texto: "Sin datos",
    clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  },
};

function textoOsinfor(p: PermisoRevisado): { texto: string; alerta: boolean } {
  const o = p.osinfor;
  if (!o) return { texto: "OSINFOR no respondió", alerta: false };
  if (o.nivel === "rojo") return { texto: `Lista roja (${o.enRoja})`, alerta: true };
  if (o.nivel === "ambar") return { texto: `PAU en trámite (${o.pauEnTramite})`, alerta: true };
  if (o.nivel === "verde") return { texto: "Supervisado sin alertas", alerta: false };
  return {
    texto: o.esPlantacion ? "Plantación (OSINFOR no la publica)" : "Sin supervisión",
    alerta: false,
  };
}

export default function CtpProveedoresSancionesFila({ fila }: { fila: FilaRevision }) {
  const chip = CHIP[fila.nivel];
  const href = fila.parteId
    ? hrefDe("parte", fila.parteId)
    : fila.permisos[0]
      ? hrefDe("permiso", fila.permisos[0].id)
      : null;
  const propio = nombreComparable(fila.nombre);
  const ultima = fila.sanciones[0];

  return (
    <tr>
      <td className="align-top">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip.clase}`}>
              {chip.texto}
            </span>
            <span className="font-bold text-[var(--text-primary)]">{fila.nombre}</span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">
            {fila.documento ?? "sin RUC/DNI"}
            {!fila.parteId && " · solo en el permiso"}
          </p>
        </div>
      </td>

      <td className="align-top">
        <div className="min-w-0">
          {fila.sanciones.length === 0 ? (
            <span className="text-[var(--text-tertiary)]">No figura</span>
          ) : (
            <ul className="space-y-1">
              {fila.sanciones.slice(0, 3).map((s) => (
                <li key={`${s.resolucion}|${s.fecha ?? ""}`} className="text-xs">
                  <span className="font-semibold text-[var(--text-primary)]">{s.resolucion}</span>
                  <span className="text-[var(--text-tertiary)]">
                    {" "}
                    · {s.fecha ? fmtFechaCorta(s.fecha) : "sin fecha"}
                    {s.motivo === "nombre" && " · solo por el nombre"}
                    {s.motivo === "permiso_otro" && " · a otra persona"}
                    {nombreComparable(s.infractor) !== propio &&
                      s.motivo !== "permiso_otro" &&
                      ` · figura como ${s.infractor}`}
                  </span>
                </li>
              ))}
              {fila.sanciones.length > 3 && (
                <li className="text-xs text-[var(--text-tertiary)]">
                  y {fila.sanciones.length - 3} más
                </li>
              )}
            </ul>
          )}
          {ultima?.ambito && (
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{ultima.ambito}</p>
          )}
        </div>
      </td>

      <td className="align-top">
        {fila.permisos.length === 0 ? (
          <span className="text-[var(--text-tertiary)]">Sin permisos cargados</span>
        ) : (
          <ul className="space-y-0.5">
            {fila.permisos.map((p) => {
              const o = textoOsinfor(p);
              return (
                <li key={p.id} className="text-xs">
                  <span className="whitespace-nowrap font-mono text-[var(--text-secondary)]">
                    {p.codigo}
                  </span>{" "}
                  <span
                    className={
                      o.alerta
                        ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                        : "text-[var(--text-tertiary)]"
                    }
                  >
                    · {o.texto}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </td>

      <td className="align-top text-right">
        {href && (
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => irAEnlace(href)}
            aria-label={`Abrir la ficha de ${fila.nombre}`}
          >
            Abrir <ExternalLink className="h-4 w-4" aria-hidden />
          </Btn>
        )}
      </td>
    </tr>
  );
}
