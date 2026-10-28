"use client";

/**
 * Dictar el paquete de un tirón (paso «Piezas»): «20 de 1×7×5» llena la
 * cantidad y el volumen — 58,33 PT · 0,138 m³, el m³ sale del PT ÷ 424 como en
 * la plaza. Dicho en cm y m entra dimensionado, con sus medidas. Con teclado o
 * con el micrófono; Enter lo usa y un segundo Enter (campo vacío) añade el
 * paquete, como el resto del formulario.
 */
import { useEffect, useState } from "react";
import { Mic, MicOff } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useVozContinua } from "@/hooks/use-voz-continua";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { leerPaqueteDictado, medidasDelDictado } from "@/lib/forestal/produccion-dictado";
import { formatNumber } from "@/lib/format";
import { CAMPO } from "./campos";
import type { RegistrarProduccion } from "./use-registrar-produccion";

const ICONO = button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" });
const BOTON = button({ variant: "secondary", className: "shrink-0 rounded-xl" });

export default function DictadoDePaquete({ r, activo }: { r: RegistrarProduccion; activo: boolean }) {
  const { setDimensionar, setCantidad, setVolumen, setEspesor, setAncho, setLargo } = r;
  const [texto, setTexto] = useState("");
  const [entendido, setEntendido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usar = (dicho: string) => {
    if (!dicho.trim()) return;
    const d = leerPaqueteDictado(dicho);
    if (!d) {
      setEntendido(null);
      setError(`No entendí «${dicho.trim()}». Di, por ejemplo, «20 de 1 por 7 por 5».`);
      return;
    }
    setError(null);
    setCantidad(String(d.cantidad));
    if (d.metrico) {
      setDimensionar(true);
      setEspesor(String(d.espesor));
      setAncho(String(d.ancho));
      setLargo(String(d.largo));
      setEntendido(`${medidasDelDictado(d)} · el volumen sale de las medidas`);
    } else {
      /* El mismo redondeo que el campo «Pie tablar»: PT ÷ 424 a 4 decimales. */
      setDimensionar(false);
      setVolumen(String(d.m3));
      setEntendido(`${medidasDelDictado(d)} = ${formatNumber(d.pieTablar, 2)} PT · ${fmtM3(d.m3)} m³`);
    }
    setTexto("");
  };

  const voz = useVozContinua(usar);
  const { detener } = voz;
  /* Fuera del paso, el micrófono no sigue escuchando a escondidas. */
  useEffect(() => {
    if (!activo) detener();
  }, [activo, detener]);

  return (
    <div className="mb-3 space-y-1" data-dictado-paquete>
      <div className="flex items-center gap-2">
        {voz.supported && (
          <button
            type="button"
            onClick={voz.toggle}
            aria-pressed={voz.listening}
            aria-label={voz.listening ? "Dejar de escuchar" : "Dictar con el micrófono"}
            title={voz.listening ? "Dejar de escuchar" : "Dictar con el micrófono"}
            className={`${ICONO} ${voz.listening ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40" : ""}`}
          >
            {voz.listening ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
          </button>
        )}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            /* Con texto, Enter es «usar lo dictado», no «añadir»: el Enter del
               bloque añadiría el paquete ANTES de llenarlo. Vacío, sigue de largo. */
            if (e.key !== "Enter" || e.ctrlKey || e.metaKey || !texto.trim()) return;
            e.preventDefault();
            e.stopPropagation();
            usar(texto);
          }}
          enterKeyHint="done"
          aria-label="Dictar el paquete"
          placeholder="Dicta o escribe: «20 de 1×7×5»"
          className={`${CAMPO} min-w-0 flex-1`}
        />
        <button type="button" onClick={() => usar(texto)} disabled={!texto.trim()} className={BOTON}>
          Usar
        </button>
      </div>
      {voz.listening && (
        <p className="text-sm italic text-[var(--text-secondary)]" aria-live="polite">
          {voz.liveText || "Te escucho…"}
        </p>
      )}
      <p aria-live="polite" className="text-sm">
        {entendido && (
          <span className="text-[var(--text-secondary)]">
            Entendí: <span className="font-semibold tabular-nums text-[var(--text-primary)]">{entendido}</span>
          </span>
        )}
        {(error ?? voz.errMsg) && (
          <span className="font-semibold text-[var(--data-error-ink)]">{error ?? voz.errMsg}</span>
        )}
      </p>
    </div>
  );
}
