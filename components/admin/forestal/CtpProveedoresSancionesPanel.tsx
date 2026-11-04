"use client";

/**
 * «Proveedores en OSINFOR y SERFOR» (Cumplimiento › Chequeo del período).
 *
 * El mismo cruce del botón «Revisar en OSINFOR y SERFOR» de cada ficha, pero
 * con toda la libreta de una vez: cada ficha (proveedor, comprador,
 * transportista) con sus permisos contra el Registro de Infractores de SERFOR
 * y la lista roja / PAU de OSINFOR. Solo al tocar (llama a OSINFOR por cada
 * permiso) y solo lectura: no cambia nada del libro.
 */

import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ENLACE_REGISTRO_INFRACTORES } from "@/lib/forestal/serfor-infractores";
import { Btn } from "./ctp-shared";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";
import { fmtFechaCorta } from "./contratos-ui";
import CtpProveedoresSancionesFila from "./CtpProveedoresSancionesFila";
import { useRevisionProveedores, type RevisionProveedores } from "./hooks/use-revision-proveedores";

/** Permisos que OSINFOR no contestó o que ni se consultaron: «sin alertas» no se puede decir de ellos. */
function permisosSinRevisar(d: RevisionProveedores): number {
  return d.resumen.osinforSinRespuesta + d.resumen.osinforSinConsultar;
}

function lineaResumen(d: RevisionProveedores): string {
  const r = d.resumen;
  const partes = [
    `Revisé ${r.revisados === 1 ? "1 ficha" : `${r.revisados} fichas`} y ${r.permisos === 1 ? "1 permiso" : `${r.permisos} permisos`}`,
    d.corteSerfor ? `lista de SERFOR al ${fmtFechaCorta(d.corteSerfor)}` : null,
    r.sinDocumento > 0 ? `${r.sinDocumento} sin RUC/DNI (solo por nombre)` : null,
    r.sinDatos > 0 ? `${r.sinDatos} sin RUC/DNI ni nombre para buscar` : null,
    r.osinforSinRespuesta > 0 ? `${r.osinforSinRespuesta} ${r.osinforSinRespuesta === 1 ? "permiso" : "permisos"} sin respuesta de OSINFOR` : null,
    r.osinforSinConsultar > 0 ? `${r.osinforSinConsultar} ${r.osinforSinConsultar === 1 ? "permiso" : "permisos"} sin consultar en OSINFOR` : null,
  ];
  return partes.filter(Boolean).join(" · ");
}

export default function CtpProveedoresSancionesPanel() {
  const { datos, cargando, error, revisar } = useRevisionProveedores();
  const alertas = datos?.filas.length ?? null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[var(--data-warning-600)]" aria-hidden />
          <CardTitle as="h3" className="flex items-center gap-1.5 text-sm font-bold">
            Proveedores en OSINFOR y SERFOR{" "}
            {alertas != null && <span className="text-[var(--text-tertiary)]">({alertas})</span>}
          </CardTitle>
          <InfoTip
            title="Proveedores en OSINFOR y SERFOR"
            what="Busca cada ficha de tu libreta y cada permiso en el Registro de Infractores de SERFOR (por RUC/DNI, nombre y código) y en el mapa de OSINFOR (lista roja y PAU). Son listas públicas; no cambia nada de tu libro."
            affects="Si un proveedor sale «Sancionado», lee la resolución y pídele su descargo antes de comprarle: un fiscalizador cruza lo mismo."
            example="Ejemplo: una comunidad con 2 resoluciones de 2026 de la ATFFS Selva Central sale arriba, en rojo."
          />
        </div>
        <Btn variant="secondary" onClick={() => void revisar()} disabled={cargando}>
          {cargando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ShieldAlert className="h-4 w-4" aria-hidden />
          )}
          {datos ? "Revisar de nuevo" : "Revisar a todos"}
        </Btn>
      </div>

      {error && (
        <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {cargando && !datos ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando cada ficha y permiso en
          OSINFOR y SERFOR…
        </p>
      ) : !datos ? (
        !error && (
          <p className="text-sm text-[var(--text-secondary)]">
            Toca «Revisar a todos» para buscar tus proveedores en las listas de OSINFOR y SERFOR
            (unos segundos).
          </p>
        )
      ) : (
        <>
          <p className="text-xs text-[var(--text-tertiary)]">{lineaResumen(datos)}</p>
          {datos.filas.length === 0 && permisosSinRevisar(datos) > 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-[var(--data-warning-500)]/12 p-3 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              No se pudo revisar {permisosSinRevisar(datos)}{" "}
              {permisosSinRevisar(datos) === 1 ? "permiso" : "permisos"} en OSINFOR: esto no quiere
              decir «sin alertas». Vuelve a tocar «Revisar de nuevo».
            </p>
          ) : datos.filas.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/10 p-3 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Ninguna ficha ni permiso aparece en el Registro de Infractores de SERFOR ni en la
              lista roja de OSINFOR.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
              <TablaCtp>
                <TheadCtp>
                  <tr>
                    <th className="text-left font-bold">Ficha</th>
                    <th className="text-left font-bold">SERFOR (infractores)</th>
                    <th className="text-left font-bold">OSINFOR por permiso</th>
                    <th className="text-right font-bold">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </TheadCtp>
                <TbodyCtp>
                  {datos.filas.map((f) => (
                    <CtpProveedoresSancionesFila key={f.clave} fila={f} />
                  ))}
                </TbodyCtp>
              </TablaCtp>
            </div>
          )}
          <a
            href={ENLACE_REGISTRO_INFRACTORES}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-semibold text-[var(--accent-dark)] hover:underline"
          >
            Ver la lista de SERFOR (datos abiertos)
          </a>
        </>
      )}
    </section>
  );
}
