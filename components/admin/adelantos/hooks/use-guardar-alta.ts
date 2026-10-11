"use client";

/**
 * Guardar el alta de «Nuevo adelanto» y lo que pasa después (ADR-448).
 *
 * Aparte del estado del formulario porque acá viven las reglas que protegen la
 * plata, y cada una se ganó con un caso de la revisión del 28-09:
 *
 *  - Una clave por intento (`idempotencyKey`) en los tres endpoints. Se cambia
 *    SÓLO ante un 4xx: ante un corte o un 5xx el alta pudo quedar guardada.
 *  - `repetido`: el servidor devolvió lo que ya estaba (el mismo intento llegó
 *    dos veces). Se dice «ya estaba registrado ADL-X por S/ 500», no se cierra
 *    como si fuera nuevo.
 *  - Si lo que falló son los campos propios, el adelanto ya existe: el aviso va
 *    a `err` y el botón REINTENTA sólo los campos (`adelantoCreadoRef`), nunca
 *    vuelve a dar la plata.
 *  - `registrado`: quedó algo guardado. Cerrar con la X o Escape tiene que
 *    recargar la lista; si no, se vuelve a cargar y queda duplicado.
 *  - (ADR-491 V) La foto tomada con la cámara en el alta llega como data URL (no
 *    se subió): no viaja en el alta; con el adelanto ya creado va PRIVADA por
 *    `POST /api/adelantos/<id>/voucher`. En un abono va privada por
 *    `POST …/adjunto` (10-10). «Adjuntar archivo» igual, foto o PDF.
 */

import { useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { archivoDeLocal, esAdjuntoLocal, subirAdjuntoPrivado } from "@/lib/adelantos/adjunto-local";
import { leerJson } from "@/lib/errores/sin-dato";
import { idAleatorio } from "@/lib/id-aleatorio";
import { logger } from "@/lib/logger";
import type { IntencionLiquidacion } from "@/lib/cuentas/liquidacion";
import {
  guardarValoresPendientes as guardarCamposPendientes,
  hayPendientes,
  type PendientesCampos,
} from "@/components/admin/shared/CamposPersonalizados";
import { fmtMon } from "../shared";
import { INTENTO_DISTINTO, abonarAUno, abonarRepartido, crearAdelanto, puedeCambiarDeClave, type Envio } from "./enviar-alta";

export type EnvioAlta =
  | { tipo: "adelanto"; body: Record<string, unknown>; esperaRecibido: boolean; moverCaja: boolean }
  | { tipo: "abono-uno"; adelantoId: string; body: Record<string, unknown>; moverCaja: boolean }
  | { tipo: "abono-repartido"; beneficiarioId: string; intencion: IntencionLiquidacion; moverCaja: boolean };

const SIN_CAJA = "No había caja abierta: la plata no se anotó en la caja. Anótala a mano.";
const FOTO_NO_GUARDADA = "La foto del comprobante no se guardó (el adelanto sí): guarda el papel y vuelve a tomarle la foto más tarde.";

/** La foto o el PDF que todavía está sólo en el navegador (la cámara y «Adjuntar archivo» no suben). */
const esFotoLocal = esAdjuntoLocal;

/** El alta sin la foto local: el data URL no va en el JSON del alta (y el servidor pide una URL). */
function sinFotoLocal(body: Record<string, unknown>): Record<string, unknown> {
  if (!esFotoLocal(body.comprobanteUrl)) return body;
  const resto = { ...body };
  delete resto.comprobanteUrl;
  return resto;
}

/** ADR-491 V: la foto del alta, PRIVADA en la carpeta del adelanto. Dos intentos; `null` = quedó (o ya tenía una). */
async function guardarVoucher(adelantoId: string, local: string): Promise<string | null> {
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const fd = new FormData();
      fd.append("file", await archivoDeLocal(local, "voucher"));
      const res = await fetch(`/api/adelantos/${encodeURIComponent(adelantoId)}/voucher`, { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      /* 409 `cambio`: el adelanto ya tenía foto (un alta repetida): no se pisa. */
      if (res.ok || res.status === 409) return null;
      const j = await leerJson<{ error?: string }>(res);
      logger.warn("[adelantos] el voucher del alta no se guardó", { status: res.status, error: j?.error });
      if (res.status < 500) return FOTO_NO_GUARDADA;
    } catch (e) {
      logger.error("[adelantos] el voucher del alta no se guardó", { error: String(e), intento });
    }
  }
  return FOTO_NO_GUARDADA;
}

/**
 * El comprobante de un abono (una entrega del adelanto), PRIVADO (10-10, Ley
 * 29733): antes iba a `/api/upload` (bucket público). Se sube a la carpeta del
 * adelanto antes de registrar el abono y el abono guarda `priv:<ruta>`.
 */
async function subirFotoLocal(adelantoId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!esFotoLocal(body.comprobanteUrl)) return body;
  try {
    const r = await subirAdjuntoPrivado(adelantoId, await archivoDeLocal(body.comprobanteUrl, `comprobante-${Date.now()}`));
    if (r.ok) return { ...body, comprobanteUrl: r.comprobanteUrl };
    logger.warn("[adelantos] la foto del abono no se guardó", { error: r.error });
  } catch (e) {
    logger.error("[adelantos] no se pudo subir la foto del abono", { error: String(e) });
  }
  return sinFotoLocal(body);
}

export function useGuardarAlta({
  camposPendientes,
  onCreated: avisarCreado,
}: {
  camposPendientes: PendientesCampos;
  /** Con el id del adelanto creado; `null` en un abono (no hay adelanto nuevo). */
  onCreated: (adelantoId: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Guardado, con algo que leer antes de cerrar. */
  const [hecho, setHecho] = useState<string | null>(null);
  const [camposPorReintentar, setCamposPorReintentar] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const adelantoCreadoRef = useRef<string | null>(null);
  const onCreated = () => avisarCreado(adelantoCreadoRef.current);
  const clave = useRef<string>("");
  if (!clave.current) clave.current = idAleatorio();

  const guardarCampos = async (id: string): Promise<string | null> => {
    if (!hayPendientes(camposPendientes)) return null;
    const rc = await guardarCamposPendientes(id, camposPendientes);
    return rc.errores.length > 0
      ? `Quedó registrado, pero sus campos personalizados no: ${rc.errores.join(" · ")}. Aprieta «Reintentar los campos».`
      : null;
  };

  /** Un error del servidor: la clave cambia sólo si dijo que NO guardó. */
  const fallo = (r: Extract<Envio<unknown>, { ok: false }>) => {
    if (r.codigo === "idempotencia_distinta") {
      setRegistrado(true);
      setHecho(INTENTO_DISTINTO);
      return;
    }
    if (puedeCambiarDeClave(r)) clave.current = idAleatorio();
    setErr(r.error);
  };

  /** Lo que sigue a un guardado: avisos para leer, o cerrar. */
  const terminar = (avisos: (string | null | false | undefined)[]) => {
    const lista = avisos.filter((x): x is string => !!x);
    if (lista.length) setHecho(lista.join(" "));
    else onCreated();
  };

  const ejecutar = async (e: EnvioAlta) => {
    setErr(null);
    setSaving(true);
    try {
      if (e.tipo === "adelanto") {
        const enviado = Number(e.body.montoAdelantado) || 0;
        const fotoLocal = esFotoLocal(e.body.comprobanteUrl) ? e.body.comprobanteUrl : null;
        const r = await crearAdelanto({ ...sinFotoLocal(e.body), idempotencyKey: clave.current });
        if (!r.ok) return fallo(r);
        setRegistrado(true);
        const id = r.data.id ?? null;
        if (id) adelantoCreadoRef.current = id;
        const repetido = r.data.repetido
          ? `Ya estaba registrado ${r.data.codigoOperacion ?? "ese adelanto"} por ${fmtMon(Number(r.data.montoAdelantado) || 0, String(e.body.moneda ?? "PEN"))}: no se volvió a dar la plata.${
              Math.abs((Number(r.data.montoAdelantado) || 0) - enviado) > 0.005 ? " El monto nuevo no se guardó." : ""
            }`
          : null;
        const avisoCampos = id
          ? await guardarCampos(id)
          : hayPendientes(camposPendientes)
            ? "Quedó registrado, pero el servidor no devolvió su número: los campos personalizados no se guardaron."
            : null;
        if (avisoCampos && id) {
          setErr(avisoCampos);
          setCamposPorReintentar(true);
        }
        const avisoFoto = id && fotoLocal ? await guardarVoucher(id, fotoLocal) : fotoLocal ? FOTO_NO_GUARDADA : null;
        const otros = [
          repetido,
          avisoFoto,
          e.esperaRecibido && r.data.direccion !== "RECIBIDO" && "Ojo: el servidor lo guardó como plata que diste. Corrígelo desde su ficha.",
          e.moverCaja && r.data.caja?.sinCaja && SIN_CAJA,
          avisoCampos && !id && avisoCampos,
        ];
        if (avisoCampos && id) {
          const lista = otros.filter((x): x is string => !!x);
          if (lista.length) setHecho(lista.join(" "));
          return;
        }
        return terminar(otros);
      }
      const r =
        e.tipo === "abono-uno"
          ? await abonarAUno(e.adelantoId, { ...(await subirFotoLocal(e.adelantoId, e.body)), idempotencyKey: clave.current })
          : await abonarRepartido(e.beneficiarioId, e.intencion, clave.current);
      if (!r.ok) return fallo(r);
      setRegistrado(true);
      const sinCaja = "sinCaja" in r.data ? r.data.sinCaja : r.data.caja?.sinCaja;
      terminar([r.data.repetido && "Ese abono ya estaba registrado: no se volvió a anotar.", e.moverCaja && sinCaja && SIN_CAJA]);
    } finally {
      setSaving(false);
    }
  };

  /**
   * El botón después de guardar: si fallaron los campos propios, los reintenta
   * (sin volver a crear el adelanto); si hay un aviso leído, cierra.
   */
  const continuar = async (): Promise<boolean> => {
    const id = adelantoCreadoRef.current;
    if (camposPorReintentar && id) {
      setErr(null);
      setSaving(true);
      const aviso = await guardarCampos(id);
      setSaving(false);
      if (aviso) { setErr(aviso); return true; }
      setCamposPorReintentar(false);
      if (!hecho) onCreated();
      return true;
    }
    if (hecho) { onCreated(); return true; }
    return false;
  };

  return { saving, err, setErr, hecho, registrado, camposPorReintentar, ejecutar, continuar };
}
