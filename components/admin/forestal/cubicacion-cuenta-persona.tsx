"use client";

/**
 * «¿De quién es la madera?» y «La madera… te la trae / se la entregas»: los
 * dos campos que comparten el patio de trozas y el Cubicador de madera para
 * subir un lote a la cuenta de una persona (ADR-478/483). Un solo lugar para
 * el orden (primero quien tiene adelantos abiertos del lado que toca: compra
 * paga lo DADO, venta lo RECIBIDO) y para la etiqueta con su saldo.
 */
import { useMemo, useState } from "react";
import { Link2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useMiRol } from "@/hooks/use-mi-rol";
import { sugerirPersonaDeAdelantos } from "@/lib/adelantos/madera-adelanto";
import { unirConFicha } from "@/lib/adelantos/unir-con-ficha";
import { formatCurrency } from "@/lib/currency";
import { etiquetaPersonaCubicacion } from "@/lib/forestal/cubicacion-a-cuenta";
import { avisarPersonasCambiaron, type PersonaCuenta, type SentidoCubicacion } from "./hooks/use-cubicaciones-trozas";

export const CAMPO_CUENTA =
  "h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
export const ETIQUETA_CUENTA = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";

/** Lo que cada persona tiene abierto del lado que toca (compra paga lo DADO; venta, lo RECIBIDO). */
function abiertosDe(p: PersonaCuenta, sentido: SentidoCubicacion): { n: number; monto: number } {
  const a = p.adelantos;
  if (!a || !p.beneficiarioId) return { n: 0, monto: 0 };
  return sentido === "venta" ? { n: a.recibidosAbiertos, monto: a.recibidoPendiente } : { n: a.abiertos, monto: a.teDebe };
}

/** Las personas con adelantos abiertos del lado que toca primero; después, por nombre. */
export function usePersonasOrdenadas(personas: readonly PersonaCuenta[] | null, sentido: SentidoCubicacion): PersonaCuenta[] {
  return useMemo(
    () => [...(personas ?? [])].sort((a, b) => abiertosDe(b, sentido).n - abiertosDe(a, sentido).n || a.nombre.localeCompare(b.nombre)),
    [personas, sentido],
  );
}

export function CampoPersonaCuenta({
  id, ordenadas, persona, clave, onClave, sentido, cargando, error,
}: {
  id: string;
  ordenadas: readonly PersonaCuenta[];
  /** La elegida (`ordenadas.find(clave)`), para el aviso de «no tiene adelantos». */
  persona: PersonaCuenta | null;
  clave: string;
  onClave: (clave: string) => void;
  sentido: SentidoCubicacion;
  cargando: boolean;
  error: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA_CUENTA}>¿De quién es la madera?</label>
      <select id={id} className={CAMPO_CUENTA} value={clave} onChange={(e) => onClave(e.target.value)} disabled={cargando}>
        <option value="">{cargando ? "Cargando cuentas…" : "Elige la persona"}</option>
        {ordenadas.map((p) => <option key={p.clave} value={p.clave}>{etiquetaPersonaCubicacion(p, sentido)}</option>)}
      </select>
      {error && <p className="mt-1 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      {persona && !persona.beneficiarioId && (
        <SugerirUnirConAdelantos persona={persona} ordenadas={ordenadas} onUnida={(id) => onClave(`benef:${id}`)} />
      )}
    </div>
  );
}

/**
 * Elegiste la ficha del directorio («WASACO») y en Adelantos está «Wasaco» con
 * adelantos abiertos: sin unirlas, su madera no baja de su adelanto. Se ofrece
 * unirlas (una vez, como en su ficha de Adelantos); al unirlas queda elegida
 * la persona de Adelantos, que ya trae su ficha. Sólo admin o dueño unen.
 */
function SugerirUnirConAdelantos({
  persona, ordenadas, onUnida,
}: {
  persona: PersonaCuenta;
  ordenadas: readonly PersonaCuenta[];
  onUnida: (beneficiarioId: string) => void;
}) {
  const rol = useMiRol();
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const sugerida = useMemo(
    () => (persona.parteId ? sugerirPersonaDeAdelantos({ nombre: persona.nombre }, ordenadas)?.candidata.fila ?? null : null),
    [persona, ordenadas],
  );
  if (!sugerida?.beneficiarioId || !persona.parteId || !(rol === "admin" || rol === "owner")) {
    return <p className="mt-1 text-sm text-[var(--text-tertiary)]">No tiene adelantos: al valorizarla, todo va a su cuenta.</p>;
  }
  const beneficiarioId = sugerida.beneficiarioId;
  const parteId = persona.parteId;
  return (
    <div className="mt-1 space-y-1 rounded-xl bg-[var(--data-info)]/10 px-3 py-2 text-sm" data-vista="unir-con-adelantos">
      <p className="text-[var(--text-primary)]">
        ¿Es <b>{sugerida.nombre}</b> de Adelantos (mismo nombre)? Tiene{" "}
        <b className="tabular-nums">{formatCurrency(sugerida.adelantos?.teDebe ?? 0)}</b> de adelanto: únelas y esta madera baja de ahí.
      </p>
      <button
        type="button"
        className={button({ variant: "secondary" })}
        disabled={guardando}
        onClick={async () => {
          setGuardando(true);
          setFallo(null);
          const r = await unirConFicha(beneficiarioId, parteId);
          setGuardando(false);
          if (!r.ok) { setFallo(r.mensaje); return; }
          avisarPersonasCambiaron();
          onUnida(beneficiarioId);
        }}
        data-accion="unir-con-adelantos"
      >
        <Link2 className="h-4 w-4" aria-hidden /> {guardando ? "Uniendo…" : "Sí, únelas"}
      </button>
      {fallo && <p role="alert" className="font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{fallo}</p>}
    </div>
  );
}

export function CampoSentidoCuenta({ sentido, onSentido }: { sentido: SentidoCubicacion; onSentido: (s: SentidoCubicacion) => void }) {
  return (
    <div role="radiogroup" aria-label="Quién entrega la madera">
      <span className={ETIQUETA_CUENTA}>La madera…</span>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1">
        {(["compra", "venta"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={sentido === s} onClick={() => onSentido(s)}
            className={`h-12 rounded-xl text-sm font-bold transition-colors ${sentido === s ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
            {s === "compra" ? "Te la trae" : "Se la entregas"}
          </button>
        ))}
      </div>
    </div>
  );
}
