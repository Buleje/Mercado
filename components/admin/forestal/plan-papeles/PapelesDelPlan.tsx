"use client";

/**
 * «Papeles del permiso» (pestaña Papeles del plan): lo que la norma pide para
 * este tipo de plan contra lo que hay en sus carpetas del Archivo (ADR-467).
 *
 * La lista es pura (`loth-plan-papeles`) y se calcula con la misma vista de
 * carpetas que pinta la pestaña: subir acá o en la carpeta de abajo es lo
 * mismo. Cada archivo subido desde una fila lleva `papel:<clave>` y, si es la
 * resolución, la vigencia del plan como vencimiento (entra al aviso «Por
 * vencer» de siempre).
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, ScanText } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { tagPapel, textoCuenta, type PapelDelPlan, type PapelesDelPlan as Papeles } from "@/lib/forestal/loth-plan-papeles";
import type { DocumentosDelPlan } from "../hooks/use-plan-documentos";
import { useLlenarResolucion } from "../hooks/use-llenar-resolucion";
import VistaPreviaDoc from "../plan-documentos/VistaPreviaDoc";
import LlenarDesdeResolucion from "./LlenarDesdeResolucion";
import PapelFila from "./PapelFila";

const VALEN_LO_QUE_EL_PLAN = new Set(["resolucion", "plan-aprobado"]);

export default function PapelesDelPlan({
  planId,
  esPlantacion,
  vigenciaHasta,
  papeles,
  docs,
  onPlanCambiado,
}: {
  planId: string;
  esPlantacion: boolean;
  /** AAAA-MM-DD o ISO: vencimiento de la resolución subida sin fecha propia. */
  vigenciaHasta: string | null;
  papeles: Papeles | null;
  docs: DocumentosDelPlan;
  onPlanCambiado: () => void | Promise<void>;
}) {
  const [verId, setVerId] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const llenar = useLlenarResolucion({ planId, onGuardado: onPlanCambiado });

  if (!docs.disponible) return null;
  if (!papeles) {
    return docs.error ? (
      <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
        No pude revisar los papeles: {docs.error}
      </p>
    ) : (
      <p role="status" className="flex items-center gap-2 py-4 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Revisando los papeles…
      </p>
    );
  }

  const resolucion = papeles.lista.find((p) => p.clave === "resolucion")?.archivo ?? null;
  /* Con candado para este rol (sin id): no se lee ni se abre. */
  const resolucionId = resolucion?.documentId ?? null;
  const vigencia = vigenciaHasta ? vigenciaHasta.slice(0, 10) : null;

  const subir = async (p: PapelDelPlan, files: File[]) => {
    const carpeta = docs.carpetas.find((c) => c.clave === p.carpeta) ?? docs.carpetas[0];
    if (!carpeta) {
      setAviso("Este plan todavía no tiene carpetas en el Archivo.");
      return;
    }
    const casillero = carpeta.casilleros.find((k) => p.casilleros.includes(k.clave)) ?? null;
    setAviso(null);
    setSubiendo(p.clave);
    try {
      await docs.subir(files, carpeta, casillero, {
        etiquetas: [tagPapel(p.clave)],
        vence: VALEN_LO_QUE_EL_PLAN.has(p.clave) ? vigencia : null,
      });
    } finally {
      setSubiendo(null);
    }
  };

  /* Pasar la vigencia al plan también la deja como vencimiento del archivo,
     si no tenía: así el aviso «Por vencer» de Documentos la ve. */
  const guardar = async () => {
    const r = llenar.estado?.fase === "listo" ? llenar.estado.r : null;
    const hasta = llenar.marcadas.has("vigenciaHasta") ? r?.propuesta.filas.find((f) => f.campo === "vigenciaHasta")?.leido : null;
    const ok = await llenar.guardar();
    if (ok && hasta && resolucionId && !resolucion?.expiresAt) {
      const error = await docs.cambiarVencimiento(resolucionId, hasta);
      if (error) setAviso(`El plan quedó, pero el vencimiento del archivo no: ${error}`);
    }
  };

  const errores = docs.subidas.filter((s) => s.estado === "error");
  const segunCaso = papeles.lista.filter((p) => p.estado === "segun_caso").length;

  return (
    <section data-papeles-plan className="space-y-1 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <CardTitle>Papeles del permiso</CardTitle>
          <InfoTip
            title="Papeles del permiso"
            what={`Lo que SERFOR, la ATFFS u OSINFOR te pueden pedir para ${esPlantacion ? "esta plantación" : "este plan"}, según su tipo, y cuál ya está en su carpeta del Archivo. Cada fila dice qué norma lo pide.`}
            affects={`La cuenta sale en la pestaña y en el semáforo del plan; los vencimientos, en «Por vencer» de Documentos.${segunCaso > 0 ? ` Los «si aplica» (${segunCaso}) no cuentan hasta que los subas.` : ""}`}
            example="Plan 096: Certificado ✓ · Título ✓ · Acta de la comunidad: falta · Mapa: falta."
          />
        </div>
        <span
          className={`text-sm font-bold tabular-nums ${papeles.presentes < papeles.requeridos ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]"}`}
        >
          {textoCuenta(papeles)}
          {papeles.vencidos > 0 && ` · ${papeles.vencidos} ${papeles.vencidos === 1 ? "vencido" : "vencidos"}`}
        </span>
        {resolucionId && (
          <button
            type="button"
            className={`${button({ variant: "secondary" })} ml-auto`}
            disabled={llenar.estado?.fase === "leyendo"}
            onClick={() => void llenar.leer(resolucionId)}
          >
            <ScanText className="h-4 w-4" aria-hidden="true" />
            Llenar desde {esPlantacion ? "el certificado" : "la resolución"}
          </button>
        )}
      </div>

      {(aviso || errores.length > 0) && (
        <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
          {aviso ?? errores.map((e) => `${e.nombre}: ${e.motivo ?? "no subió"}`).join(" · ")}
        </p>
      )}

      <ul className="divide-y divide-[var(--rule-soft)]" aria-label="Papeles del permiso">
        {papeles.lista.map((p) => (
          <PapelFila
            key={p.clave}
            papel={p}
            subiendo={subiendo === p.clave}
            bloqueado={subiendo != null || docs.ocupado}
            onSubir={(files) => void subir(p, files)}
            onVer={setVerId}
          />
        ))}
      </ul>

      <VistaPreviaDoc docId={verId} onClose={() => setVerId(null)} onCambio={() => void docs.recargar()} />
      <LlenarDesdeResolucion llenar={llenar} nombreArchivo={resolucion?.nombre ?? "el papel"} onGuardar={() => void guardar()} />
    </section>
  );
}
