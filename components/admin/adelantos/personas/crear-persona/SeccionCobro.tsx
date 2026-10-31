"use client";

/**
 * Cobro y banco (plegable) y Notas (plegable). Dónde cobra: si el adelanto sale
 * por transferencia, el número estaba en un WhatsApp viejo y había que buscarlo
 * cada vez. El CCI se revisa en vivo (20 dígitos) y, si el banco está vacío, se
 * elige solo por los 3 primeros dígitos; si no coincide, avisa.
 */
import Plegable from "@/components/admin/shared/Plegable";
import { formatNumber } from "@/lib/format";
import { Field } from "../../shared";
import { PieRevision } from "./piezas";
import { AREA, CAMPO, PIE, PIE_AVISO, campo } from "./clases";
import type { DatosPersona } from "./datos";
import { avisoBancoDelCci, bancoDelCci, revisarCci } from "./validacion";

/** Los bancos donde de verdad se cobra un adelanto en Perú. */
const BANCOS = ["BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Caja Huancayo", "Mibanco", "Yape", "Plin", "Otro"];

type Props = {
  d: DatosPersona;
  set: <K extends keyof DatosPersona>(k: K, v: DatosPersona[K]) => void;
};

function resumenDe(d: DatosPersona): string {
  const rev = revisarCci(d.cci);
  if (rev.estado === "mal" || rev.estado === "escribiendo") return "Revisa el CCI";
  const cuenta = d.cuentaBancaria.replace(/\D/g, "");
  const partes = [
    d.banco || null,
    cuenta ? `Cuenta …${cuenta.slice(-4)}` : null,
    rev.estado === "ok" ? "CCI completo" : null,
    Number(d.limite) > 0 ? `Límite S/ ${formatNumber(Number(d.limite))}` : null,
  ].filter(Boolean);
  return partes.join(" · ") || "Sin datos de cobro todavía";
}

export default function SeccionCobro({ d, set }: Props) {
  const revCci = revisarCci(d.cci);
  const delCci = bancoDelCci(d.cci);
  const choque = avisoBancoDelCci(d.cci, d.banco);
  const opciones = d.banco && !BANCOS.includes(d.banco) ? [d.banco, ...BANCOS] : BANCOS;

  return (
    <Plegable clave="adelantos:alta-persona:cobro" titulo="Cobro y banco" resumen={resumenDe(d)}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Banco">
            <select value={d.banco} onChange={(e) => set("banco", e.target.value)} className={CAMPO}>
              <option value="">—</option>
              {opciones.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Límite de crédito S/"
            grupo
            info={{
              what: "Cuánto puede deber a la vez.",
              affects: "Al pasarlo, el sistema avisa antes de darle otro adelanto. Vacío = sin límite.",
              example: "S/ 1 500",
            }}
          >
            <input
              type="number"
              min={0}
              step="any"
              value={d.limite}
              onChange={(e) => set("limite", e.target.value)}
              aria-label="Límite de crédito S/"
              placeholder="Sin límite"
              className={campo(false, "tabular-nums")}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="N° de cuenta">
            <input
              value={d.cuentaBancaria}
              onChange={(e) => set("cuentaBancaria", e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className={campo(false, "tabular-nums")}
            />
          </Field>
          <Field label="CCI (interbancario)">
            <input
              value={d.cci}
              onChange={(e) => {
                const v = e.target.value;
                set("cci", v);
                const banco = bancoDelCci(v);
                if (banco && !d.banco) set("banco", banco);
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="20 dígitos"
              aria-invalid={revCci.estado === "mal" || undefined}
              className={campo(revCci.estado === "mal" || !!choque, "tabular-nums")}
            />
            {choque ? (
              <span className={`${PIE} ${PIE_AVISO}`}>{choque}</span>
            ) : (
              <PieRevision revision={revCci} okTexto={delCci ? `Completo · ${delCci}` : "Completo"} />
            )}
          </Field>
        </div>
      </div>
    </Plegable>
  );
}

export function SeccionNotas({ d, set }: Props) {
  const nota = d.notas.trim();
  return (
    <Plegable
      clave="adelantos:alta-persona:notas"
      titulo="Notas"
      resumen={nota ? (nota.length > 60 ? `${nota.slice(0, 60)}…` : nota) : "Sin notas"}
    >
      <Field label="Notas">
        <textarea
          value={d.notas}
          onChange={(e) => set("notas", e.target.value)}
          rows={3}
          placeholder="Lo que conviene recordar: quién lo recomendó, en qué trabaja…"
          className={AREA}
        />
      </Field>
    </Plegable>
  );
}
