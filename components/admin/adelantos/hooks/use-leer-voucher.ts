"use client";

/**
 * «Llenar desde: Foto» del alta de adelanto: la captura de Yape, Plin o de una
 * transferencia → OCR en el navegador → PRELLENA monto, fecha, caja, nota y la
 * persona, y adjunta la foto como comprobante (la misma foto local de
 * «Adjuntar archivo», que al guardar va privada: no hay schema nuevo).
 *
 * NUNCA guarda: deja todo marcado «leído de la foto — revisa» y la persona
 * confirma con el botón de siempre. Si no encuentra el monto no toca nada y lo
 * dice. «Deshacer» vuelve los campos a como estaban antes de leer.
 *
 * LA PERSONA (25-10). El «Yapeaste a …» se busca entre tus personas
 * (`persona-leida`): si calza una sola, queda elegida; si calzan varias, se
 * pregunta; si no está, se ofrece crearla con ese nombre. La dirección no se
 * cambia sola: si la captura es de plata que te llegó y estás en «Doy plata»,
 * se avisa.
 *
 * EL N° DE OPERACIÓN va en la nota («Yape N° op 02873341»), que se busca igual
 * que el código ADL. No va al «N° de recibo de papel»: ése es el talonario que
 * firma la persona y el comprobante lo imprime como «Recibo manual N.°».
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { leerTextoDeImagen, liberarOcr, type ProgresoOcr } from "@/lib/ocr/ocr-navegador";
import { diaLegibleVoucher, etiquetaApp, metodoDeVoucher, notaDeVoucher } from "@/lib/adelantos/voucher";
import { leerComprobante, type ComprobanteLeido } from "@/lib/adelantos/leer-comprobante-yape";
import { leerAdjuntoLocal } from "@/lib/adelantos/adjunto-local";
import { logger } from "@/lib/logger";
import { fmtMon } from "../shared";
import { HOY } from "../crear-adelanto/campos-monto";
import { personaDelNombre, soltarLaElegida, type PersonaLeida } from "../crear-adelanto/persona-leida";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";
import type { AltaAdelanto } from "./use-alta-adelanto";

export type EstadoVoucher =
  | { fase: "inactivo" }
  | { fase: "leyendo"; progreso: ProgresoOcr | null; miniatura: string }
  | {
      fase: "leido";
      voucher: ComprobanteLeido;
      /** La del motor (0–100): avisa, no decide. */
      confianza: number;
      /** Lo que se puso en el alta, en una línea cada uno. */
      puestos: string[];
      avisos: string[];
      persona: PersonaLeida | null;
      miniatura: string;
      /** El monto como quedó escrito: mientras siga igual, el campo dice «de la foto». */
      montoPuesto: string;
    }
  | { fase: "sin-monto"; confianza: number; texto: string; miniatura: string }
  | { fase: "error"; mensaje: string };

type Antes = Pick<AltaAdelanto, "monto" | "moneda" | "fecha" | "metodoCaja" | "notas" | "comprobante" | "beneficiarioId">;

/**
 * (10-10, Ley 29733) La foto del voucher NO se sube acá: queda en el navegador
 * (data URL) como la de la cámara, y al guardar va PRIVADA a la carpeta del
 * adelanto (`use-guardar-alta`). Antes iba a `/api/upload`, el bucket público.
 */
async function subirFoto(archivo: File): Promise<string> {
  const r = await leerAdjuntoLocal(archivo);
  if (!r.ok) throw new Error(r.error);
  return r.dataUrl;
}

export function useLeerVoucher(alta: AltaAdelanto, beneficiarios: readonly BeneficiarioConSaldo[]) {
  const [estado, setEstado] = useState<EstadoVoucher>({ fase: "inactivo" });
  /* El OCR tarda segundos: al terminar se usa el alta de ESE momento (la persona pudo cambiar). */
  const altaRef = useRef(alta);
  altaRef.current = alta;
  const personasRef = useRef(beneficiarios);
  personasRef.current = beneficiarios;
  const antes = useRef<Antes | null>(null);
  /** La línea que puso el voucher en la nota: leer otro la reemplaza en vez de sumarse. */
  const lineaNota = useRef<string | null>(null);
  const miniaturaRef = useRef<string | null>(null);

  const soltarMiniatura = useCallback(() => {
    if (miniaturaRef.current) URL.revokeObjectURL(miniaturaRef.current);
    miniaturaRef.current = null;
  }, []);
  /* El worker del OCR pesa ~50 MB: se suelta con el alta. */
  useEffect(() => () => { soltarMiniatura(); void liberarOcr(); }, [soltarMiniatura]);

  const leer = useCallback(async (archivo: File) => {
    if (!archivo.type.startsWith("image/")) {
      setEstado({ fase: "error", mensaje: "Elige una imagen (la captura del Yape o de la transferencia): un PDF o un video no se pueden leer acá." });
      return;
    }
    soltarMiniatura();
    const miniatura = URL.createObjectURL(archivo);
    miniaturaRef.current = miniatura;
    setEstado({ fase: "leyendo", progreso: null, miniatura });
    const hoy = HOY();
    const progreso = (p: ProgresoOcr) => setEstado({ fase: "leyendo", progreso: p, miniatura });
    let texto: string;
    let confianza: number;
    let v: ComprobanteLeido;
    try {
      /* La captura del celular es UNA columna con el monto enorme: leída como
         página, el motor se saltaba «S/ 500». Si así no sale el monto (una
         transferencia en dos columnas), se lee otra vez como página. */
      ({ texto, confianza } = await leerTextoDeImagen(archivo, progreso, { columna: true }));
      v = leerComprobante(texto, { hoy });
      if (v.monto == null) {
        const pagina = await leerTextoDeImagen(archivo, progreso);
        const otra = leerComprobante(pagina.texto, { hoy });
        if (otra.monto != null) ({ texto, confianza, v } = { texto: pagina.texto, confianza: pagina.confianza, v: otra });
      }
    } catch (e) {
      logger.error("[adelantos] no se pudo leer el voucher", { error: String(e) });
      setEstado({ fase: "error", mensaje: "No pude leer la imagen. Prueba con la captura de pantalla original (no una foto de otra pantalla) o escribe el monto a mano." });
      return;
    }
    if (v.monto == null) {
      setEstado({ fase: "sin-monto", confianza: Math.round(confianza), texto, miniatura });
      return;
    }

    const a = altaRef.current;
    antes.current = { monto: a.monto, moneda: a.moneda, fecha: a.fecha, metodoCaja: a.metodoCaja, notas: a.notas, comprobante: a.comprobante, beneficiarioId: a.beneficiarioId };
    const puestos: string[] = [];
    const avisos: string[] = [];

    /* La dirección no se cambia sola (cambia la caja y lo que se debe): se avisa. */
    const recibido = a.def.caja === "ingreso";
    if (v.sentido === "recibido" && !recibido) avisos.push("Esta captura es de plata que TE LLEGÓ: si te pagaron o te prestaron, elige arriba quién puso la plata.");
    if (v.sentido === "enviado" && recibido) avisos.push("Esta captura es de plata que SALIÓ de tu cuenta: si le diste plata, elige arriba «Doy plata».");

    const montoPuesto = v.monto.toFixed(2);
    a.setMonto(montoPuesto);
    if (a.modo !== "abono") a.setMoneda(v.moneda);
    else if (v.moneda !== a.moneda) avisos.push(`La captura está en ${v.moneda === "USD" ? "dólares" : "soles"} y lo que te debe, en ${a.moneda === "USD" ? "dólares" : "soles"}: revisa.`);
    puestos.push(`Monto ${fmtMon(v.monto, v.moneda)}`);

    if (v.fecha && v.fecha > hoy) {
      avisos.push(`La fecha leída (${diaLegibleVoucher(v.fecha)}) es posterior a hoy: no la puse.`);
    } else if (v.fecha) {
      /* setFecha ya pone «No mover la caja» si es de otro día. */
      a.setFecha(v.fecha);
      puestos.push(`Fecha ${diaLegibleVoucher(v.fecha)}${v.hora ? ` ${v.hora}` : ""}`);
    }
    /* Pagado hoy por Yape/Plin/banco: la caja va por ese medio. De otro día no se toca. */
    const medio = metodoDeVoucher(v.app);
    if (medio && (v.fecha ?? hoy) === hoy) {
      a.setMetodoCaja(medio);
      puestos.push(`Caja: ${etiquetaApp(v.app)}${medio === "transferencia" ? " (transferencia)" : ""}`);
    }

    /* La persona: elegida si calza una; si no, el aviso pregunta o la ofrece crear. */
    const persona = personaDelNombre(v.nombre, personasRef.current);
    if (persona?.tipo === "una") {
      if (persona.id !== a.beneficiarioId) a.setBeneficiarioId(persona.id);
      puestos.push(`Persona: ${persona.nombre}`);
    } else if (soltarLaElegida(persona, a.beneficiarioId)) {
      a.setBeneficiarioId("");
    }

    const linea = notaDeVoucher({ ...v, destinatario: v.nombre });
    const previa = lineaNota.current;
    a.setNotas((n) => {
      const base = previa && n.includes(previa) ? n.replace(previa, "").replace(/^\s*·\s*|\s*·\s*$/g, "").trim() : n.trim();
      return base ? `${base} · ${linea}` : linea;
    });
    lineaNota.current = linea;
    puestos.push(`Nota «${linea}»`);
    if (!v.operacion) avisos.push("No encontré el N° de operación: cópialo a la nota si lo ves.");

    /* La foto, por el mismo camino que «Adjuntar archivo». */
    if (a.modo === "abono" && a.abono.sinFoto) {
      avisos.push("Repartido entre varios, la foto no se guarda: elige «Elegir uno» si quieres adjuntarla.");
    } else {
      try {
        a.setComprobante(await subirFoto(archivo));
        puestos.push(a.comprobante ? "Foto: reemplazó la que estaba en Respaldo" : "Foto adjunta en Respaldo");
      } catch (e) {
        logger.error("[adelantos] no se pudo subir la foto del voucher", { error: String(e) });
        avisos.push("No pude adjuntar la foto: súbela en «Respaldo» con «Adjuntar archivo».");
      }
    }

    setEstado({ fase: "leido", voucher: v, confianza: Math.round(confianza), puestos, avisos, persona, miniatura, montoPuesto });
  }, [soltarMiniatura]);

  /** Un toque en «¿Cuál es?» o la persona recién creada: queda elegida y el aviso lo dice. */
  const elegirPersona = useCallback((id: string, nombre: string) => {
    altaRef.current.setBeneficiarioId(id);
    setEstado((e) => (e.fase === "leido" && e.persona ? { ...e, persona: { tipo: "una", dicho: e.persona.dicho, id, nombre } } : e));
  }, []);

  /** Vuelve los campos a como estaban antes de leer el voucher. */
  const deshacer = useCallback(() => {
    const a = altaRef.current;
    const p = antes.current;
    if (p) {
      a.setMonto(p.monto);
      a.setMoneda(p.moneda as "PEN" | "USD");
      a.setFecha(p.fecha);
      a.setMetodoCaja(p.metodoCaja);
      a.setNotas(p.notas);
      a.setComprobante(p.comprobante);
      a.setBeneficiarioId(p.beneficiarioId);
    }
    antes.current = null;
    lineaNota.current = null;
    soltarMiniatura();
    setEstado({ fase: "inactivo" });
  }, [soltarMiniatura]);

  /** Cierra el aviso; lo puesto se queda. */
  const cerrar = useCallback(() => {
    antes.current = null;
    soltarMiniatura();
    setEstado({ fase: "inactivo" });
  }, [soltarMiniatura]);

  return { estado, leer, elegirPersona, deshacer, cerrar };
}

export type LeerVoucher = ReturnType<typeof useLeerVoucher>;
