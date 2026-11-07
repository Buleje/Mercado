"use client";

/**
 * El estado y el guardado de «Entregar adelanto» (ADR-491): persona + monto +
 * firma (+ huella) en UNA petición multipart a `POST /api/adelantos/entregar`.
 *
 * Plata primero, papel después: la ruta crea el adelanto y mueve la caja en la
 * misma transacción; si la firma no se pudo guardar, igual responde 201 con
 * `firma.guardada = false` y acá se ofrece «Reintentar firma» contra
 * `POST …/firmas` con `entregaKey` (el cajero no tiene `adelantos:write`).
 *
 * Idempotencia: la clave nace al abrir y se mantiene en todos los reintentos
 * (un corte de red con la plata ya entregada no la entrega dos veces); sólo
 * «Otro adelanto» o un `idempotencia_distinta` la cambian.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { leerMembrete } from "@/lib/admin/membrete-cliente";
import { descargarComprobante, montoConMoneda } from "@/lib/adelantos/comprobante";
import { EntregarDatosSchema, FirmarDatosSchema, type EntregarDatos } from "@/lib/adelantos/entregar-schema";
import {
  VERSION_CONSENTIMIENTO_HUELLA,
  type CodigoErrorEntregar,
  type EnlaceFirmaCreado,
  type EntregarRespuesta,
  type ExistenteConClave,
  type ImagenGuardada,
  type MetodoEntrega,
  type PersonaEntregar,
} from "@/lib/adelantos/entregar-tipos";
import { fechaHoraLima, limpiarDocumento, validarFirmante } from "@/lib/adelantos/recibo-firmado";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { esFirmaSuficiente, type Trazo } from "@/lib/firma/trazos";
import { logger } from "@/lib/logger";
import { firmaEnCanvas } from "../firma/hoja-firma";
import { guardarEntregaPendiente, leerEntregaPendiente } from "./entrega-pendiente";
import { usePersonasEntregar, type ContextoEntrega } from "./use-personas-entregar";

/** `existente`: la ruta dijo que esta clave ya tiene OTRO adelanto (422 `idempotencia_distinta`). */
export type FaseEntrega = "armando" | "guardando" | "hecho" | "existente";

export type { ExistenteConClave };

const TEXTO_INCIERTO = "No se pudo confirmar la entrega: puede que ya haya salido. Reintenta (con la misma clave no se entrega dos veces).";

/** Una clave de idempotencia; `randomUUID` no existe fuera de https (el panel por IP de la red local). */
export function nuevaClave(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `entrega-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** «120.5» → 120.5; vacío o cero → 0. */
export function montoDeTexto(t: string): number {
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** El texto del error que la pantalla muestra, por código de la ruta. */
export function textoDeError(codigo: string | null, mensaje: string | null, tope: number | null): string {
  switch (codigo as CodigoErrorEntregar | null) {
    case "supera_tope_cajero":
      if (tope === 0) return "En este negocio el cajero no entrega adelantos: pídeselo al dueño.";
      return tope != null ? `Pasa tu tope de ${montoConMoneda(tope)}: baja el monto o pídele al dueño que lo entregue.` : "Pasa tu tope: baja el monto o pídele al dueño que lo entregue.";
    case "sin_caja":
      return "Abre la caja primero: la plata sale del cajón.";
    case "firma_obligatoria":
      return "Falta la firma de la persona.";
    case "falta_consentimiento":
      return "Marca la casilla de la huella, o quítala.";
    case "no_es_imagen":
      return "La foto de la huella no se pudo leer: tómala otra vez.";
    case "muy_grande":
      return "La foto de la huella pesa demasiado: tómala otra vez, más de cerca.";
    case "persona_inexistente":
      return "Esa persona ya no está en Adelantos: elige otra.";
    case "limite_credito":
      return mensaje ?? "Pasa el tope de crédito de esta persona.";
    case "idempotencia_distinta":
      return "Ya se mandó otra entrega desde esta pantalla: revisa la lista antes de entregar de nuevo.";
    case "sin_permiso_adelantos":
      return "Tu rol no puede entregar adelantos: pídeselo al dueño.";
    default:
      return mensaje ?? "No se pudo entregar. Intenta de nuevo.";
  }
}

/** La firma en PNG (tinta negra sobre blanco), como la imprime el recibo. */
function firmaPng(trazos: readonly Trazo[]): Promise<Blob | null> {
  return new Promise((resolve) => firmaEnCanvas(trazos, 900, 300).toBlob((b) => resolve(b), "image/png"));
}

type ErrorRuta = { code?: string; error?: string; message?: string; issues?: string[]; tope?: number; existente?: ExistenteConClave };

export function useEntregarAdelanto({
  personaInicial = null,
  onEntregado,
}: {
  personaInicial?: PersonaEntregar | null;
  /** La plata ya salió (o ya estaba): la lista o la caja de atrás se releen. `null` = un adelanto ya registrado con esta clave. */
  onEntregado?: (r: EntregarRespuesta | null) => void;
}) {
  const personas = usePersonasEntregar();
  const ctx: ContextoEntrega | null = personas.contexto;
  /* Una entrega sin confirmar de la vez anterior manda: se retoma tal cual, con su clave. */
  const [pendiente] = useState(leerEntregaPendiente);
  const inicial = pendiente?.persona ?? personaInicial;
  const [persona, setPersonaState] = useState<PersonaEntregar | null>(inicial);
  const [montoTexto, setMontoTextoState] = useState(pendiente?.montoTexto ?? "");
  const [metodo, setMetodoState] = useState<MetodoEntrega | null>(pendiente ? pendiente.metodo : "efectivo");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [documento, setDocumento] = useState(limpiarDocumento(inicial?.documentoFinal));
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [huella, setHuella] = useState<Blob | null>(null);
  const [consentido, setConsentido] = useState(false);
  const [fase, setFase] = useState<FaseEntrega>("armando");
  const [error, setError] = useState<{ texto: string; codigo: string | null } | null>(pendiente ? { texto: TEXTO_INCIERTO, codigo: null } : null);
  /**
   * Respuesta incierta (red cortada o 5xx): persona, monto y método quedan
   * fijos y sólo se ofrece «Reintentar» con la MISMA clave. Cambiar el monto y
   * mandar de nuevo daba 422 y, con clave nueva, OTRO adelanto y otro egreso.
   */
  const [incierto, setIncierto] = useState(!!pendiente);
  const [existente, setExistente] = useState<ExistenteConClave | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [respuesta, setRespuesta] = useState<EntregarRespuesta | null>(null);
  const [firmadoEl, setFirmadoEl] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [enlace, setEnlace] = useState<EnlaceFirmaCreado | null>(null);
  const [avisoEnlace, setAvisoEnlace] = useState<string | null>(null);
  const clave = useRef(pendiente?.clave ?? nuevaClave());
  /** Con qué modo se mandó la última vez: el reintento va igual. */
  const sinFirmaUltimo = useRef(pendiente?.sinFirma ?? false);
  /** La del reintento de la firma: la misma si el reintento también se corta. */
  const claveFirma = useRef<string | null>(null);

  const setMontoTexto = useCallback((v: string | ((t: string) => string)) => {
    if (!incierto) setMontoTextoState(v);
  }, [incierto]);
  const setMetodo = useCallback((m: MetodoEntrega | null) => {
    if (!incierto) setMetodoState(m);
  }, [incierto]);

  const elegir = useCallback((p: PersonaEntregar | null) => {
    if (incierto) return;
    setPersonaState(p);
    setNombre(p?.nombre ?? "");
    setDocumento(limpiarDocumento(p?.documentoFinal));
    /* La firma es de la persona: con otra, se firma de nuevo. */
    setTrazos([]);
    setHuella(null);
    setConsentido(false);
    setError(null);
  }, [incierto]);

  const monto = montoDeTexto(montoTexto);
  const tope = ctx?.restringido ? ctx.topeCajero : null;
  const firmaObligatoria = ctx?.firmaObligatoria ?? true;
  const hayFirma = esFirmaSuficiente(trazos);
  const conFirmante = hayFirma || huella != null;
  const documentoDeFicha = !!persona?.documentoFinal;

  /** Lo primero que falta de la plata (quién, cuánto, de dónde), o `null`. */
  const faltaPlata = useMemo((): string | null => {
    if (!persona) return "Elige a quién le entregas.";
    if (!(monto > 0)) return "Escribe el monto.";
    if (tope === 0) return "En este negocio el cajero no entrega adelantos: pídeselo al dueño.";
    if (tope != null && monto > tope) return `Tu tope es ${montoConMoneda(tope)}: baja el monto.`;
    if (ctx?.restringido && !ctx.cajaAbierta) return "Abre la caja primero: la plata sale del cajón.";
    if (ctx?.restringido && !metodo) return "Elige con qué entregas.";
    return null;
  }, [persona, monto, tope, ctx, metodo]);

  /** Lo primero que falta de la firma y la huella, o `null`. */
  const faltaFirma = useMemo((): string | null => {
    if (firmaObligatoria && !hayFirma) return `Falta la firma de ${persona?.nombre.trim().split(/\s+/)[0] || "la persona"}.`;
    if (trazos.length > 0 && !hayFirma) return "La firma quedó muy corta: termínala o bórrala.";
    if (conFirmante) {
      const p = validarFirmante({ nombre, documento });
      if (p) return p;
    }
    if (huella && !consentido) return "Marca la casilla de la huella, o quítala.";
    return null;
  }, [persona, firmaObligatoria, hayFirma, trazos.length, conFirmante, nombre, documento, huella, consentido]);

  const falta = faltaPlata ?? faltaFirma;

  const firmante = () => ({ nombre: nombre.trim(), documento: limpiarDocumento(documento) });

  const entregar = async ({ mandarAFirmar = false }: { mandarAFirmar?: boolean } = {}) => {
    if (fase === "guardando" || fase === "existente") return;
    setIntentado(true);
    /* «Mandar a firmar» entrega sin firma: sólo si la firma no es obligatoria. El reintento va como la vez anterior. */
    const sinFirma = (incierto ? sinFirmaUltimo.current : mandarAFirmar) && !firmaObligatoria;
    if (!persona || (sinFirma ? faltaPlata : falta)) return;
    const llevaFirmante = !sinFirma && conFirmante;
    const datos: EntregarDatos = {
      beneficiarioId: persona.id,
      monto,
      metodoCaja: metodo,
      idempotencyKey: clave.current,
      ...(llevaFirmante ? { firmante: firmante() } : {}),
      ...(!sinFirma && hayFirma ? { trazos } : {}),
      ...(!sinFirma && huella && consentido ? { consentimientoHuella: VERSION_CONSENTIMIENTO_HUELLA } : {}),
    };
    const v = EntregarDatosSchema.safeParse(datos);
    if (!v.success) {
      setError({ texto: v.error.issues[0]?.message ?? "Revisa los datos.", codigo: null });
      return;
    }
    setError(null);
    setFase("guardando");
    sinFirmaUltimo.current = sinFirma;
    const ahora = fechaHoraLima(new Date());
    const quedoIncierta = () => {
      setIncierto(true);
      guardarEntregaPendiente({ clave: clave.current, persona, montoTexto, metodo, sinFirma, en: Date.now() });
      setError({ texto: TEXTO_INCIERTO, codigo: null });
      setFase("armando");
    };
    try {
      const fd = new FormData();
      fd.append("datos", JSON.stringify(v.data));
      if (!sinFirma && hayFirma) {
        const png = await firmaPng(trazos);
        if (png) fd.append("firma", new File([png], "firma.png", { type: "image/png" }));
      }
      if (!sinFirma && huella && consentido) fd.append("huella", new File([huella], "huella.jpg", { type: huella.type || "image/jpeg" }));
      /* Sin `Content-Type`: el navegador pone el `boundary`. */
      const res = await fetch("/api/adelantos/entregar", { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await leerJson<EntregarRespuesta & ErrorRuta>(res);
      /* 5xx: no se sabe si quedó; se reintenta con la MISMA clave y sin cambiar nada. */
      if (res.status >= 500) return quedoIncierta();
      if (!res.ok || !j?.adelanto) {
        const codigo = j?.code ?? null;
        /* Respuesta firme: lo que estaba en duda ya se resolvió. */
        guardarEntregaPendiente(null);
        setIncierto(false);
        if (codigo === "idempotencia_distinta") {
          /* Esta clave ya tiene un adelanto: se muestra cuál; la clave cambia SÓLO con «Es otra entrega». */
          setExistente(j?.existente ?? null);
          setFase("existente");
          onEntregado?.(null);
          return;
        }
        setError({ texto: textoDeError(codigo, j?.issues?.[0] ?? j?.message ?? j?.error ?? null, typeof j?.tope === "number" ? j.tope : tope), codigo });
        setFase("armando");
        return;
      }
      guardarEntregaPendiente(null);
      setIncierto(false);
      setFirmadoEl(ahora);
      setRespuesta(j);
      setFase("hecho");
      onEntregado?.(j);
      if (sinFirma) void crearEnlace(j.adelanto.id);
    } catch (e) {
      logger.warn("[adelantos] la entrega no respondió", { error: String(e) });
      quedoIncierta();
    }
  };

  /** «Es otra entrega» (tras un 422): la de antes ya quedó; ésta va con clave nueva y lo que está en pantalla. */
  const esOtraEntrega = () => {
    clave.current = nuevaClave();
    claveFirma.current = null;
    setExistente(null);
    setError(null);
    setFase("armando");
  };

  /** Sin confirmar y quien entrega SABE que la plata no salió: se suelta, con clave nueva. */
  const descartarPendiente = () => {
    guardarEntregaPendiente(null);
    clave.current = nuevaClave();
    setIncierto(false);
    setError(null);
  };

  const crearEnlace = async (adelantoId: string) => {
    setAvisoEnlace(null);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}/enlace-firma`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({}),
      });
      const j = await leerJson<{ enlace?: EnlaceFirmaCreado } & ErrorRuta>(res);
      if (!res.ok || !j?.enlace) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setEnlace(j.enlace);
    } catch (e) {
      logger.warn("[adelantos] no se pudo crear el enlace de firma", { error: String(e) });
      setAvisoEnlace("La plata quedó entregada, pero el enlace para firmar no se creó: créalo desde la ficha del adelanto.");
    }
  };

  /* La ruta de firmas exige la firma: sin ella no hay reintento (la huella sola se agrega desde la ficha). */
  const firmaPendiente = respuesta?.firma?.guardada === false;
  const huellaPerdida = !firmaPendiente && respuesta?.huella?.guardada === false;

  /** La plata ya salió y la firma no quedó: se guarda sola, con la clave de la entrega. */
  const reintentarFirma = async () => {
    if (!respuesta || reintentando) return;
    setReintentando(true);
    setError(null);
    claveFirma.current ??= nuevaClave();
    const vaFirma = hayFirma;
    const vaHuella = respuesta.huella?.guardada === false && huella != null && consentido;
    const v = FirmarDatosSchema.safeParse({
      firmante: firmante(),
      idempotencyKey: claveFirma.current,
      entregaKey: clave.current,
      ...(vaFirma ? { trazos } : {}),
      ...(vaHuella ? { consentimientoHuella: VERSION_CONSENTIMIENTO_HUELLA } : {}),
    });
    try {
      if (!v.success) throw new Error(v.error.issues[0]?.message ?? "datos de la firma");
      const fd = new FormData();
      fd.append("datos", JSON.stringify(v.data));
      if (vaFirma) {
        const png = await firmaPng(trazos);
        if (png) fd.append("firma", new File([png], "firma.png", { type: "image/png" }));
      }
      if (vaHuella && huella) fd.append("huella", new File([huella], "huella.jpg", { type: huella.type || "image/jpeg" }));
      const res = await fetch(`/api/adelantos/${respuesta.adelanto.id}/firmas`, { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await leerJson<{ firma?: ImagenGuardada; huella?: ImagenGuardada | null } & ErrorRuta>(res);
      if (!res.ok || !j?.firma) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setRespuesta((r) => (r ? { ...r, firma: j.firma ?? r.firma, huella: vaHuella ? (j.huella ?? r.huella) : r.huella } : r));
    } catch (e) {
      logger.warn("[adelantos] el reintento de la firma falló", { error: String(e) });
      setError({ texto: "La firma todavía no se guardó. Intenta otra vez en un momento; la plata ya quedó registrada.", codigo: null });
    } finally {
      setReintentando(false);
    }
  };

  const bajarRecibo = async () => {
    if (!respuesta) return;
    try {
      const { nombre: negocio } = await leerMembrete();
      await descargarComprobante({
        codigoOperacion: respuesta.adelanto.codigoOperacion,
        persona: respuesta.adelanto.persona,
        documento: limpiarDocumento(documento) || null,
        monto: respuesta.adelanto.monto,
        moneda: respuesta.adelanto.moneda,
        fecha: respuesta.adelanto.fechaAdelanto,
        modalidad: "CUENTA_CORRIENTE",
        direccion: "DADO",
        negocio: negocio?.trim() || undefined,
        ...(hayFirma
          ? { firma: { imagen: firmaEnCanvas(trazos, 900, 300).toDataURL("image/png"), relacion: 3, ...firmante(), fechaHora: firmadoEl ?? fechaHoraLima(new Date()) } }
          : {}),
      });
    } catch (e) {
      logger.error("[adelantos] el recibo de la entrega no bajó", { error: String(e) });
      setError({ texto: "No se pudo armar el PDF. Intenta de nuevo.", codigo: null });
    }
  };

  /** «Otro adelanto»: todo de cero, clave nueva; el contexto (frecuentes, caja) se relee. */
  const otro = () => {
    guardarEntregaPendiente(null);
    clave.current = nuevaClave();
    claveFirma.current = null;
    setIncierto(false);
    setExistente(null);
    setPersonaState(null);
    setNombre("");
    setDocumento("");
    setTrazos([]);
    setHuella(null);
    setConsentido(false);
    setError(null);
    setMontoTextoState("");
    setMetodoState("efectivo");
    setRespuesta(null);
    setEnlace(null);
    setAvisoEnlace(null);
    setIntentado(false);
    setFirmadoEl(null);
    setFase("armando");
    personas.releer();
  };

  useEffect(() => {
    if (ctx?.restringido && metodo == null && !incierto) setMetodoState("efectivo");
  }, [ctx?.restringido, metodo, incierto]);

  return {
    personas, ctx, persona, elegir, montoTexto, setMontoTexto, monto, metodo, setMetodo, tope,
    nombre, setNombre, documento, setDocumento, documentoDeFicha, trazos, setTrazos, huella, setHuella,
    consentido, setConsentido, firmaObligatoria, hayFirma, fase, error, falta, faltaPlata, mostrarFalta: intentado ? falta : null,
    respuesta, firmaPendiente, huellaPerdida, reintentando, reintentarFirma, enlace, avisoEnlace, entregar, bajarRecibo, otro,
    incierto, existente, esOtraEntrega, descartarPendiente,
  };
}

export type EntregaAdelanto = ReturnType<typeof useEntregarAdelanto>;
