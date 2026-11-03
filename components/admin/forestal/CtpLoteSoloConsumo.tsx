"use client";

/**
 * «Declarar solo consumo de trozas» en el detalle de un lote programado y vacío
 * (Brandon, 03-11: «ahí estar para poner el volumen de troza y guardarlos»).
 *
 * Un lote que se programó antes de que el SNIFFS diera su consumo nace sin
 * piezas ni volumen. Acá se le escribe el m³ de trozas que entró a la sierra:
 * el lote pasa a «En consumo» con la producción pendiente —el mismo estado que
 * deja la programación del SNIFFS (ADR-398)— y desde ahí se declara su
 * producción igual que en los demás. No fabrica trozas para que cuadre.
 */
import { useState } from "react";
import { Loader2, Save } from "@buleje/design-system/icons";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { limaDateKey } from "@/lib/utils";
import { Btn, Field, I, Seccion } from "./ctp-shared";

export default function CtpLoteSoloConsumo({
  inicioProceso,
  onGuardar,
}: {
  /** El inicio del proceso del lote (`AAAA-MM-DD`), para proponer la fecha del consumo. */
  inicioProceso: string;
  onGuardar: (volumenConsumidoM3: number, fecha: string) => Promise<void>;
}) {
  const [volumen, setVolumen] = useState("");
  /* El «hoy» de Lima: a las 20:00 de Pucallpa el día UTC ya es mañana. */
  const [fecha, setFecha] = useState(inicioProceso || limaDateKey());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m3 = Number(volumen);
  const valido = Number.isFinite(m3) && m3 > 0 && Boolean(fecha);

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(m3, fecha);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion title="Declarar solo consumo de trozas" hint="Queda como saldo para producir después">
      <Field span={6} label="Volumen consumido en trozas (m³)" required hint={valido ? `${fmtM3(m3)} m³ · ${pieTablarDe(m3).toLocaleString("es-PE")} pt` : "Lo que entró a la sierra, de una vez"}>
        <input
          type="number"
          min={0}
          step="0.0001"
          inputMode="decimal"
          value={volumen}
          onChange={(e) => setVolumen(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void guardar();
          }}
          placeholder="12.5000"
          className={`${I} font-mono`}
        />
      </Field>
      <Field span={3} label="Fecha del consumo">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={I} />
      </Field>
      <div className="flex items-end sm:col-span-3">
        <Btn variant="primary" className="w-full" disabled={!valido || guardando} onClick={() => void guardar()}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar consumo
        </Btn>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)] sm:col-span-12">
          {error}
        </p>
      )}
    </Seccion>
  );
}
