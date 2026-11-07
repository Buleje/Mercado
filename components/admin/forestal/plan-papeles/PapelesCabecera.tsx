"use client";

/**
 * La cabecera de «Papeles del permiso»: el título con su ⓘ y la acción
 * principal en una fila; debajo, el avance —una barra con un tramo por papel
 * obligatorio, «0 de 4 papeles obligatorios», cuántos faltan, vencieron o
 * vencen pronto— y hasta cuándo vale el plan (la resolución sin fecha propia
 * vence con él).
 */

import { CardTitle } from "@buleje/design-system";
import { CalendarClock, ScanText } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { fechaConDia } from "@/lib/forestal/loth-plan-costeo";
import { textoCuenta, type PapelesDelPlan as Papeles } from "@/lib/forestal/loth-plan-papeles";
import { limaDateKey } from "@/lib/utils";
import { tramosDeAvance } from "./papeles-grupos";
import { ASPECTO_PAPEL } from "./PapelFila";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function PapelesCabecera({
  papeles,
  esPlantacion,
  vigencia,
  llenar,
}: {
  papeles: Papeles;
  esPlantacion: boolean;
  /** AAAA-MM-DD: hasta cuándo vale el plan, o null. */
  vigencia: string | null;
  /** «Llenar desde la resolución», si hay un archivo que se pueda leer. */
  llenar: { leyendo: boolean; onLeer: () => void } | null;
}) {
  const hoy = limaDateKey();
  const tramos = tramosDeAvance(papeles.lista);
  const segunCaso = papeles.lista.filter((p) => p.estado === "segun_caso").length;
  const completo = papeles.requeridos > 0 && papeles.presentes >= papeles.requeridos;
  const cifras = [
    papeles.faltan.length > 0 && { texto: plural(papeles.faltan.length, "falta", "faltan"), tinta: ASPECTO_PAPEL.falta.tinta },
    papeles.vencidos > 0 && { texto: plural(papeles.vencidos, "vencido", "vencidos"), tinta: ASPECTO_PAPEL.vencido.tinta },
    papeles.vencenPronto > 0 && { texto: `${papeles.vencenPronto} por vencer`, tinta: ASPECTO_PAPEL.vence_pronto.tinta },
  ].filter((c): c is { texto: string; tinta: string } => Boolean(c));
  const vencioElPlan = vigencia != null && vigencia < hoy;

  return (
    <header className="space-y-3 border-b border-[var(--rule-soft)] pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <CardTitle>Papeles del permiso</CardTitle>
          <InfoTip
            title="Papeles del permiso"
            what={`Lo que SERFOR, la ATFFS u OSINFOR te pueden pedir para ${esPlantacion ? "esta plantación" : "este plan"}, según su tipo, y cuál ya está en su carpeta del Archivo. Cada fila dice qué norma lo pide.`}
            affects={`La cuenta sale en la pestaña y en el semáforo del plan; los vencimientos, en «Por vencer» de Documentos.${segunCaso > 0 ? ` Los «si aplica» (${segunCaso}) no cuentan hasta que los subas.` : ""}`}
            example="Plan 096: Certificado ✓ · Título ✓ · Acta de la comunidad: falta · Mapa: falta."
          />
        </div>
        {llenar && (
          <button type="button" className={button({ variant: "secondary" })} disabled={llenar.leyendo} onClick={llenar.onLeer}>
            <ScanText className="h-4 w-4" aria-hidden="true" />
            Llenar desde {esPlantacion ? "el certificado" : "la resolución"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`text-sm font-bold tabular-nums ${completo ? "text-[var(--data-success-ink)]" : "text-[var(--text-primary)]"}`}>
            {textoCuenta(papeles)} obligatorios
          </span>
          {tramos.length > 0 && (
            <span className="flex w-32 shrink-0 gap-1 sm:w-40" aria-hidden="true">
              {tramos.map((t) => (
                <span key={t.clave} title={`${t.nombre}: ${ASPECTO_PAPEL[t.estado].label.toLowerCase()}`} className={`h-2 flex-1 rounded-full ${ASPECTO_PAPEL[t.estado].tramo}`} />
              ))}
            </span>
          )}
        </div>
        {cifras.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 text-sm font-semibold">
            {cifras.map((c) => (
              <span key={c.texto} className={c.tinta}>
                {c.texto}
              </span>
            ))}
          </p>
        )}
        {vigencia && (
          <p className={`flex items-center gap-1.5 text-sm sm:ml-auto ${vencioElPlan ? "font-semibold text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]"}`}>
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {vencioElPlan ? "El plan venció el " : "El plan vale hasta el "}
            {fechaConDia(vigencia, hoy)}
          </p>
        )}
      </div>
    </header>
  );
}
