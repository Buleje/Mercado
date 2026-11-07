"use client";

/**
 * Lo que no cuadra en el volumen de un permiso (ADR-432), una línea por aviso.
 *
 * Cada línea dice QUÉ pasó con su cifra y su conteo; el detalle (qué corridas,
 * qué guías) va en el ⓘ — Brandon, 24-09: «mucho texto por todos lados».
 * Si no hay ningún aviso, el bloque no se monta: un «todo bien» permanente es
 * ruido que enseña a no mirar.
 */

import { AlertTriangle, Info, Layers } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { AvisosDelPermiso } from "@/lib/forestal/volumen-del-permiso";
import { Btn } from "./ctp-shared";
import { m3, plural } from "./permiso-volumen-ui";

interface Linea {
  clave: string;
  grave: boolean;
  texto: string;
  titulo: string;
  what: string;
  detalle: string[];
}

const nLinea = (n: number | null) => (n == null ? "sin N°" : `N° ${n}`);

/** Arma las líneas; exportado para poder contar sin montar nada. */
export function lineasDeAvisos(a: AvisosDelPermiso): Linea[] {
  const lineas: Linea[] = [];
  if (a.excesos.length > 0) {
    lineas.push({
      clave: "excesos",
      grave: true,
      texto: `${plural(a.excesos.length, "especie pasa", "especies pasan")} el techo aserrable`,
      titulo: "Producción sobre el techo del 56 %",
      what: "Se declaró más pie tablar del que la rolliza ingresada puede dar.",
      detalle: a.excesos.map((e) => `${e.especie}: ${fmtPt(e.pt)} pt de más`),
    });
  }
  if (a.especiesSinIngreso.length > 0) {
    const total = a.especiesSinIngreso.reduce((s, e) => s + e.m3, 0);
    lineas.push({
      clave: "sin-ingreso",
      grave: true,
      texto: `${plural(a.especiesSinIngreso.length, "especie producida", "especies producidas")} sin guía de ingreso · ${m3(total)} m³`,
      titulo: "Especies sin guía de ingreso",
      what: "Se produjeron bajo este permiso, pero ninguna guía del permiso las trajo.",
      detalle: a.especiesSinIngreso.map(
        (e) => `${e.especie}: ${m3(e.m3)} m³ en ${plural(e.corridas, "corrida", "corridas")}`,
      ),
    });
  }
  if (a.corridasDeOtroPermiso.length > 0) {
    const total = a.corridasDeOtroPermiso.reduce((s, c) => s + c.consumidoM3, 0);
    lineas.push({
      clave: "otro-permiso",
      grave: true,
      texto: `${plural(a.corridasDeOtroPermiso.length, "corrida de otro permiso comió", "corridas de otro permiso comieron")} de este · ${m3(total)} m³`,
      titulo: "Corridas atadas a otro permiso",
      what: "Consumieron rolliza de este permiso pero están atadas a otro contrato: su producción no suma acá.",
      detalle: a.corridasDeOtroPermiso.map(
        (c) =>
          `${nLinea(c.lineNo)} · ${c.contratoCodigo ?? "otro contrato"} · ${m3(c.consumidoM3)} m³`,
      ),
    });
  }
  if (a.corridasSinAtar.length > 0) {
    const total = a.corridasSinAtar.reduce((s, c) => s + c.consumidoM3, 0);
    lineas.push({
      clave: "sin-atar",
      grave: false,
      texto: `${plural(a.corridasSinAtar.length, "corrida heredada", "corridas heredadas")} sin atar al contrato · ${m3(total)} m³ consumidos`,
      titulo: "Corridas sin atar (heredadas)",
      what: "Comieron madera de este permiso y no tienen contrato: suman acá en proporción a lo que comieron, pero el balance de plata no las ve.",
      detalle: a.corridasSinAtar.map(
        (c) => `${nLinea(c.lineNo)} · ${c.especie ?? "sin especie"} · ${m3(c.m3)} m³ de aserrada`,
      ),
    });
  }
  if (a.corridasSinMateriaPrima.cantidad > 0) {
    lineas.push({
      clave: "sin-mp",
      grave: false,
      texto: `${plural(a.corridasSinMateriaPrima.cantidad, "corrida", "corridas")} sin materia prima registrada · ${m3(a.corridasSinMateriaPrima.m3)} m³`,
      titulo: "Corridas sin materia prima",
      what: "Están atadas al permiso sin un solo m³ de consumo: la rolliza que usaron sigue contando como saldo. «Vincular» dice de qué trozas salieron y el saldo baja.",
      detalle: ["Se ven una por una en Trazabilidad → «Producción sin guía de ingreso»."],
    });
  }
  if (a.guiasSinTrozas.length > 0) {
    const total = a.guiasSinTrozas.reduce((s, g) => s + g.m3, 0);
    lineas.push({
      clave: "sin-trozas",
      grave: false,
      texto: `${plural(a.guiasSinTrozas.length, "guía", "guías")} sin lista de trozas · ${m3(total)} m³`,
      titulo: "Guías sin lista de trozas",
      what: "El m³ existe, pero no hay piezas: no se puede seguir troza por troza.",
      detalle: a.guiasSinTrozas.map((g) => `GTF ${g.gtf} · ${m3(g.m3)} m³`),
    });
  }
  if (a.sinConvertir.length > 0) {
    lineas.push({
      clave: "sin-convertir",
      grave: false,
      texto: `${plural(a.sinConvertir.length, "corrida", "corridas")} en una unidad que no pasa a m³`,
      titulo: "Unidades sin convertir",
      what: "Estas corridas no suman m³ ni pt: su unidad no se convierte.",
      detalle: a.sinConvertir.map(
        (c) =>
          `${nLinea(c.lineNo)} · ${formatNumber(c.cantidad, { max: 3 })} ${c.unidad ?? "sin unidad"}`,
      ),
    });
  }
  return lineas;
}

export default function CtpPermisoAvisos({
  avisos,
  onVincular,
}: {
  avisos: AvisosDelPermiso;
  /** «Descontar la madera usada»: abre la vinculación de las corridas sin materia prima. */
  onVincular?: () => void;
}) {
  const lineas = lineasDeAvisos(avisos);
  if (lineas.length === 0) return null;
  return (
    <ul
      aria-label="Lo que no cuadra en este permiso"
      className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--surface-raised)]"
    >
      {lineas.map((l) => {
        const Icono = l.grave ? AlertTriangle : Info;
        return (
          <li
            key={l.clave}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <Icono
              className={`h-4 w-4 shrink-0 ${l.grave ? "text-[var(--data-warning-ink)]" : "text-[var(--data-info-ink)]"}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">{l.texto}</span>
            {l.clave === "sin-mp" && onVincular && (
              <Btn variant="primary" onClick={onVincular} className="shrink-0">
                <Layers className="h-4 w-4" aria-hidden /> Vincular
              </Btn>
            )}
            <InfoTip
              title={l.titulo}
              what={l.what}
              ancho="w-96"
              side="left"
              body={
                <>
                  {l.detalle.slice(0, 12).map((d, i) => (
                    <span key={`${i}-${d}`} className="block font-mono text-xs tabular-nums">
                      {d}
                    </span>
                  ))}
                  {l.detalle.length > 12 && (
                    <span className="block text-xs">y {l.detalle.length - 12} más</span>
                  )}
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
