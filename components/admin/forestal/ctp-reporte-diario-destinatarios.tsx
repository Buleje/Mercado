"use client";

/**
 * Los destinatarios de un canal del reporte diario (ADR-439): se escribe uno,
 * Enter o coma lo agrega como ficha, la ✕ lo quita. Pegar «a@x.pe, b@y.pe»
 * agrega los dos. La validación de verdad es la del servidor
 * (`reporteDiarioSchema`); acá sólo se evita el duplicado y el vacío.
 */
import { useState } from "react";
import { X } from "@buleje/design-system/icons";
import { I } from "./ctp-shared";
import { TOPE_DESTINATARIOS } from "@/lib/forestal/reporte-diario";

export default function DestinatariosCampo({
  id,
  valores,
  onCambio,
  placeholder,
  tipo,
  deshabilitado,
  tope,
}: {
  id: string;
  valores: string[];
  onCambio: (v: string[]) => void;
  placeholder: string;
  tipo: "email" | "tel";
  deshabilitado?: boolean;
  tope: number;
}) {
  const [texto, setTexto] = useState("");

  const agregar = (crudo: string) => {
    const nuevos = crudo
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!nuevos.length) return;
    onCambio([...new Set([...valores, ...nuevos])].slice(0, tope));
    setTexto("");
  };

  return (
    <div className="space-y-2">
      <input
        id={id}
        type={tipo}
        inputMode={tipo === "tel" ? "tel" : "email"}
        className={I}
        value={texto}
        disabled={deshabilitado || valores.length >= tope}
        placeholder={valores.length >= tope ? `Llegaste al tope de ${TOPE_DESTINATARIOS} destinatarios (correo + WhatsApp)` : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;]/.test(v)) agregar(v);
          else setTexto(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            agregar(texto);
          }
        }}
        onBlur={() => agregar(texto)}
      />
      {valores.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Destinatarios agregados">
          {valores.map((v) => (
            <li
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] py-1 pl-3 pr-1 text-sm text-[var(--text-primary)]"
            >
              <span className="tabular-nums">{v}</span>
              <button
                type="button"
                disabled={deshabilitado}
                onClick={() => onCambio(valores.filter((x) => x !== v))}
                aria-label={`Quitar ${v}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
