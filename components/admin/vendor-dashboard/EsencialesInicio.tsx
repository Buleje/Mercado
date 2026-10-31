"use client";

import { CardTitle, useInView } from "@buleje/design-system";
import { AlarmClock, AlertTriangle, ArrowRight, CheckCircle2, Star } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { FolderGlyph } from "@/components/admin/documentos/folder-visuals";
import { button } from "@/components/ui-system";
import { useMiRol } from "@/hooks/use-mi-rol";
import { ROLES_RESUMEN_ESENCIALES, type EsencialDelResumen, type ResumenEsenciales } from "@/lib/documentos/esenciales-resumen";
import { useEsencialesInicio } from "./use-esenciales-inicio";

/**
 * Tarjeta «Esenciales» del Inicio (Brandon 24-10): arriba cuántos papeles de
 * tus carpetas esenciales vencieron y cuántos vencen en 30 días; abajo hasta
 * 4 de esas carpetas (lo vencido primero), cada una a un clic de su panel en
 * Documentos › Esenciales. Sin carpetas marcadas: una frase y «Elegir carpetas».
 *
 * Sólo la gestión la ve (el aviso `DOC_ESENCIAL_VENCE` tampoco le llega al
 * cajero) y pide sus datos recién cuando asoma en pantalla.
 */

const MAX_CARPETAS = 4;
const RUTA_ESENCIALES = "/admin?tab=documentos&vista=esenciales";
const rutaDe = (id: string) => `${RUTA_ESENCIALES}&esencial=${encodeURIComponent(id)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const CAJA = "border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 sm:px-5";

export default function EsencialesInicio() {
  const rol = useMiRol();
  if (!rol || !ROLES_RESUMEN_ESENCIALES.includes(rol)) return null;
  // Marcar carpetas es del dueño o un administrador (`folders/bulk`): al encargado no se le ofrece.
  return <TarjetaEsenciales puedeMarcar={rol === "admin" || rol === "owner"} />;
}

function TarjetaEsenciales({ puedeMarcar }: { puedeMarcar: boolean }) {
  const [ref, enVista] = useInView<HTMLElement>();
  const estado = useEsencialesInicio(enVista);
  // El error no rompe el Inicio: la tarjeta se va (los papeles siguen en Documentos).
  if (estado.fase === "error") return null;
  const datos = estado.fase === "listo" ? estado.datos : null;
  // Un negocio que no usa el Archivo no necesita que le ofrezcan «Elegir carpetas».
  if (datos && datos.carpetas.length === 0 && !datos.hayCarpetas) return null;
  return (
    <section ref={ref} aria-label="Esenciales" aria-busy={!datos} className={CAJA}>
      <Cabecera datos={datos} puedeMarcar={puedeMarcar} />
      {!datos ? (
        <div className="mt-3 h-12 animate-pulse rounded-xl bg-[var(--surface-sunken)]" aria-hidden />
      ) : datos.carpetas.length === 0 ? null : (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {datos.carpetas.slice(0, MAX_CARPETAS).map((c) => (
            <li key={c.id} className="min-w-0">
              <FilaCarpeta c={c} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Cabecera({ datos, puedeMarcar }: { datos: ResumenEsenciales | null; puedeMarcar: boolean }) {
  const vacio = datos?.carpetas.length === 0;
  const resto = datos ? datos.carpetas.length - MAX_CARPETAS : 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <Star className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>
      {/* Con cifras, «Ver todas» queda en la misma fila aun a 400 px; vacío, el botón ancho baja. */}
      <div className={`min-w-0 flex-1 ${vacio ? "basis-48" : ""}`}>
        <CardTitle className="text-sm font-bold">Esenciales</CardTitle>
        {datos && (vacio ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {puedeMarcar ? "Marca las carpetas que más usas y aquí verás lo que vence." : "Todavía no hay carpetas esenciales que puedas ver."}
          </p>
        ) : (
          <Cifras total={datos.total} />
        ))}
      </div>
      {vacio ? (
        <EnlacePanel href={RUTA_ESENCIALES} apariencia="heredada" className={button({ variant: "primary", className: "rounded-xl gap-2 hover:no-underline" })}>
          <Star className="h-4 w-4" strokeWidth={2} aria-hidden />
          {puedeMarcar ? "Elegir carpetas" : "Ir a Esenciales"}
        </EnlacePanel>
      ) : datos ? (
        <EnlacePanel
          href={RUTA_ESENCIALES}
          apariencia="heredada"
          className="inline-flex min-h-12 shrink-0 items-center gap-1 px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
        >
          {resto > 0 ? `Ver las ${datos.carpetas.length}` : "Ver todas"} <ArrowRight className="h-4 w-4" aria-hidden />
        </EnlacePanel>
      ) : null}
    </div>
  );
}

function Cifras({ total }: { total: ResumenEsenciales["total"] }) {
  if (total.vencidos === 0 && total.porVencer === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
        Nada vence en 30 días · {plural(total.papeles, "papel", "papeles")} en {plural(total.carpetas, "carpeta", "carpetas")}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-bold">
      {total.vencidos > 0 && (
        <span className="inline-flex items-center gap-1 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {plural(total.vencidos, "vencido", "vencidos")}
        </span>
      )}
      {total.vencidos > 0 && total.porVencer > 0 && <span className="text-[var(--text-tertiary)]" aria-hidden>·</span>}
      {total.porVencer > 0 && (
        <span className="inline-flex items-center gap-1 text-[var(--data-warning-ink)]">
          <AlarmClock className="h-4 w-4" aria-hidden />
          {total.porVencer} por vencer
        </span>
      )}
    </p>
  );
}

function FilaCarpeta({ c }: { c: EsencialDelResumen }) {
  const donde = c.ruta.length > 0 ? `En ${c.ruta.join(" › ")}` : "En la raíz del Archivo";
  return (
    <EnlacePanel
      href={rutaDe(c.id)}
      apariencia="heredada"
      title={`${c.nombre} · ${donde}`}
      className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 py-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] hover:no-underline"
    >
      <FolderGlyph folder={c} className="h-6 w-6 shrink-0 text-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{c.nombre}</span>
        <span className="block truncate text-sm text-[var(--text-secondary)]">
          {c.vencidos > 0 ? (
            <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{plural(c.vencidos, "vencido", "vencidos")}</span>
          ) : c.porVencer > 0 ? (
            <span className="font-bold text-[var(--data-warning-ink)]">{c.porVencer} por vencer</span>
          ) : (
            plural(c.papeles, "papel", "papeles")
          )}
          {c.vencidos > 0 && c.porVencer > 0 && <span className="font-bold text-[var(--data-warning-ink)]"> · {c.porVencer} por vencer</span>}
        </span>
      </span>
    </EnlacePanel>
  );
}
