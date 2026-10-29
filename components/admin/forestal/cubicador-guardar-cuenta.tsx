"use client";

/**
 * «Cuenta de un tercero» en el modal «Guardar cubicación» (Brandon 24-10:
 * «vincular a CUENTA DE TERCERO con el precio para sacar el importe»). Es el
 * MISMO camino que «Cuenta ▾ › Guardar en la cuenta» (`useSubirMaderaACuenta`,
 * mismos avisos anti doble cobro): acá sólo se elige a quién y en qué sentido.
 * El importe que se ve es una vista previa; el de la cuenta lo calcula el
 * servidor al valorizar.
 */
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { CampoPersonaCuenta, CampoSentidoCuenta } from "./cubicacion-cuenta-persona";
import { claseSaldo, textoSaldo } from "./CtpParteSaldo";
import { netoDePersonaCuenta } from "./cuenta-persona-saldo";
import { AvisosDelLote, EstadoDelLoteEnLaCuenta } from "./cubicador-madera-cuenta-avisos";
import type { CuentaDeMaderaDelLote } from "./cubicador-madera-cuenta-contexto";
import type { SubidaACuenta } from "./hooks/use-subir-madera-a-cuenta";

export default function CuentaDeGuardar({ cuenta, subida, encendido, onEncendido, importe, onAbrir }: {
  cuenta: CuentaDeMaderaDelLote;
  subida: SubidaACuenta;
  encendido: boolean;
  onEncendido: (v: boolean) => void;
  /** Vista previa: PT × precio de cada pieza (null = sin precio). */
  importe: number | null;
  /** Abrir una cubicación de la cuenta (ya cobrada o en el despacho) en su ventana. */
  onAbrir: (id: string) => void;
}) {
  const { vista, persona, cobrada, enDespacho } = subida;
  /* Vista previa (28-10): «te la trae» baja lo que te debe; «se la entregas» lo sube. */
  const hoy = persona ? netoDePersonaCuenta(persona) : null;
  const despues = hoy !== null && importe != null
    ? Math.round((hoy + (subida.sentido === "venta" ? importe : -importe)) * 100) / 100
    : null;
  return (
    <section aria-labelledby="cubg-cuenta" className="min-w-0 space-y-3 rounded-2xl border border-[var(--rule-base)] p-3 sm:p-4" data-bloque="guardar-a-cuenta">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h3" id="cubg-cuenta">Cuenta de un tercero</CardTitle>
        <InfoTip
          what="Además de guardarla, la madera pasa a la cuenta de una persona (la del Directorio o la de sus adelantos)."
          affects="Todavía no mueve plata: después le pones el precio por PT y se descuenta de sus adelantos. Si este lote ya está en una cuenta, se actualiza esa; si ya se descontó, no deja cobrarlo dos veces."
        />
      </div>
      <Interruptor id="cubg-cuenta-switch" enabled={encendido} onChange={onEncendido} label="Subir a la cuenta de una persona"
        desc="Con el precio de arriba sale el importe que va a su cuenta." />

      {encendido && (
        <div className="space-y-3">
          <AvisosDelLote subida={subida} />
          <CampoPersonaCuenta id="cubg-persona" ordenadas={subida.ordenadas} persona={persona} clave={subida.clave} onClave={subida.setClave}
            sentido={subida.sentido} cargando={subida.cargando} error={subida.errorPersonas} />
          <CampoSentidoCuenta sentido={subida.sentido} onSentido={subida.setSentido} />
          <EstadoDelLoteEnLaCuenta subida={subida} delLote={cuenta.delLote} errorDelLote={cuenta.error} reintentar={cuenta.recargar} onAbrir={onAbrir} />
          {persona && !cobrada && !enDespacho && vista.ok && (
            <p className="rounded-2xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              Va a la cuenta de <b className="text-[var(--text-primary)]">{persona.nombre}</b>: {fmtPt(vista.pt)} PT
              {importe != null ? <> · <b className="text-[var(--text-primary)]">S/ {fmtSoles(importe)}</b> con este precio</> : " · sin precio todavía"}
              <InfoTip what="El importe de la cuenta lo calcula el servidor al valorizar, con el PT de cada pieza guardada y su precio." />
              {despues !== null && (
                <span className="mt-1 block" data-saldo-despues={despues}>
                  Si se valoriza así, su saldo queda: <b className={claseSaldo(despues)}>{textoSaldo(despues)}</b>
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
