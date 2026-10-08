"use client";

/**
 * La carta con su código (ADR-487, Brandon 08-10: «cada carta con un código
 * único que se guardará»).
 *
 * Al imprimir (o bajar el PDF, o mandarlo al Drive) la carta se guarda y el
 * servidor la sella: código «REL-2026-0001», cuándo, quién y qué declaraba.
 * Reimprimir la MISMA carta no gasta código. Si después de imprimirla se
 * cambian sus guías, su permiso o su expediente, ya es OTRA carta: se guarda
 * como nueva, con código propio, y la anterior queda como salió.
 *
 * Los formatos que no son carta (`esCarta`) siguen como antes: el código se
 * asigna al primer guardado.
 */

import { useRef, useState } from "react";
import type { DatosTramite, FormatoTramite } from "@/lib/forestal/tramites-catalogo";
import type { TramiteRegistro } from "@/lib/forestal/tramites-registro";
import { cartaCambiada, esCarta, type EmisionCarta } from "@/lib/forestal/tramites-carta";
import type { GuardarTramiteInput } from "@/hooks/use-forest-tramites";

export interface CartaGuardada {
  registro: TramiteRegistro;
  /** Se guardó como carta nueva porque la anterior ya había salido impresa con otro contenido. */
  aviso: string | null;
}

export function useTramiteCarta(o: {
  formato: FormatoTramite;
  datos: DatosTramite;
  existente?: TramiteRegistro | null;
  /** El código que tiene hoy el formulario (`null` si nunca se guardó). */
  codigoActual: string | null;
  onGuardar: (input: GuardarTramiteInput) => Promise<TramiteRegistro | null>;
  /** El payload del formulario tal como está. */
  payload: () => GuardarTramiteInput;
  /** Adopta lo que devolvió el servidor (id, código, N°, estado). */
  adoptar: (r: TramiteRegistro) => void;
}) {
  const [emision, setEmision] = useState<EmisionCarta | null>(o.existente?.emision ?? null);
  /* Lo último que devolvió el servidor EN ESTE MISMO clic: «Guardar» con estado
     Presentado archiva el PDF justo después, antes de que React repinte; sin
     esto, el segundo paso leería el id y el código viejos y crearía otra carta. */
  const ultimo = useRef<TramiteRegistro | null>(null);
  const carta = esCarta(o.formato);
  /* Al reabrir, el primer pintado todavía no tiene los datos: vacío no es «otra carta». */
  const cambiada = carta && Object.keys(o.datos).length > 0 && cartaCambiada(o.formato, o.datos, emision);

  /** Guarda; si la carta ya salió impresa y cambió lo que declara, como carta nueva (sin estado de la anterior). */
  async function guardarCarta(emitir: boolean): Promise<CartaGuardada | null> {
    const anterior = ultimo.current?.codigoInterno ?? o.codigoActual;
    const emisionAhora = ultimo.current ? (ultimo.current.emision ?? null) : emision;
    const nueva = carta && cartaCambiada(o.formato, o.datos, emisionAhora);
    const base = o.payload();
    const input: GuardarTramiteInput = nueva
      ? { ...base, id: undefined, estado: "borrador", expedienteAutoridad: null, fechaPresentacion: null, fechaRespuesta: null, emitir }
      : { ...base, id: ultimo.current?.id ?? base.id, emitir: carta && emitir };
    const registro = await o.onGuardar(input);
    if (!registro) return null;
    ultimo.current = registro;
    o.adoptar(registro);
    setEmision(registro.emision ?? null);
    const aviso =
      nueva && anterior
        ? `La carta ${anterior} ya salió impresa con otras guías, permiso o expediente: esta va como carta nueva ${registro.codigoInterno} y la anterior queda guardada como se imprimió.`
        : null;
    return { registro, aviso };
  }

  /** El código con que sale el papel: la misma carta ya impresa (o un formato que no es carta con código) no vuelve a guardar. */
  async function codigoParaImprimir(): Promise<{ codigo: string; aviso: string | null }> {
    const codigo = ultimo.current?.codigoInterno ?? o.codigoActual;
    const emisionAhora = ultimo.current ? (ultimo.current.emision ?? null) : emision;
    const yaImpresaIgual = Boolean(emisionAhora) && !cartaCambiada(o.formato, o.datos, emisionAhora);
    if (codigo && (carta ? yaImpresaIgual : true)) return { codigo, aviso: null };
    const g = await guardarCarta(true);
    if (!g) throw new Error("No se pudo guardar la carta para darle su código.");
    return { codigo: g.registro.codigoInterno, aviso: g.aviso };
  }

  return { carta, emision, cambiada, guardarCarta, codigoParaImprimir };
}
