"use client";

/**
 * «Trámites y alquileres» de la ficha del Directorio (ADR-524): los trámites de
 * esta persona (`GET /api/admin/tramites?parteId=`) y los locales que alquila
 * como dueña (`GET /api/admin/alquileres?duenoParteId=`), en listas cortas que
 * abren el registro en Administración. Sólo lee: se cargan y se editan allá.
 *
 * Para salir, la receta de «Planes de manejo» (`ctp-parte-planes`): la ficha
 * se cierra primero (pregunta si hay algo sin guardar) y DESPUÉS se navega.
 * Abierta encima de otra ventana (`anidada`) no hay salto: sólo se lista.
 */
import { button } from "@/components/ui-system/button-variants";
import { Insignia, type TonoInsignia } from "@/components/admin/administracion/comun/Insignia";
import { fechaRelativa } from "@/components/admin/administracion/comun/fechas";
import { monto } from "@/components/admin/administracion/comun/monto";
import { useTramites } from "@/components/admin/administracion/tramites/use-tramites";
import { ESTADO_TRAMITE_UI, entidadDe, proximaFecha } from "@/components/admin/administracion/tramites/tramites-ui";
import { useAlquileres } from "@/components/admin/administracion/alquileres/use-alquileres";
import { ESTADO_ALQUILER_UI, inquilinoDe } from "@/components/admin/administracion/alquileres/alquileres-ui";
import { Field } from "./ctp-shared";
import type { ParteFormEstado } from "./hooks/use-parte-form";

type VistaAdm = "tramites" | "alquileres";
const TAB_ADMINISTRACION = "administracion";
const TOPE = 5;

/**
 * Ir a Administración › Trámites/Alquileres con el registro abierto (`?id=`).
 * Igual que `abrirFichaDelPermiso`: desde otro módulo, `admin:navigate` y
 * después el `id` (antes, `navigateTab` lo borraría); fuera del panel,
 * navegando de verdad. El `popstate` final hace que la vista relea la URL.
 */
export function irAAdministracion(vista: VistaAdm, id: string): void {
  const enElPanel = /\/admin\/?$/.test(window.location.pathname);
  const qs = new URLSearchParams({ tab: TAB_ADMINISTRACION, vista, id });
  if (!enElPanel) {
    window.location.assign(`/admin?${qs.toString()}`);
    return;
  }
  const yaAhi = new URLSearchParams(window.location.search).get("tab") === TAB_ADMINISTRACION;
  if (!yaAhi) window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: TAB_ADMINISTRACION, vista } }));
  const url = new URL(window.location.href);
  qs.forEach((v, k) => url.searchParams.set(k, v));
  if (yaAhi) window.history.pushState(null, "", url.toString());
  else window.history.replaceState(null, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

interface Fila {
  id: string;
  titulo: string;
  detalle: string;
  estado: { texto: string; tono: TonoInsignia };
}

export default function CtpParteTramitesAlquileres({ form }: { form: ParteFormEstado }) {
  const parteId = form.parte?.id ?? "";
  const activo = !!parteId;
  const tramites = useTramites({ parteId }, activo);
  const alquileres = useAlquileres({ duenoParteId: parteId }, activo);
  if (!activo) return null;

  const ir = form.anidada ? null : (vista: VistaAdm, id: string) => form.irAlLibro(() => irAAdministracion(vista, id));

  const filasTramites: Fila[] = tramites.filas.map((t) => {
    const fecha = proximaFecha(t);
    return {
      id: t.id,
      titulo: t.asunto,
      detalle: [entidadDe(t), fecha ? fechaRelativa(fecha) : null].filter(Boolean).join(" · "),
      estado: ESTADO_TRAMITE_UI[t.estado],
    };
  });
  const filasAlquileres: Fila[] = alquileres.filas.map((a) => ({
    id: a.id,
    titulo: a.nombre,
    detalle: [inquilinoDe(a), `${monto(a.rentaMensual, a.moneda)} al mes`].filter(Boolean).join(" · "),
    estado: ESTADO_ALQUILER_UI[a.estado],
  }));

  return (
    <>
      <Field label="Trámites de esta persona" span={6} hint="Los que tienen a esta ficha como titular. Se cargan y se siguen en Administración › Trámites.">
        <ListaCorta
          filas={filasTramites}
          cargando={tramites.cargando}
          error={tramites.error}
          vacio="Sin trámites."
          onAbrir={ir ? (id) => ir("tramites", id) : null}
        />
      </Field>
      <Field label="Alquileres" span={6} hint="Los locales de los que es dueña. Se cargan y se cobran en Administración › Alquileres.">
        <ListaCorta
          filas={filasAlquileres}
          cargando={alquileres.cargando}
          error={alquileres.error}
          vacio="Sin alquileres."
          onAbrir={ir ? (id) => ir("alquileres", id) : null}
        />
      </Field>
    </>
  );
}

function ListaCorta({
  filas,
  cargando,
  error,
  vacio,
  onAbrir,
}: {
  filas: Fila[];
  cargando: boolean;
  error: string | null;
  vacio: string;
  onAbrir: ((id: string) => void) | null;
}) {
  if (cargando && filas.length === 0) return <p className="text-sm text-[var(--text-tertiary)]" aria-busy="true">Cargando…</p>;
  if (error) return <p className="text-sm text-[var(--data-error-ink)]">{error}</p>;
  if (filas.length === 0) return <p className="text-sm text-[var(--text-tertiary)]">{vacio}</p>;
  const resto = filas.length - TOPE;
  return (
    <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]">
      {filas.slice(0, TOPE).map((f) => {
        const cuerpo = (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{f.titulo}</span>
              {f.detalle && <span className="block truncate text-xs text-[var(--text-tertiary)]">{f.detalle}</span>}
            </span>
            <Insignia tono={f.estado.tono} texto={f.estado.texto} />
          </>
        );
        return (
          <li key={f.id}>
            {onAbrir ? (
              <button
                type="button"
                className={button({ variant: "ghost", className: "h-auto min-h-12 w-full justify-between gap-3 rounded-none px-3 py-2 font-normal" })}
                onClick={() => onAbrir(f.id)}
              >
                {cuerpo}
              </button>
            ) : (
              <div className="flex min-h-12 items-center gap-3 px-3 py-2">{cuerpo}</div>
            )}
          </li>
        );
      })}
      {resto > 0 && <li className="px-3 py-2 text-sm text-[var(--text-tertiary)]">Y {resto} más en Administración.</li>}
    </ul>
  );
}
