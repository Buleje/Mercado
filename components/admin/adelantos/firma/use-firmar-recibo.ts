"use client";

/**
 * El estado y el guardado de «Firmar recibo» (08-10).
 *
 * Guardar = armar la hoja (foto que ya había + firma + monto + quién y cuándo)
 * → mandarla como ARCHIVO en el PATCH `adjuntarComprobante` (el servidor
 * valida, la sube a la carpeta PRIVADA del adelanto y hace compara-y-cambia
 * contra la foto que se vio; Ley 29733: DNI + firma no van al bucket público)
 * → bajar el recibo en PDF con la firma en su línea. Nada de esto toca plata,
 * saldo ni caja.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { leerMembrete } from "@/lib/admin/membrete-cliente";
import { descargarComprobante } from "@/lib/adelantos/comprobante";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { esReciboFirmado, fechaHoraLima, limpiarDocumento, lineasHojaFirmada, srcDelComprobante, validarFirmante, type LineasHoja } from "@/lib/adelantos/recibo-firmado";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { leerJson, sinDato } from "@/lib/errores/sin-dato";
import { esFirmaSuficiente, type Trazo } from "@/lib/firma/trazos";
import { logger } from "@/lib/logger";
import { datosDelComprobante } from "../detalle/comprobante-del-adelanto";
import { cargarImagen, componerHoja, firmaEnCanvas } from "./hoja-firma";

/** Un error que se muestra tal cual: los demás dicen «revisa la conexión». */
class AvisoFirma extends Error {}

export type FaseFirma = "firmando" | "guardando" | "guardado";

export function useFirmarRecibo({
  adelantoId,
  adelanto,
  onGuardado,
}: {
  adelantoId: string;
  /** La ficha ya lo tiene; el alta recién creada, no (se lee acá). */
  adelanto?: DbAdelanto | null;
  onGuardado?: (url: string) => void;
}) {
  const [a, setA] = useState<DbAdelanto | null>(adelanto ?? null);
  const [noCargo, setNoCargo] = useState(false);
  const [negocio, setNegocio] = useState<string | null>(null);
  const [nombre, setNombre] = useState(adelanto?.beneficiario?.nombre ?? "");
  const [documento, setDocumento] = useState(limpiarDocumento(adelanto?.beneficiario?.documento));
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [fase, setFase] = useState<FaseFirma>("firmando");
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  /** La hora con la que quedó guardada: el PDF de «Bajar otra vez» dice la misma. */
  const [firmadoEl, setFirmadoEl] = useState<string | null>(null);

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
    () => validarFirmante({ nombre, documento }) ?? (esFirmaSuficiente(trazos) ? null : "Falta la firma: que la persona firme en el recuadro."),
    [nombre, documento, trazos],
  );

  const bajarRecibo = useCallback(
    async (fechaHora: string, negocioDado?: string | null) => {
      if (!a) return;
      await descargarComprobante({
        ...datosDelComprobante(a, negocioDado ?? negocio),
        firma: {
          imagen: firmaEnCanvas(trazos, 900, 300).toDataURL("image/png"),
          relacion: 3,
          nombre: nombre.trim(),
          documento: limpiarDocumento(documento),
          fechaHora,
        },
      });
    },
    [a, negocio, trazos, nombre, documento],
  );

  const guardar = async () => {
    setIntentado(true);
    if (falta || !a) return;
    setError(null);
    setFase("guardando");
    const ahora = fechaHoraLima(new Date());
    const anterior = a.comprobanteUrl ?? null;
    try {
      setPaso("Armando la hoja firmada…");
      /* La primera vez la ruta del membrete puede tardar: sin esperarla, la hoja
         guardada decía «Dio: —» (QA 08-10). Si no responde, va «—» igual. */
      const elNegocio = negocio ?? ((await leerMembrete()).nombre?.trim() || null);
      let foto: HTMLImageElement | null = null;
      const srcAnterior = srcDelComprobante(a);
      if (srcAnterior) {
        foto = await cargarImagen(srcAnterior).catch((e: unknown) => {
          logger.error("[adelantos] no se pudo leer la foto anterior para la firma", { error: String(e) });
          throw new AvisoFirma("No pude abrir la foto que ya tiene el adelanto para juntarla con la firma. Intenta de nuevo o baja el recibo sin guardar.");
        });
      }
      const textos = lineas(ahora, elNegocio);
      if (!textos) throw new AvisoFirma("Todavía no cargó el adelanto: espera un segundo.");
      const hoja = await componerHoja({ trazos, lineas: textos, fotoAnterior: foto, anteriorEsFirma: esReciboFirmado(anterior) });

      setPaso("Guardándola en el adelanto…");
      /* Sin `Content-Type`: el navegador pone el `boundary` del multipart. */
      const fd = new FormData();
      fd.append("action", "adjuntarComprobante");
      fd.append("anterior", anterior ?? "");
      fd.append("file", new File([hoja], "recibo-firmado.jpg", { type: hoja.type || "image/jpeg" }));
      const res = await fetch(`/api/adelantos/${a.id}`, { method: "PATCH", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await leerJson<{ comprobanteUrl?: string; error?: string; message?: string }>(res);
      if (!res.ok || !j?.comprobanteUrl) {
        throw new AvisoFirma(res.status === 403 ? "Tu rol no puede cambiar adelantos: pídeselo al dueño o a un administrador." : (j?.message ?? j?.error ?? "No se pudo guardar la firma en el adelanto."));
      }
      setFirmadoEl(ahora);
      setFase("guardado");
      onGuardado?.(j.comprobanteUrl);

      setPaso("Bajando el recibo…");
      await bajarRecibo(ahora, elNegocio).catch((e: unknown) => {
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

  /** Sin guardar: el papel con la firma, para imprimir o mandar. */
  const bajarSinGuardar = async () => {
    setIntentado(true);
    if (falta) return;
    setError(null);
    await bajarRecibo(firmadoEl ?? fechaHoraLima(new Date())).catch((e: unknown) => {
      logger.error("[adelantos] el recibo firmado no bajó", { error: String(e) });
      setError("No se pudo armar el PDF. Intenta de nuevo.");
    });
  };

  return {
    a, noCargo, negocio, lineas, nombre, setNombre, documento, setDocumento, trazos, setTrazos,
    fase, paso, error, falta: intentado ? falta : null, listo: !falta, guardar, bajarSinGuardar,
  };
}

export type FirmarRecibo = ReturnType<typeof useFirmarRecibo>;
