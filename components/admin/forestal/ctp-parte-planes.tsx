"use client";

/**
 * «Planes de manejo y permisos de este titular» en la ficha del Directorio
 * (ADR-518). DE SÓLO LECTURA: la ficha es la entidad —una por comunidad o
 * empresa— y sus planes son N; el permiso, su área y su vigencia se cargan en
 * el alta del plan del Libro TH, que es donde se ata la ficha al plan.
 *
 * Desde acá sólo se mira y se va: «Ver en el Libro TH» abre ese plan,
 * «Crear plan de manejo para este titular» abre el alta con el titular puesto.
 * Lo que la ficha vieja anotó del permiso no se borra: se muestra en
 * «Anotado antes en la ficha» con «Pasarlo a un plan».
 */

import { useEffect } from "react";
import { Check, FileText, Loader2, Plus, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { useTenantSlug } from "@/contexts/tenant-context";
import type { Contrato } from "@/lib/forestal/contratos";
import type { Parte } from "@/lib/forestal/directorio";
import type { FilaPlanDelTitular } from "@/lib/forestal/directorio-planes";
import { ESTADO_CLASE, ESTADO_LABEL, fmtFechaCorta } from "./contratos-ui";
import { URL_PLAN_DEL_LIBRO, dejarElegidoElPlan, pedirAltaDePlan } from "./hooks/loth-plan-alta-pedida";
import { usePlanesDelTitular } from "./hooks/use-planes-del-titular";
import type { ParteFormEstado } from "./hooks/use-parte-form";
import { formatNumber } from "@/lib/format";

const fmtArea = (ha: number) => `${formatNumber(ha, { max: 2 })} ha`;

/** Un clic en un `<a href>` del panel: sin recargar, y con la ficha cerrada antes. */
const enlace = (accion: () => void) => (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  accion();
};

export default function CtpPartePlanes({ form }: { form: ParteFormEstado }) {
  const { parte, b, anidada, irAlLibro, setPermisosDelTitular } = form;
  const slug = useTenantSlug();
  const planes = usePlanesDelTitular({ id: b.id ?? null, nombre: b.nombre }, b);
  const { filas, anotado, contratos, cargando, error, libroDisponible } = planes;

  /* La barra de salud deja de pedir el «título habilitante» si hay planes ATADOS
     a la ficha. Los «por el nombre» son una sospecha, no un permiso suyo. */
  const atadosALaFicha = filas.filter((f) => f.atado === "ficha").length;
  useEffect(() => setPermisosDelTitular(atadosALaFicha), [atadosALaFicha, setPermisosDelTitular]);

  /* Desde una ficha abierta encima de otro formulario no se navega: se
     perdería lo que se está llenando abajo. En el alta todavía no hay ficha a
     la que atar el plan. */
  const puedeIr = libroDisponible && !anidada;
  const titular: Parte | null = parte?.id ? parte : null;
  /* Si no se pudo leer todo, la lista está a medias: un permiso puede verse
     «sin plan» cuando sí lo tiene. Ahí no se ofrece crear nada (se duplicaría). */
  const puedeCrearDesdeLaLista = titular != null && !error;

  const crearPlan = (permiso: Contrato | null, conLoAnotado: boolean) =>
    titular &&
    irAlLibro(() => {
      pedirAltaDePlan({ titular, permiso, conLoAnotado });
      irAEnlace(URL_PLAN_DEL_LIBRO);
    });
  const verPlan = (planId: string) =>
    irAlLibro(() => {
      dejarElegidoElPlan(slug, planId);
      irAEnlace(URL_PLAN_DEL_LIBRO);
    });

  return (
    <div data-planes-del-titular className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 sm:col-span-12">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {/* Ícono, título y ⓘ juntos: a 400 px el título se parte en su sitio en vez de dejar el ícono solo en una fila. */}
        <span className="flex min-w-0 flex-[1_1_16rem] items-center gap-2">
          <FileText className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="min-w-0 text-sm font-bold text-[var(--text-primary)]">Planes de manejo y permisos de este titular</span>
          <InfoTip
            title="Planes de manejo y permisos"
            what="La ficha guarda los datos de la comunidad o empresa (RUC, representante, dirección). Sus permisos, el área y la vigencia se cargan al crear cada plan de manejo, no acá: una sola ficha puede tener muchos planes."
            affects="La guía de transporte y el saldo de madera salen del plan, con su propio título y su vigencia."
            example="Comunidad Nativa Santa Rosa de Chivis → DEMA 2025 (120 ha) y PMFI 2026 (480 ha)"
          />
        </span>
        {puedeIr && (
          <span className="ml-auto">
            {titular ? (
              <button type="button" className={button({ variant: "secondary" })} onClick={() => crearPlan(null, false)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {/* A 400 px el texto entero se salía 13 px de la tarjeta: en angosto, la versión corta. */}
                <span>
                  Crear plan de manejo<span className="max-sm:hidden"> para este titular</span>
                </span>
              </button>
            ) : (
              <span className="text-sm text-[var(--text-secondary)]">Guarda la ficha para crearle su plan.</span>
            )}
          </span>
        )}
      </div>

      {cargando && filas.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Buscando sus planes…
        </p>
      ) : filas.length > 0 ? (
        <ul className="mt-2 space-y-1.5" aria-label="Sus planes de manejo y permisos">
          {filas.map((f) => (
            <FilaDelPlan
              key={f.clave}
              fila={f}
              incompleta={error}
              accion={
                !puedeIr ? null : f.planId ? (
                  <a href={URL_PLAN_DEL_LIBRO} className={button({ variant: "secondary" })} onClick={enlace(() => verPlan(f.planId as string))}>
                    Ver en el Libro TH
                  </a>
                ) : puedeCrearDesdeLaLista ? (
                  <button
                    type="button"
                    className={button({ variant: "secondary" })}
                    onClick={() => crearPlan(contratos.find((c) => c.id === f.contratoId) ?? null, false)}
                  >
                    Crearle su plan
                  </button>
                ) : null
              }
            />
          ))}
        </ul>
      ) : (
        !error && <p className="mt-2 text-sm text-[var(--text-secondary)]">Todavía no tiene planes de manejo.</p>
      )}

      {error && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--data-error-ink)]">
          No se pudo leer todos sus planes.
          <button type="button" className={button({ variant: "ghost" })} onClick={planes.reintentar}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </button>
        </p>
      )}

      {anotado && (
        <div data-anotado-en-la-ficha className="mt-3 rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">Anotado antes en la ficha</span>
            <InfoTip
              title="Lo que la ficha guardaba del permiso"
              what="Antes, el título habilitante y su vigencia se escribían en la ficha. Ahora van en su plan de manejo, para que cada plan lleve el suyo."
              affects="Nada se borra: el ingreso de madera y la guía siguen leyendo esto hasta que lo pases a un plan."
              example="19-SEC/REG-PLT-2026-117 · vence 31/12/2031"
            />
            <span className="ml-auto">
              {anotado.yaEnUnPlan ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Ya está en la lista de arriba
                </span>
              ) : (
                puedeIr &&
                puedeCrearDesdeLaLista && (
                  <button type="button" className={button({ variant: "secondary" })} onClick={() => crearPlan(null, true)}>
                    Pasarlo a un plan
                  </button>
                )
              )}
            </span>
          </div>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {anotado.partes.map((p) => (
              <div key={p.rotulo} className="flex min-w-0 gap-1">
                <dt className="text-[var(--text-secondary)]">{p.rotulo}:</dt>
                <dd className="min-w-0 break-words font-medium text-[var(--text-primary)]">{p.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** Una fila: el código manda; documento, área, vigencia y estado lo acompañan. */
function FilaDelPlan({ fila: f, accion, incompleta }: { fila: FilaPlanDelTitular; accion: React.ReactNode; incompleta: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2">
      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{f.codigo}</span>
      {f.documento && <span className="text-sm text-[var(--text-secondary)]">{f.documento}</span>}
      <span className={`text-sm tabular-nums ${f.areaHa != null ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}>
        {f.areaHa != null ? fmtArea(f.areaHa) : "sin área"}
      </span>
      <span className="text-sm text-[var(--text-secondary)]">
        {f.vigenciaHasta ? `vence ${fmtFechaCorta(f.vigenciaHasta)}` : "sin vigencia"}
      </span>
      {f.estado && (
        <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${ESTADO_CLASE[f.estado]}`}>{ESTADO_LABEL[f.estado]}</span>
      )}
      {!f.planId && !incompleta && <span className="text-sm text-[var(--text-tertiary)]">sin plan todavía</span>}
      {f.atado === "nombre" && (
        <span className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)]">
          por el nombre
          <InfoTip
            title="Atado por el nombre"
            what="Este plan o permiso tiene un titular escrito igual o parecido, pero no está atado a esta ficha."
            affects="Se ata solo al editar el plan y traer al titular desde el Directorio."
          />
        </span>
      )}
      {accion && <span className="ml-auto">{accion}</span>}
    </li>
  );
}
