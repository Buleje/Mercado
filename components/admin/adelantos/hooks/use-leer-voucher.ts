"use client";

/**
 * «Leer voucher» del alta de adelanto: la captura de Yape, Plin o de una
 * transferencia → OCR en el navegador → PRELLENA monto, fecha, caja y nota, y
 * adjunta la foto como comprobante (el mismo `/api/upload` → `comprobanteUrl`
 * de «Adjuntar archivo»: no hay schema nuevo).
 *
 * NUNCA guarda: deja todo marcado «leído del voucher — revisa» y la persona
 * confirma con el botón de siempre. Si no encuentra el monto no toca nada y lo
 * dice. «Deshacer» vuelve los campos a como estaban antes de leer.
 *
 * No decide la dirección (dado / recibido) ni la persona: el nombre del voucher
 * sólo avisa si no se parece al de la persona elegida al dar plata.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { leerTextoDeImagen, liberarOcr, type ProgresoOcr } from "@/lib/ocr/ocr-navegador";
import { diaLegibleVoucher, etiquetaApp, leerVoucher, metodoDeVoucher, nombresSeParecen, notaDeVoucher, type VoucherLeido } from "@/lib/adelantos/voucher";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { fmtMon } from "../shared";
import { HOY } from "../crear-adelanto/campos-monto";
import type { AltaAdelanto } from "./use-alta-adelanto";

export type EstadoVoucher =
  | { fase: "inactivo" }
  | { fase: "leyendo"; progreso: ProgresoOcr | null; miniatura: string }
  | {
      fase: "leido";
      voucher: VoucherLeido;
      /** La del motor (0–100): avisa, no decide. */
      confianza: number;
      /** Lo que se puso en el alta, en una línea cada uno. */
      puestos: string[];
      avisos: string[];
      miniatura: string;
      /** El monto como quedó escrito: mientras siga igual, el campo dice «del voucher». */
      montoPuesto: string;
    }
  | { fase: "sin-monto"; confianza: number; texto: string; miniatura: string }
  | { fase: "error"; mensaje: string };

type Antes = Pick<AltaAdelanto, "monto" | "moneda" | "fecha" | "metodoCaja" | "notas" | "comprobante">;

async function subirFoto(archivo: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", archivo);
  fd.append("folder", "media");
  const r = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
  const j = await leerJson<{ url?: string; error?: string }>(r);
  if (!r.ok || !j?.url) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j.url;
}

export function useLeerVoucher(alta: AltaAdelanto) {
  const [estado, setEstado] = useState<EstadoVoucher>({ fase: "inactivo" });
  /* El OCR tarda segundos: al terminar se usa el alta de ESE momento (la persona pudo cambiar). */
  const altaRef = useRef(alta);
  altaRef.current = alta;
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
      setEstado({ fase: "error", mensaje: "Elige una imagen (la captura del voucher): un PDF o un video no se pueden leer acá." });
      return;
    }
    soltarMiniatura();
    const miniatura = URL.createObjectURL(archivo);
    miniaturaRef.current = miniatura;
    setEstado({ fase: "leyendo", progreso: null, miniatura });
    let texto: string;
    let confianza: number;
    try {
      ({ texto, confianza } = await leerTextoDeImagen(archivo, (p) => setEstado({ fase: "leyendo", progreso: p, miniatura })));
    } catch (e) {
      logger.error("[adelantos] no se pudo leer el voucher", { error: String(e) });
      setEstado({ fase: "error", mensaje: "No pude leer la imagen. Prueba con la captura de pantalla original (no una foto de otra pantalla) o escribe el monto a mano." });
      return;
    }
    const hoy = HOY();
    const v = leerVoucher(texto, { hoy });
    if (v.monto == null) {
      setEstado({ fase: "sin-monto", confianza: Math.round(confianza), texto, miniatura });
      return;
    }

    const a = altaRef.current;
    antes.current = { monto: a.monto, moneda: a.moneda, fecha: a.fecha, metodoCaja: a.metodoCaja, notas: a.notas, comprobante: a.comprobante };
    const puestos: string[] = [];
    const avisos: string[] = [];

    const montoPuesto = v.monto.toFixed(2);
    a.setMonto(montoPuesto);
    if (a.modo !== "abono") a.setMoneda(v.moneda);
    else if (v.moneda !== a.moneda) avisos.push(`El voucher está en ${v.moneda === "USD" ? "dólares" : "soles"} y lo que te debe, en ${a.moneda === "USD" ? "dólares" : "soles"}: revisa.`);
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

    const linea = notaDeVoucher(v);
    const previa = lineaNota.current;
    a.setNotas((n) => {
      const base = previa && n.includes(previa) ? n.replace(previa, "").replace(/^\s*·\s*|\s*·\s*$/g, "").trim() : n.trim();
      return base ? `${base} · ${linea}` : linea;
    });
    lineaNota.current = linea;
    puestos.push(`Nota «${linea}»`);

    if (a.modo === "dar" && v.destinatario && a.persona && !nombresSeParecen(v.destinatario, a.persona.nombre)) {
      avisos.push(`El voucher va para «${v.destinatario}» y elegiste a «${a.persona.nombre}»: revisa la persona.`);
    }
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

    setEstado({ fase: "leido", voucher: v, confianza: Math.round(confianza), puestos, avisos, miniatura, montoPuesto });
  }, [soltarMiniatura]);

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

  return { estado, leer, deshacer, cerrar };
}

export type LeerVoucher = ReturnType<typeof useLeerVoucher>;
