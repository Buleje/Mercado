"use client";

/**
 * «La compré» (ADR-437 §2-§3): a quién le pagas y cuánto costó cada especie.
 *
 * Dos modos:
 *  · «Un total» — la factura trae un número; se reparte por volumen (el resto
 *    al último asiento: la suma es la factura al céntimo).
 *  · «Por especie» — la factura trae un precio por especie, en m³ o en pt. La
 *    cantidad de la factura se tipea; nuestro ≈pt sólo se propone, rotulado «≈».
 *
 * La suma se compara con la factura. Si no cierra se dice cuánto falta y la
 * única salida es un botón que la persona elige («Ajustar S/ X en Tornillo»):
 * el libro no mueve plata por su cuenta.
 */

import { useId, useState } from "react";
import { CheckCircle2, Sparkles, UserCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Parte } from "@/lib/forestal/directorio";
import type { PlataDeGuiaDTO, ViaProveedor } from "@/lib/forestal/plata-de-guia";
import { formatNumber } from "@/lib/format";
import type { useBorradorCompra } from "@/hooks/use-plata-de-guia";
import { Bloque, CAMPO, Opciones, ROTULO, soles } from "./comun";
import TablaPorEspecie from "./TablaPorEspecie";

type Borrador = ReturnType<typeof useBorradorCompra>;

const VIA: Record<ViaProveedor, string> = {
  enlace: "elegido antes para esta guía",
  titular: "titular del permiso",
  nombre: "el mismo nombre que en la guía",
  parecido: "un nombre parecido al de la guía",
};

function Proveedor({
  dto,
  partes,
  b,
}: {
  dto: PlataDeGuiaDTO;
  partes: readonly Parte[];
  b: Borrador;
}) {
  const id = useId();
  const [eligiendo, setEligiendo] = useState(false);
  const elegido = b.proveedorId ? (partes.find((p) => p.id === b.proveedorId) ?? null) : null;
  const propuesto = dto.proveedor && !dto.proveedor.seguro && !b.proveedorId ? dto.proveedor : null;

  if (elegido && !eligiendo) {
    const via = dto.proveedor?.parteId === elegido.id ? VIA[dto.proveedor.via] : "elegido ahora";
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {/* Una frase y no tres cajas flex: con un nombre largo cada pedazo se
            encogía en su columna y la línea se partía en tres. */}
        <span className="flex min-w-0 flex-1 items-start gap-1.5">
          <UserCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            aria-hidden
          />
          <span className="min-w-0 text-[var(--text-secondary)]">
            Le pagas a{" "}
            <span className="font-bold text-[var(--text-primary)]">{elegido.nombre}</span>{" "}
            <span className="text-[var(--text-tertiary)]">· {via}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => setEligiendo(true)}
          className="h-9 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {propuesto && !eligiendo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 text-[var(--text-primary)]">
            ¿Es <span className="font-bold">{propuesto.nombre}</span>?{" "}
            <span className="text-[var(--text-secondary)]">({VIA[propuesto.via]})</span>
          </span>
          <button
            type="button"
            onClick={() => b.setProveedorId(propuesto.parteId)}
            className="h-9 rounded-lg bg-[var(--accent-dark)] px-3 font-bold text-white"
          >
            Sí, es
          </button>
          <button
            type="button"
            onClick={() => setEligiendo(true)}
            className="h-9 rounded-lg border border-[var(--rule-base)] px-3 font-bold text-[var(--text-secondary)]"
          >
            Elegir otro
          </button>
        </div>
      )}
      {(!propuesto || eligiendo) && (
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label htmlFor={id} className="text-sm font-bold text-[var(--text-secondary)]">
              ¿A quién le pagas?
            </label>
            <InfoTip
              title="A quién le pagas"
              what="Sale del enlace de la guía, del titular del permiso o del nombre exacto. Nunca del RUC: el de la guía es el de la ATFFS."
              affects="Sin ficha, el costo se guarda igual pero no entra a ninguna cuenta."
            />
          </div>
          <select
            id={id}
            value={b.proveedorId ?? ""}
            onChange={(e) => {
              b.setProveedorId(e.target.value || null);
              setEligiendo(false);
            }}
            className={CAMPO}
          >
            <option value="">Sin elegir (no entra a ninguna cuenta)</option>
            {partes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default function SeccionCompra({
  dto,
  partes,
  b,
  sugerencia,
}: {
  dto: PlataDeGuiaDTO;
  partes: readonly Parte[];
  b: Borrador;
  /** Precio por m³ que sale del propio libro, con de dónde. */
  sugerencia: { porM3: number; texto: string } | null;
}) {
  const idTotal = useId();
  const idPorM3 = useId();
  const vol = dto.lineas.reduce((t, l) => t + l.volumeM3, 0);
  const totalNum = Number(b.total.replace(",", "."));
  const porM3 =
    b.total.trim() !== "" && Number.isFinite(totalNum) && vol > 0
      ? Math.round((totalNum / vol) * 100) / 100
      : null;

  return (
    <>
      <Bloque titulo="A quién le pagas">
        <Proveedor dto={dto} partes={partes} b={b} />
        {b.proveedorId && (
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={b.anotarEnCuenta}
              onChange={(e) => b.setAnotarEnCuenta(e.target.checked)}
              className="h-5 w-5 accent-[var(--accent-dark)]"
            />
            Anotar la madera en su cuenta (lo que le debes)
          </label>
        )}
      </Bloque>

      <Bloque
        titulo="Cuánto costó"
        extra={
          <Opciones
            etiqueta="Cómo viene la factura"
            valor={b.modo}
            onCambio={b.cambiarModo}
            opciones={[
              { v: "total", l: "Un total" },
              { v: "especie", l: "Por especie" },
            ]}
          />
        }
      >
        {b.modo === "total" ? (
          <div className="space-y-3">
            {sugerencia && (
              <button
                type="button"
                onClick={() =>
                  b.cambiarTotal(String(Math.round(sugerencia.porM3 * vol * 100) / 100))
                }
                className="flex w-full items-start gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-left text-sm hover:bg-[var(--accent)]/20"
              >
                <Sparkles
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-bold tabular-nums text-[var(--text-primary)]">
                    {soles(sugerencia.porM3)} por m³ · usar{" "}
                    {soles(Math.round(sugerencia.porM3 * vol * 100) / 100)}
                  </span>
                  <span className="block text-[var(--text-secondary)]">{sugerencia.texto}</span>
                </span>
              </button>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={idTotal} className={ROTULO}>
                  Total de la factura (S/)
                </label>
                <input
                  id={idTotal}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={b.total}
                  onChange={(e) => b.cambiarTotal(e.target.value)}
                  placeholder="0.00"
                  className={CAMPO}
                />
              </div>
              <div>
                <label htmlFor={idPorM3} className={ROTULO}>
                  Precio por m³ (S/)
                </label>
                <input
                  id={idPorM3}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  disabled={vol <= 0}
                  value={porM3 ?? ""}
                  onChange={(e) => {
                    const p = Number(e.target.value);
                    b.cambiarTotal(
                      e.target.value === "" || !Number.isFinite(p)
                        ? ""
                        : String(Math.round(p * vol * 100) / 100),
                    );
                  }}
                  placeholder="0.00"
                  className={CAMPO}
                />
              </div>
            </div>
            {dto.lineas.length > 1 && b.calculo.lineas.some((l) => l.costoTotal != null) && (
              <ul className="space-y-1 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
                {dto.lineas.map((l) => {
                  const c = b.calculo.lineas.find((x) => x.id === l.id);
                  return (
                    <li
                      key={l.id}
                      className="flex items-baseline justify-between gap-2 text-[var(--text-secondary)]"
                    >
                      <span className="min-w-0 truncate">
                        {l.speciesCommonName} ·{" "}
                        <span className="tabular-nums">
                          {formatNumber(l.volumeM3, { max: 3 })} m³
                        </span>
                      </span>
                      <span className="font-bold tabular-nums text-[var(--text-primary)]">
                        {soles(c?.costoTotal)}
                      </span>
                    </li>
                  );
                })}
                <li className="pt-1 text-[var(--text-tertiary)]">
                  Repartido por volumen: el resto va a la última especie.
                </li>
              </ul>
            )}
          </div>
        ) : (
          <TablaPorEspecie dto={dto} b={b} />
        )}
        {b.calculo.listo && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-ink)]">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Cierra con la factura:{" "}
            {soles(b.calculo.factura)}
          </p>
        )}
      </Bloque>
    </>
  );
}
