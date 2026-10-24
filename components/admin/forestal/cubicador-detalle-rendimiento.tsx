"use client";

/**
 * «Contra la guía GTF …» en el detalle de una cubicación (Brandon 24-10):
 * cuánto rindió la guía. Guía de troza → rendimiento (m³ aserrado ÷ m³ de
 * troza, el m³ sale del PT ÷ 424) contra la meta; guía de madera aserrada →
 * cuadre directo. Es un derivado de dos fuentes, y se dice.
 */
import { useMemo } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useRendimientoDeGuia } from "@/components/admin/forestal/hooks/use-rendimiento-de-guia";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { cruzarConGuia, type CruceConGuia, type FilaDelCruce } from "@/lib/forestal/cubicacion-rendimiento-guia";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { fmtM3, fmtPct, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { conSigno } from "./cubicador-detalle-ficha";

const OK = "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]";
const AVISO = "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]";
const NEUTRO = "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
const TXT_OK = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const TXT_AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

const META_PCT = Math.round(RENDIMIENTO_META * 100);

const tonoDelVeredicto = (v: FilaDelCruce["veredicto"]) => (v === "bueno" ? OK : v === null ? NEUTRO : AVISO);
const txtDelVeredicto = (v: FilaDelCruce["veredicto"]) => (v === "bueno" ? TXT_OK : v === null ? "text-[var(--text-secondary)]" : TXT_AVISO);

function Caja({ tono, children }: { tono: string; children: React.ReactNode }) {
  return <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tono}`}>{children}</p>;
}

function frasePrincipal(c: CruceConGuia): { tono: string; texto: string } {
  const t = c.total;
  if (c.tipo === "trozas") {
    if (t.rendimientoPct === null) return { tono: NEUTRO, texto: "La guía no declara m³ de troza: no hay con qué calcular el rendimiento." };
    const extra = t.veredicto === "sospechoso" ? " · más de 100 % no puede ser: revisa la cubicación o la guía" : "";
    return {
      tono: tonoDelVeredicto(t.veredicto),
      texto: `${fmtM3(t.m3Guia)} m³ de troza → salieron ${fmtPt(t.pt)} PT (${fmtM3(t.m3Cubicado)} m³) = ${fmtPct(t.rendimientoPct)} % de rendimiento · meta ${META_PCT} %${extra}`,
    };
  }
  const cuadra = t.difPt === 0;
  return {
    tono: cuadra ? OK : AVISO,
    texto: cuadra
      ? `La guía declara ${fmtM3(t.m3Guia)} m³ y cubicaste ${fmtM3(t.m3Cubicado)} m³: cuadra.`
      : `La guía declara ${fmtM3(t.m3Guia)} m³, cubicaste ${fmtM3(t.m3Cubicado)} m³: diferencia ${conSigno(t.difM3, fmtM3)} m³ (${conSigno(t.difPt, fmtPt)} PT).`,
  };
}

const NUM = "text-right font-mono tabular-nums";

function TablaPorEspecie({ c }: { c: CruceConGuia }) {
  const troza = c.tipo === "trozas";
  return (
    <DataTable className="w-full">
      <caption className="sr-only">{troza ? "Rendimiento por especie" : "Cuadre por especie"}</caption>
      <thead>
        <tr>
          <th scope="col">Especie</th>
          <th scope="col" className="text-right">{troza ? "Troza (m³)" : "Guía (m³)"}</th>
          <th scope="col" className="text-right">Cubicado (PT)</th>
          <th scope="col" className="text-right">{troza ? "Rinde" : "Diferencia"}</th>
        </tr>
      </thead>
      <tbody>
        {[...c.filas, c.total].map((f, i, todas) => {
          const esTotal = i === todas.length - 1;
          const tono = troza ? txtDelVeredicto(f.veredicto) : f.difPt === 0 ? TXT_OK : TXT_AVISO;
          return (
            <tr key={f.clave} className={esTotal ? "font-bold" : undefined}>
              <td className="text-left">
                <span className="font-semibold text-[var(--text-primary)]">{f.especie}</span>
                {f.soloEnGuia && <span className="block font-normal text-[var(--text-secondary)]">solo en la guía</span>}
                {f.soloEnCubicacion && <span className="block font-normal text-[var(--text-secondary)]">no está en la guía{troza ? " · no cuenta" : ""}</span>}
              </td>
              <td className={NUM}>{f.soloEnCubicacion ? "—" : fmtM3(f.m3Guia)}</td>
              <td className={NUM}>{f.soloEnGuia ? "—" : fmtPt(f.pt)}</td>
              <td className={`${NUM} font-bold ${tono}`}>
                {troza
                  ? (f.rendimientoPct === null || f.soloEnGuia ? "—" : `${fmtPct(f.rendimientoPct)} %`)
                  : f.soloEnGuia || f.soloEnCubicacion ? `${conSigno(f.difM3, fmtM3)} m³` : `${conSigno(f.difM3, fmtM3)} m³ (${conSigno(f.difPt, fmtPt)} PT)`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

export function RendimientoContraLaGuia({ c }: { c: CubicacionRegistro }) {
  const r = useRendimientoDeGuia(c.gtfNumber);
  const cruce = useMemo(
    () => (r.estado === "lista" ? cruzarConGuia(r.guia, c.piezas, c.especie) : null),
    [r, c.piezas, c.especie],
  );
  if (r.estado === "sin-guia") return null;

  const numero = r.estado === "lista" || r.estado === "anulada" ? r.numero : c.gtfNumber;
  const frase = cruce ? frasePrincipal(cruce) : null;

  return (
    <section aria-label="Contra la guía GTF" className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Contra la guía GTF {numero}</CardTitle>
        <InfoTip
          what="Cruza lo que declara la guía con lo que cubicaste. Guía de troza: rendimiento = m³ aserrado (PT ÷ 424) ÷ m³ de troza. Guía de madera aserrada: la diferencia entre sus m³ y los tuyos."
          affects="Es un derivado de dos fuentes, no el rendimiento real de la corrida (ese se declara en Producción). Si la guía no se aserró entera, el rendimiento sale más bajo."
          example="15,2 m³ de troza y 3.200 PT (7,547 m³) dan 49,7 %, bajo la meta de 56 %."
        />
      </div>

      {r.estado === "cargando" && <p className="text-sm text-[var(--text-secondary)]" role="status">Buscando la guía…</p>}
      {r.estado === "no-esta" && <Caja tono={NEUTRO}>No encuentro la guía {c.gtfNumber} entre las emitidas: no se puede cruzar.</Caja>}
      {r.estado === "anulada" && <Caja tono={AVISO}>La guía {r.numero} está anulada: no se cruza con ella.</Caja>}
      {r.estado === "error" && <Caja tono={AVISO}>No pude leer la guía ahora. Cierra y vuelve a abrir el detalle.</Caja>}

      {cruce && frase && (
        <>
          <Caja tono={frase.tono}>{frase.texto}</Caja>
          {(cruce.filas.length > 1 || cruce.filas.some((f) => f.soloEnGuia || f.soloEnCubicacion)) && <TablaPorEspecie c={cruce} />}
          <p className="text-sm text-[var(--text-secondary)]">
            {cruce.tipo === "trozas"
              ? "Derivado: m³ aserrado = PT ÷ 424, entre los m³ de troza de la guía. La corrida real se declara en Producción."
              : "Derivado: tus m³ salen del PT ÷ 424; los de la guía, de lo que ella declara."}
          </p>
        </>
      )}
    </section>
  );
}
