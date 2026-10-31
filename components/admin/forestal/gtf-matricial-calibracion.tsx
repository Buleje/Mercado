"use client";

/**
 * «Cargar calibración (JSON)» (Brandon 17-10: «ahí está la calibración de
 * GTF, con eso calibra el modal de imprimir talonario»): un JSON medido sobre
 * el talonario (x, y desde el recuadro impreso, y = base del texto) pone cada
 * valor de la GUÍA en su lugar (`aplicarCalibracion`). Queda sin guardar y se
 * deshace con Ctrl + Z; dice qué tomó, qué no tiene par y dónde supuso el
 * recuadro en el papel (se corrige en «Medida › Recuadro» con la regla).
 */

import { useRef, useState } from "react";
import { FileJson } from "@buleje/design-system/icons";
import { aplicarCalibracion, calibracionSchema, type SinPar } from "@/lib/forestal/gtf-matricial-calibracion";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Btn } from "./ctp-shared";
import { fmtMm } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";

interface Aviso {
  ok: boolean;
  texto: string;
  /** Lo que se puso y dónde quedó el recuadro (va en el ⓘ). */
  detalle?: string;
  sinPar?: SinPar[];
}

export default function CargarCalibracion({ t }: { t: EstadoGtfMatricial }) {
  const archivo = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const esGuia = t.formato === "guia";

  const cargar = async (a: File) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await a.text());
    } catch {
      setAviso({ ok: false, texto: `«${a.name}» no es un JSON.` });
      return;
    }
    const r = calibracionSchema.safeParse(raw);
    if (!r.success || !t.hoja) {
      setAviso({ ok: false, texto: "No parece una calibración de la GTF: le falta «marco_medido_mm» o «campos» en milímetros." });
      return;
    }
    const res = aplicarCalibracion(t.hoja, r.data);
    t.editar(() => res.hoja);
    const n = (tipo: string) => res.pares.filter((p) => p.tipo === tipo).length;
    const pr = res.recuadro;
    setAviso({
      ok: true,
      texto: `Calibración puesta · recuadro a ${fmtMm(pr.x)} / ${fmtMm(pr.y)} mm: mídelo con la regla · falta guardar`,
      detalle:
        `${n("campo")} campos, ${n("casilla")} casillas y ${n("columna")} columnas del cuadro (34), en una hoja ${pr.papel ?? ""} de ${fmtMm(pr.anchoMm)} × ${fmtMm(pr.altoMm)} mm. ` +
        `Supuse el recuadro a ${fmtMm(pr.x)} mm del borde izquierdo del papel y ${fmtMm(pr.y)} mm del de arriba: si tu regla dice otra cosa, corrígelo en Ajustes › Medida › Recuadro y todo se mueve junto.`,
      sinPar: res.sinPar,
    });
  };

  return (
    <>
      <input
        ref={archivo}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Elegir el archivo de calibración"
        onChange={(e) => {
          const a = e.target.files?.[0];
          if (a) void cargar(a);
          e.target.value = "";
        }}
      />
      <Btn
        variant="secondary"
        onClick={() => archivo.current?.click()}
        disabled={!esGuia || !t.hoja}
        title={esGuia ? "Un JSON medido sobre tu talonario: x, y desde el recuadro impreso" : "La calibración es de la guía: elige «Guía» arriba"}
        data-qa="pos-calibracion"
      >
        <FileJson className="h-4 w-4" aria-hidden /> Cargar calibración
      </Btn>
      {aviso && (
        <div role="status" className="flex basis-full items-center gap-1 text-sm" data-qa="pos-calibracion-aviso">
          <span className={aviso.ok ? "font-semibold text-[var(--text-primary)]" : "font-semibold text-[var(--data-warning-ink)]"}>{aviso.texto}</span>
          {aviso.detalle && (
            <InfoTip
              title="Qué se puso"
              ancho="w-96"
              what={aviso.detalle}
              affects={
                aviso.sinPar?.length ? (
                  <span className="flex flex-col gap-0.5">
                    <span>Sin lugar en el sistema ({aviso.sinPar.length}):</span>
                    {aviso.sinPar.map((s) => (
                      <span key={s.clave}>
                        {s.campo}: {s.motivo.charAt(0).toLowerCase() + s.motivo.slice(1)}.
                      </span>
                    ))}
                  </span>
                ) : undefined
              }
            />
          )}
        </div>
      )}
    </>
  );
}
