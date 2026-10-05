"use client";

/**
 * Una guía dentro de «Traer de la guía (SERFOR)»: si el ingreso ya guarda la
 * ficha, la vista previa sale sola (sin red); si no, pide el N° de registro —el
 * del QR, con guiones— o el enlace del QR, y consulta SERFOR desde el servidor.
 * «Guardar las N de la guía» escribe sólo sobre vacío (`POST …/medidas-guia`).
 */

import { useEffect, useRef, useState } from "react";
import type { EstadoGuiaMedidas, RespuestaMedidasGuia } from "@/lib/forestal/medidas-desde-guia";
import { Btn, I } from "./ctp-shared";
import CtpTrozasMedirGuiaResumen, { bloqueoDeGuia } from "./ctp-trozas-medir-guia-resumen";
import { useMedidasDeGuia } from "./hooks/use-medidas-trozas";

const plural = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

export default function CtpTrozasMedirGuiaBloque({
  gtfNumber, codigos, estado, onGuardado,
}: {
  gtfNumber: string;
  /** Códigos de las piezas de esta guía sin D1 ni D2. */
  codigos: readonly string[];
  estado: EstadoGuiaMedidas | undefined;
  /** Después de escribir: la línea de resultado (la planilla relee el patio). */
  onGuardado: (mensaje: string) => void;
}) {
  const { consultar, cargando, error } = useMedidasDeGuia();
  const [texto, setTexto] = useState("");
  const [r, setR] = useState<RespuestaMedidasGuia | null>(null);
  const automatica = useRef(false);

  /* Con la ficha guardada, la vista previa va sola (una vez). */
  useEffect(() => {
    if (!estado?.fichaGuardada || automatica.current) return;
    automatica.current = true;
    void consultar({ gtfNumber }).then((res) => res && setR(res));
  }, [estado?.fichaGuardada, gtfNumber, consultar]);

  const ver = async () => {
    const res = await consultar({ gtfNumber, registroOEnlace: texto });
    if (res) setR(res);
  };

  const guardar = async () => {
    const res = await consultar({ gtfNumber, registroOEnlace: r?.fuente === "serfor" ? texto : undefined, aplicar: true });
    if (!res?.aplicado) return;
    setR(res);
    const a = res.aplicado;
    onGuardado(
      `Guía ${gtfNumber}: ${plural(a.escritas.length, "pieza llenada", "piezas llenadas")} desde SERFOR` +
        (a.omitidas.length ? ` · ${a.omitidas.length} ya las había anotado otra pantalla` : "") +
        (a.fichaGuardadaEn ? " · ficha guardada en el ingreso" : "") +
        ".",
    );
  };

  const llenar = r?.plan?.llenar.length ?? 0;
  const bloqueo = r && r.estado === "lista" ? bloqueoDeGuia(r) : null;
  /* El campo se ve salvo cuando la ficha guardada ya respondió bien (o se está leyendo). */
  const pideRegistro = r
    ? r.estado !== "lista" || r.fuente === "serfor" || bloqueo != null
    : !estado?.fichaGuardada || (!cargando && error != null);
  const idInput = `medir-guia-${gtfNumber.replace(/[^\w-]/g, "")}`;

  return (
    <li className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <b className="font-mono text-[var(--text-primary)]">{gtfNumber}</b>
        <span className="text-[var(--text-secondary)]">
          {plural(codigos.length, "pieza", "piezas")} sin D1/D2: {codigos.slice(0, 8).join(", ")}
          {codigos.length > 8 ? "…" : ""}
        </span>
        {estado?.fichaGuardada && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            Ficha SERFOR guardada{estado.numeroRegistro ? ` · ${estado.numeroRegistro}` : ""}
          </span>
        )}
      </div>

      {pideRegistro && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]" htmlFor={idInput}>
            N° de registro (el del QR, con guiones) o pega el enlace del QR
            <input
              id={idInput}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && texto.trim()) { e.preventDefault(); void ver(); } }}
              placeholder="1-19-0313629"
              inputMode="text"
              autoComplete="off"
              className={`${I} mt-1 font-mono`}
            />
          </label>
          <Btn onClick={() => void ver()} disabled={cargando || texto.trim() === ""}>
            {cargando ? "Consultando…" : "Ver qué trae"}
          </Btn>
        </div>
      )}

      {cargando && estado?.fichaGuardada && !r && (
        <p className="text-sm text-[var(--text-tertiary)]" role="status">Leyendo la ficha guardada…</p>
      )}
      {error && <p className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" role="alert">{error}</p>}
      {r && r.estado !== "lista" && r.mensaje && (
        <p className="text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" role="status">{r.mensaje}</p>
      )}

      {r?.estado === "lista" && !r.aplicado && (
        <>
          <CtpTrozasMedirGuiaResumen r={r} />
          <div className="flex justify-end">
            <Btn variant="primary" onClick={() => void guardar()} disabled={cargando || llenar === 0 || bloqueo != null}>
              {cargando ? "Guardando…" : bloqueo ? "No es esta guía" : llenar === 0 ? "Nada para llenar" : `Guardar ${llenar === 1 ? "la 1" : `las ${llenar}`} de la guía`}
            </Btn>
          </div>
        </>
      )}
      {r?.aplicado && (
        <p className="text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" role="status">
          {plural(r.aplicado.escritas.length, "pieza llenada", "piezas llenadas")} desde la guía
          {r.aplicado.omitidas.length ? ` · ${r.aplicado.omitidas.length} ya tenían una punta` : ""}.
        </p>
      )}
    </li>
  );
}
