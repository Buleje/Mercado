"use client";

/**
 * El estado y el guardado de «Firmar recibo» (08-10 → ADR-491).
 *
 * Guardar = `POST /api/adelantos/<id>/firmas` (multipart: `datos` + la firma en
 * PNG + la foto de la huella si la hay). El servidor la AGREGA al registro de
 * firmas: firmar de nuevo no borra la anterior, queda abajo como reemplazada.
 * Ya no se arma la hoja para guardarla ni se toca la foto del comprobante
 * (antes la firma pisaba al voucher en la misma columna y no quedaba rastro).
 * Después baja el recibo en PDF leído del registro, con la hora que quedó.
 *
 * Una clave por intento (`idempotencyKey`): ante un corte se reintenta con la
 * misma y el servidor devuelve la que ya guardó (200 `repetido`); cambia sólo
 * cuando el servidor dijo que NO guardó (4xx) o tras guardar. Nada de esto toca
 * plata, saldo ni caja.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { leerMembrete } from "@/lib/admin/membrete-cliente";
import { descargarComprobante } from "@/lib/adelantos/comprobante";
import { VERSION_CONSENTIMIENTO_HUELLA, type ImagenGuardada } from "@/lib/adelantos/entregar-tipos";
import { FirmarDatosSchema } from "@/lib/adelantos/entregar-schema";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { fechaHoraLima, limpiarDocumento, lineasHojaFirmada, validarFirmante, type LineasHoja } from "@/lib/adelantos/recibo-firmado";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { leerJson, sinDato } from "@/lib/errores/sin-dato";
import { esFirmaSuficiente, type Trazo } from "@/lib/firma/trazos";
import { idAleatorio } from "@/lib/id-aleatorio";
import { logger } from "@/lib/logger";
import { datosDelComprobante, imprimirComprobante } from "../detalle/comprobante-del-adelanto";
import { firmaEnCanvas } from "./hoja-firma";

/** Un error que se muestra tal cual: los demás dicen «revisa la conexión». */
class AvisoFirma extends Error {}

export type FaseFirma = "firmando" | "guardando" | "guardado";

type RespuestaFirmas = { firma?: ImagenGuardada; huella?: ImagenGuardada | null; repetido?: boolean; error?: string; message?: string; code?: string };

function firmaPng(trazos: readonly Trazo[]): Promise<Blob | null> {
  return new Promise((resolve) => firmaEnCanvas(trazos, 900, 300).toBlob((b) => resolve(b), "image/png"));
}

/** Lo que dijo el servidor, en una frase; los códigos sueltos («forbidden») no se muestran. */
function mensajeDe(status: number, j: RespuestaFirmas | null): string {
  const frase = [j?.message, j?.error].find((t) => !!t && /\s/.test(t));
  if (frase) return frase;
  if (status === 403) return "Tu rol no puede firmar adelantos: pídeselo al dueño o a un administrador.";
  return "No se pudo guardar la firma. Prueba de nuevo.";
}

export function useFirmarRecibo({
  adelantoId,
  adelanto,
  onGuardado,
}: {
  adelantoId: string;
  /** La ficha ya lo tiene; el alta recién creada, no (se lee acá). */
  adelanto?: DbAdelanto | null;
  onGuardado?: () => void;
}) {
  const [a, setA] = useState<DbAdelanto | null>(adelanto ?? null);
  const [noCargo, setNoCargo] = useState(false);
  const [negocio, setNegocio] = useState<string | null>(null);
  const [nombre, setNombre] = useState(adelanto?.beneficiario?.nombre ?? "");
  const [documento, setDocumento] = useState(limpiarDocumento(adelanto?.beneficiario?.documento));
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  /** La foto de la huella (opcional) y el «acepto» de la persona (Ley 29733). */
  const [huella, setHuella] = useState<Blob | null>(null);
  const [consentido, setConsentido] = useState(false);
  const [fase, setFase] = useState<FaseFirma>("firmando");
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [huellaGuardada, setHuellaGuardada] = useState(false);
  const clave = useRef("");
  if (!clave.current) clave.current = idAleatorio();

  useEffect(() => {
    let vivo = true;
    void leerMembrete().then((m) => vivo && setNegocio(m.nombre?.trim() || null));
    if (!adelanto) {
      void (async () => {
        const res = await fetch(`/api/adelantos/${adelantoId}`, { credentials: "include" }).catch(sinDato("adelanto para firmar"));
        const j = res?.ok ? await leerJson<DbAdelanto>(res) : null;
        if (!vivo) return;
        if (!j) return setNoCargo(true);
        setA(j);
        setNombre(j.beneficiario?.nombre ?? "");
        setDocumento(limpiarDocumento(j.beneficiario?.documento));
      })();
    }
    return () => {
      vivo = false;
    };
  }, [adelantoId, adelanto]);

  const lineas = useCallback(
    (fechaHora: string, negocioDado?: string | null): LineasHoja | null => {
      if (!a) return null;
      const { direccion, concepto } = leerDireccion(a);
      return lineasHojaFirmada({
        codigoOperacion: a.codigoOperacion,
        negocio: negocioDado ?? negocio,
        persona: a.beneficiario?.nombre ?? "—",
        monto: a.montoAdelantado,
        moneda: a.moneda,
        direccion,
        conceptoRecibido: concepto,
        firmante: { nombre, documento },
        fechaHora,
      });
    },
    [a, negocio, nombre, documento],
  );

  const falta = useMemo(
    () =>
      validarFirmante({ nombre, documento }) ??
      (esFirmaSuficiente(trazos) ? null : "Falta la firma: que la persona firme en el recuadro.") ??
      (huella && !consentido ? "Para guardar la huella, marca que la persona acepta el aviso (o quita la foto)." : null),
    [nombre, documento, trazos, huella, consentido],
  );

  const guardar = async () => {
    setIntentado(true);
    if (falta || !a) return;
    setError(null);
    setFase("guardando");
    const conHuella = !!huella && consentido;
    try {
      const v = FirmarDatosSchema.safeParse({
        firmante: { nombre: nombre.trim(), documento: limpiarDocumento(documento) },
        trazos,
        idempotencyKey: clave.current,
        ...(conHuella ? { consentimientoHuella: VERSION_CONSENTIMIENTO_HUELLA } : {}),
      });
      if (!v.success) throw new AvisoFirma(v.error.issues[0]?.message ?? "Revisa el nombre y el DNI de quien firma.");
      setPaso("Guardando la firma…");
      const png = await firmaPng(trazos);
      if (!png) throw new AvisoFirma("No se pudo leer la firma del recuadro. Intenta de nuevo.");
      /* Sin `Content-Type`: el navegador pone el `boundary` del multipart. */
      const fd = new FormData();
      fd.append("datos", JSON.stringify(v.data));
      fd.append("firma", new File([png], "firma.png", { type: "image/png" }));
      if (conHuella && huella) fd.append("huella", new File([huella], "huella.jpg", { type: huella.type || "image/jpeg" }));
      const res = await fetch(`/api/adelantos/${encodeURIComponent(a.id)}/firmas`, { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await leerJson<RespuestaFirmas>(res);
      if (!res.ok || !j?.firma?.guardada) {
        /* 4xx = no guardó nada: el próximo intento es otro. 5xx o corte: la misma clave. */
        if (res.status >= 400 && res.status < 500) clave.current = idAleatorio();
        throw new AvisoFirma(mensajeDe(res.status, j));
      }
      clave.current = idAleatorio();
      setHuellaGuardada(!!j.huella?.guardada);
      setFase("guardado");
      onGuardado?.();

      setPaso("Bajando el recibo…");
      await imprimirComprobante(a).catch((e: unknown) => {
        logger.error("[adelantos] el recibo firmado no bajó", { error: String(e) });
        setError("La firma quedó guardada, pero el PDF no bajó: aprieta «Bajar el recibo».");
      });
    } catch (e) {
      if (!(e instanceof AvisoFirma)) logger.error("[adelantos] no se pudo guardar la firma", { error: String(e) });
      setError(e instanceof AvisoFirma ? e.message : "No se pudo guardar la firma. Revisa la conexión e intenta de nuevo.");
      setFase("firmando");
    } finally {
      setPaso(null);
    }
  };

  /** Ya guardada: el recibo leído del registro (la firma y la hora que quedaron). */
  const bajarGuardado = async () => {
    if (!a) return;
    setError(null);
    await imprimirComprobante(a).catch((e: unknown) => {
      logger.error("[adelantos] el recibo firmado no bajó", { error: String(e) });
      setError("No se pudo armar el PDF. Intenta de nuevo.");
    });
  };

  /** Sin guardar: el papel con la firma, para imprimir o mandar (la huella no viaja: no hay aviso aceptado guardado). */
  const bajarSinGuardar = async () => {
    setIntentado(true);
    if (falta || !a) return;
    setError(null);
    await descargarComprobante({
      ...datosDelComprobante(a, negocio),
      firma: {
        imagen: firmaEnCanvas(trazos, 900, 300).toDataURL("image/png"),
        relacion: 3,
        nombre: nombre.trim(),
        documento: limpiarDocumento(documento),
        fechaHora: fechaHoraLima(new Date()),
      },
    }).catch((e: unknown) => {
      logger.error("[adelantos] el recibo firmado no bajó", { error: String(e) });
      setError("No se pudo armar el PDF. Intenta de nuevo.");
    });
  };

  return {
    a, noCargo, negocio, lineas, nombre, setNombre, documento, setDocumento, trazos, setTrazos,
    huella, setHuella, consentido, setConsentido, huellaGuardada,
    fase, paso, error, falta: intentado ? falta : null, listo: !falta, guardar, bajarGuardado, bajarSinGuardar,
  };
}

export type FirmarRecibo = ReturnType<typeof useFirmarRecibo>;
