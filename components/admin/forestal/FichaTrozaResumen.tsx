/**
 * Lo que se quiere saber de una troza al escanearla (Brandon, 2026-09-26:
 * «información de la madera detallada: n° de GTF, permiso, títulos, m³,
 * especies, volumen, fecha y otros»), en una grilla que se lee de pie.
 *
 * Sale de los datos del patio (`TrozaConsumible`), así que aparece sin otro
 * pedido; la historia completa —corrida, despacho, pedazos— es la ficha
 * (`CtpTrozaFichaModal`), a un toque.
 */

import { cn } from "@/lib/utils";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { medidasDeFicha } from "@/lib/forestal/ficha-texto-troza";
import { formatDate } from "./ctp-shared";

const fecha = (v: string | null | undefined) => (v ? formatDate(v) : null);

export default function FichaTrozaResumen({ troza: t, className }: { troza: TrozaConsumible; className?: string }) {
  const filas: [string, string | null, boolean?][] = [
    ["Especie", [t.especieComun, t.especieCientifica ? `(${t.especieCientifica})` : null].filter(Boolean).join(" ") || null],
    ["Volumen", t.volumenM3 != null ? `${fmtM3(Number(t.volumenM3))} m³` : null, true],
    /* D1, D2 y largo siempre, igual que la etiqueta y su QR: la que falta dice «—». */
    ["Medidas", medidasDeFicha(t), true],
    ["N° de registro", t.libroNro != null ? String(t.libroNro) : null, true],
    ["N° de GTF", t.gtfNumber ?? null, true],
    ["Constancia SNIFFS", t.constanciaSniffs ?? null, true],
    ["Título habilitante", t.permiso ?? null, true],
    ["Resolución del plan", t.resolucion ?? null, true],
    ["Titular / proveedor", t.proveedor ?? null],
    ["Ingresó al libro", fecha(t.fechaIngreso)],
    ["Llegó al patio", fecha(t.fechaRecepcion ?? t.guiaFechaRecepcion) ?? (t.guiaRecepcionada === false ? "guía sin recibir" : null)],
    ["Lote de aserrío", t.loteAserrioCode ?? null, true],
    ["Parcela de corta", t.parcela ?? null, true],
    ["Código de la guía", t.codificacion && t.codificacion !== t.codigoPlanta ? t.codificacion : null, true],
    ["Dato", t.origenDato === "serfor" ? "del SNIFFS (SERFOR)" : t.origenDato === "manual" ? "cargado a mano" : null],
  ];
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base", className)}>
      {filas
        .filter(([, v]) => v != null)
        .map(([k, v, mono]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--text-tertiary)]">{k}</dt>
            <dd className={cn("min-w-0 break-words text-right text-[var(--text-primary)]", mono && "tabular-nums")}>{v}</dd>
          </div>
        ))}
    </dl>
  );
}
