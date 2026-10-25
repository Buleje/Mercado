"use client";

/**
 * «Llenar desde: Dictar» del alta: una frase («le di 500 a Wasaco por
 * aserrío») → modo, monto, fecha, caja, nota y persona. Igual entra lo dicho
 * por el micrófono que lo escrito o lo que Handy tipea en el campo: todo pasa
 * por `llenar(frase)`. El parser es puro (`lib/adelantos/dictado-adelanto`).
 *
 * NUNCA guarda. Llenar de nuevo (otra frase, o la misma corregida) deshace lo
 * que puso la anterior y aplica la nueva: dictar en dos tiempos no suma dos
 * montos. Sólo se devuelve lo que el dictado TOCÓ: «Deshacer» no pisa lo que se
 * escribió a mano en otro campo.
 */

import { useCallback, useRef, useState } from "react";
import { leerDictadoAdelanto, type MetodoDictado } from "@/lib/adelantos/dictado-adelanto";
import { diaLegibleVoucher } from "@/lib/adelantos/voucher";
import { MODO, esModoRecibido } from "@/lib/adelantos/modos-alta";
import type { AltaAdelanto } from "../hooks/use-alta-adelanto";
import { fmtMon } from "../shared";
import { HOY } from "./campos-monto";
import { personaDeLaFrase, soltarLaElegida, type PersonaLeida } from "./persona-leida";
import type { BeneficiarioConSaldo } from "./tipos";

export type EstadoDictado =
  | { fase: "inactivo" }
  | { fase: "lleno"; frase: string; puestos: string[]; avisos: string[]; persona: PersonaLeida | null; montoPuesto: string | null }
  | { fase: "nada"; frase: string };

const NOMBRE_METODO: Record<MetodoDictado, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", transferencia: "Transferencia" };

/** Lo que había antes, sólo de los campos que el dictado tocó. */
type Antes = Partial<Pick<AltaAdelanto, "modo" | "beneficiarioId" | "monto" | "moneda" | "fecha" | "metodoCaja" | "notas">>;

export function useDictarAdelanto(alta: AltaAdelanto, beneficiarios: readonly BeneficiarioConSaldo[], admiteRecibido: boolean) {
  const [estado, setEstado] = useState<EstadoDictado>({ fase: "inactivo" });
  const altaRef = useRef(alta);
  altaRef.current = alta;
  const antes = useRef<Antes | null>(null);

  /** Devuelve lo que tocó la frase anterior (para «Deshacer» y para llenar otra vez). */
  const devolver = useCallback(() => {
    const a = altaRef.current;
    const p = antes.current;
    if (!p) return;
    if (p.modo !== undefined) a.setModo(p.modo);
    if (p.beneficiarioId !== undefined) a.setBeneficiarioId(p.beneficiarioId);
    if (p.monto !== undefined) a.setMonto(p.monto);
    if (p.moneda !== undefined) a.setMoneda(p.moneda as "PEN" | "USD");
    if (p.fecha !== undefined) a.setFecha(p.fecha);
    if (p.metodoCaja !== undefined) a.setMetodoCaja(p.metodoCaja);
    if (p.notas !== undefined) a.setNotas(p.notas);
    antes.current = null;
  }, []);

  const llenar = useCallback(
    (frase: string) => {
      const texto = frase.trim();
      if (!texto) return;
      const hoy = HOY();
      const d = leerDictadoAdelanto(texto, { hoy });
      const persona = personaDeLaFrase(texto, d.nombre, d.nota, beneficiarios);
      if (d.monto == null && !persona && !d.nota && !d.modo) {
        setEstado({ fase: "nada", frase: texto });
        return;
      }
      /* Otra frase sobre una ya puesta: se parte de lo que había ANTES de la primera. */
      const previo = antes.current;
      devolver();
      const a = altaRef.current;
      const guardado: Antes = previo ?? {};
      const tocar = <K extends keyof Antes>(k: K, v: Antes[K]) => {
        if (!(k in guardado)) guardado[k] = v;
      };
      const puestos: string[] = [];
      const avisos: string[] = [];

      let modo = previo?.modo ?? a.modo;
      if (d.modo && d.modo !== modo) {
        if (esModoRecibido(d.modo) && !admiteRecibido) {
          avisos.push(`Dijiste «${MODO[d.modo].titulo}»: esta tienda todavía no registra la plata que recibes. Lo dejé en «${MODO[modo].titulo}».`);
        } else {
          tocar("modo", modo);
          a.setModo(d.modo);
          modo = d.modo;
          puestos.push(`Quién pone: ${MODO[d.modo].titulo}`);
        }
      }

      let montoPuesto: string | null = null;
      if (d.monto != null) {
        tocar("monto", previo?.monto ?? a.monto);
        montoPuesto = d.monto.toFixed(2);
        a.setMonto(montoPuesto);
        const moneda = d.moneda ?? "PEN";
        if (modo !== "abono" && d.moneda) {
          tocar("moneda", previo?.moneda ?? a.moneda);
          a.setMoneda(moneda);
        }
        puestos.push(`Monto ${fmtMon(d.monto, modo === "abono" || !d.moneda ? (previo?.moneda ?? a.moneda) : moneda)}`);
      }

      if (d.fecha && d.fecha !== (previo?.fecha ?? a.fecha)) {
        tocar("fecha", previo?.fecha ?? a.fecha);
        a.setFecha(d.fecha);
        puestos.push(`Fecha ${diaLegibleVoucher(d.fecha)}`);
      }
      if (d.metodo) {
        if ((d.fecha ?? hoy) === hoy) {
          tocar("metodoCaja", previo?.metodoCaja ?? a.metodoCaja);
          a.setMetodoCaja(d.metodo);
          puestos.push(`Caja: ${NOMBRE_METODO[d.metodo]}`);
        } else {
          avisos.push(`Dijiste ${NOMBRE_METODO[d.metodo]}, pero es de otro día: la caja de hoy no se mueve.`);
        }
      }

      if (persona?.tipo === "una") {
        tocar("beneficiarioId", previo?.beneficiarioId ?? a.beneficiarioId);
        a.setBeneficiarioId(persona.id);
        puestos.push(`Persona: ${persona.nombre}`);
      } else if (soltarLaElegida(persona, previo?.beneficiarioId ?? a.beneficiarioId)) {
        /* `a` es el alta de antes de devolver: la elegida de verdad es la previa. */
        tocar("beneficiarioId", previo?.beneficiarioId ?? a.beneficiarioId);
        a.setBeneficiarioId("");
      }

      if (d.nota) {
        tocar("notas", previo?.notas ?? a.notas);
        const linea = d.nota.charAt(0).toUpperCase() + d.nota.slice(1);
        a.setNotas((n) => (n.trim() ? `${n.trim()} · ${linea}` : linea));
        puestos.push(`Nota «${linea}»`);
      }

      if (d.monto == null) avisos.push("No oí el monto: escríbelo abajo.");
      antes.current = guardado;
      setEstado({ fase: "lleno", frase: texto, puestos, avisos, persona, montoPuesto });
    },
    [admiteRecibido, beneficiarios, devolver],
  );

  const elegirPersona = useCallback((id: string, nombre: string) => {
    const a = altaRef.current;
    if (antes.current && !("beneficiarioId" in antes.current)) antes.current.beneficiarioId = a.beneficiarioId;
    a.setBeneficiarioId(id);
    setEstado((e) => (e.fase === "lleno" && e.persona ? { ...e, persona: { tipo: "una", dicho: e.persona.dicho, id, nombre } } : e));
  }, []);

  const deshacer = useCallback(() => {
    devolver();
    setEstado({ fase: "inactivo" });
  }, [devolver]);

  const cerrar = useCallback(() => {
    antes.current = null;
    setEstado({ fase: "inactivo" });
  }, []);

  return { estado, llenar, elegirPersona, deshacer, cerrar };
}

export type DictarAdelanto = ReturnType<typeof useDictarAdelanto>;
