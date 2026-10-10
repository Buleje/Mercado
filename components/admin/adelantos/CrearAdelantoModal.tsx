"use client";

/**
 * Nuevo adelanto — la plata que das, el abono de lo que te deben y la plata
 * que recibes, en una sola pantalla (ADR-448).
 *
 * Brandon (28-09): «quiero agregar campos de si se dio la plata o se recibió
 * como amortización o adelanto por el servicio que vamos a dar… hazlo más
 * amplio y más espacioso con mejor entendimiento de bloques y secciones». El
 * modal de antes eran cuatro columnas apretadas con scroll, todos los bloques
 * del mismo gris, y nada decía si la plata salía o entraba.
 *
 * Ahora: a la izquierda los cinco bloques apilados, cada uno una tarjeta con su
 * número y su ⓘ; a la derecha, fija, «La cuenta de X» (te debe · le debes ·
 * cómo queda · qué pasa en la caja). En el celular una sola columna y la cuenta
 * baja después del bloque 2, que es cuando ya se sabe de quién es.
 *
 * El estado y el envío viven en `hooks/use-alta-adelanto`; los textos y las
 * cuentas de cada modo, en `lib/adelantos/modos-alta` (puro, con test).
 */

import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { useAltaAdelanto } from "./hooks/use-alta-adelanto";
import { ModalShell } from "./shared";
import BloqueAbono from "./crear-adelanto/BloqueAbono";
import BloqueDevolucion from "./crear-adelanto/BloqueDevolucion";
import BloqueMonto from "./crear-adelanto/BloqueMonto";
import BloquePersona from "./crear-adelanto/BloquePersona";
import BloqueRespaldo from "./crear-adelanto/BloqueRespaldo";
import FirmarReciboModal from "./firma/FirmarReciboModal";
import PanelCuenta from "./crear-adelanto/PanelCuenta";
import PieAlta from "./crear-adelanto/PieAlta";
import QuienPone from "./crear-adelanto/QuienPone";
import type { BeneficiarioConSaldo } from "./crear-adelanto/tipos";

export type { BeneficiarioConSaldo } from "./crear-adelanto/tipos";

export default function CrearAdelantoModal({
  beneficiarios,
  adelantos,
  initialBeneficiarioId,
  admiteRecibido = false,
  onClose,
  onCreated,
  onPersonaCreada,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  /** Todos los adelantos del tenant, dados y recibidos: de acá sale el historial de la persona. */
  adelantos: DbAdelanto[];
  initialBeneficiarioId?: string;
  /**
   * El servidor ya guarda de qué lado está la plata. Sin eso, «Registrar lo
   * recibido» queda apagado: el POST viejo tiraría la dirección y lo guardaría
   * como plata dada, con egreso de caja (el error doble del ADR-448 §4).
   */
  admiteRecibido?: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Para que el módulo recargue la lista de personas cuando se crea una acá. */
  onPersonaCreada?: () => void;
}) {
  /* «Firmar el recibo al guardar» (08-10): recordado, porque en el celular se
     firma siempre. Con el adelanto ya creado (código y monto finales) se abre
     el lienzo; cerrarlo termina el alta como siempre. */
  const [firmar, setFirmar] = useLocalStorage<boolean>("buleje:adelantos-alta-firmar", false);
  const [porFirmar, setPorFirmar] = useState<string | null>(null);
  const alta = useAltaAdelanto({
    beneficiarios,
    adelantos,
    initialBeneficiarioId,
    admiteRecibido,
    onCreated: (id) => (firmar && id ? setPorFirmar(id) : onCreated()),
  });
  /* Si ya quedó algo guardado (con un aviso a la vista), cerrar con la X o
     Escape también recarga la lista: sin eso el adelanto no aparecía, se volvía
     a cargar y quedaba duplicado (revisión 28-09). */
  const cerrar = alta.registrado ? onCreated : onClose;

  /* Con la persona ya elegida, el foco va al monto — sin `autoFocus`
     (jsx-a11y/no-autofocus). En un rAF: el hook del modal enfoca la X en el
     suyo, que se programa antes. */
  const montoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!initialBeneficiarioId) return;
    const id = requestAnimationFrame(() => montoRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [initialBeneficiarioId]);

  return (
    <ModalShell title="Nuevo adelanto" onClose={cerrar} size="2xl" cuerpo="hundido" footer={<PieAlta alta={alta} onClose={cerrar} />}>
      {/* Una grilla, no dos columnas anidadas: así en el celular «La cuenta»
          cae en su lugar del orden (después del bloque 2) y desde `lg` se va a
          la columna derecha ocupando el alto de los cinco bloques, pegada
          arriba mientras se baja. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-5">
        <QuienPone modo={alta.modo} onCambiar={alta.setModo} />
        <BloquePersona alta={alta} beneficiarios={beneficiarios} onPersonaCreada={onPersonaCreada} />
        <aside aria-label="La cuenta de la persona" className="lg:sticky lg:top-0 lg:col-start-2 lg:row-span-5 lg:row-start-1 lg:self-start">
          <PanelCuenta alta={alta} />
        </aside>
        <BloqueMonto alta={alta} montoRef={montoRef} />
        {alta.modo === "abono" ? <BloqueAbono alta={alta} /> : <BloqueDevolucion alta={alta} />}
        <BloqueRespaldo alta={alta} firmar={firmar} onFirmar={setFirmar} />
      </div>
      {porFirmar && <FirmarReciboModal adelantoId={porFirmar} onClose={onCreated} />}
    </ModalShell>
  );
}
