"use client";

/**
 * Copiar a Excel y pegar de vuelta, en «Posición de cada campo»: «Copiar
 * tabla» deja en el portapapeles Campo · X · Y · Ancho (separado por
 * tabuladores, con el decimal del navegador); lo pegado se casa por nombre o
 * por N° de casillero (`aplicarPegado`) y dice cuántos cambiaron y cuáles no
 * reconoció. Pegar es UN paso de deshacer.
 */

import { useId, useState } from "react";
import { ClipboardCopy, ClipboardPaste } from "@buleje/design-system/icons";
import { aplicarPegado, tsvDePosiciones, type ResultadoPegado } from "@/lib/forestal/gtf-matricial-posiciones";
import { Btn, I } from "./ctp-shared";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";

/** Excel lee «12,5» o «12.5» según la región de la PC; el navegador suele tener la misma. */
const decimalDelNavegador = (): "," | "." => {
  const parte = new Intl.NumberFormat(navigator.language).formatToParts(1.5).find((p) => p.type === "decimal");
  return parte?.value === "," ? "," : ".";
};

/** El portapapeles moderno; si el navegador lo niega, el de siempre (dentro de la ventana, que Radix no suelta el foco). */
async function alPortapapeles(texto: string, dentro: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.className = "fixed opacity-0";
    (dentro ?? document.body).appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

const enLista = (xs: string[], tope = 6): string => (xs.length <= tope ? xs.join(" · ") : `${xs.slice(0, tope).join(" · ")} y ${xs.length - tope} más`);

export function BotonesExcel({ t, pegando, alternarPegar }: { t: EstadoGtfMatricial; pegando: boolean; alternarPegar: () => void }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!t.hoja) return;
    const tsv = tsvDePosiciones(t.formato, t.hoja, decimalDelNavegador());
    const ok = await alPortapapeles(tsv, e.currentTarget.closest<HTMLElement>("[role=dialog]"));
    setCopiado(ok ? `Copiada: ${tsv.split("\n").length - 1} renglones` : "Tu navegador no dejó copiar");
  };
  return (
    <>
      <Btn variant="secondary" onClick={(e) => void copiar(e)} title="Campo, X, Y y Ancho en mm, para pegar en Excel" data-qa="pos-copiar">
        <ClipboardCopy className="h-4 w-4" aria-hidden /> Copiar tabla
      </Btn>
      <Btn variant="secondary" aria-expanded={pegando} onClick={alternarPegar} data-qa="pos-abrir-pegar">
        <ClipboardPaste className="h-4 w-4" aria-hidden /> Pegar desde Excel
      </Btn>
      {copiado && (
        <span role="status" className="text-sm font-semibold text-[var(--text-secondary)]">
          {copiado}
        </span>
      )}
    </>
  );
}

function Resultado({ r }: { r: ResultadoPegado }) {
  const aviso = "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
  return (
    <div role="status" className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
      <span className="font-bold text-[var(--text-primary)]">
        {r.cambiados.length ? `Cambiaron ${r.cambiados.length}: ${enLista(r.cambiados)}` : "No cambió nada"}
        {r.sinCambio ? ` · ${r.sinCambio} ya estaban igual` : ""}
      </span>
      {r.noReconocidos.length > 0 && (
        <span className={aviso}>
          No reconocí {r.noReconocidos.length}: {enLista(r.noReconocidos)}
        </span>
      )}
      {r.acotados.length > 0 && (
        <span className={aviso}>Llevé al borde (X e Y van de −50 a 1000 mm; el ancho, de 1 a 1000): {enLista(r.acotados)}</span>
      )}
      {r.ilegibles.length > 0 && <span className={aviso}>No pude leer la cifra de: {enLista(r.ilegibles)}</span>}
    </div>
  );
}

export function PegarDesdeExcel({ t, onCerrar }: { t: EstadoGtfMatricial; onCerrar: () => void }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [r, setR] = useState<ResultadoPegado | null>(null);
  const aplicar = (txt: string) => {
    if (!t.hoja || !txt.trim()) return;
    const res = aplicarPegado(t.formato, t.hoja, txt);
    setR(res);
    if (res.cambiados.length) t.editar((h) => aplicarPegado(t.formato, h, txt).hoja);
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-secondary)]">
        Pega aquí lo copiado de Excel (Ctrl + V): las columnas Campo, X, Y y Ancho. Cada renglón va a su campo por el nombre o por el N°.
      </label>
      <textarea
        id={id}
        rows={4}
        value={texto}
        data-qa="pos-pegar"
        placeholder={"(2) Autoridad Regional…\t95\t38,1\t100"}
        onChange={(e) => setTexto(e.target.value)}
        onPaste={(e) => {
          const txt = e.clipboardData.getData("text/plain");
          if (!txt) return;
          e.preventDefault();
          setTexto(txt);
          aplicar(txt);
        }}
        className={`${I.replace("h-11", "min-h-24")} py-2 font-mono`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="secondary" onClick={() => aplicar(texto)} disabled={!texto.trim()} data-qa="pos-aplicar">
          Aplicar
        </Btn>
        <Btn variant="ghost" onClick={onCerrar}>
          Cerrar
        </Btn>
      </div>
      {r && <Resultado r={r} />}
    </div>
  );
}
