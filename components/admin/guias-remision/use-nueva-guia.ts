"use client";

/**
 * «Nueva guía de remisión» por etapas (auditoría de comprobantes F17-F23 y M56,
 * 17-10). Antes: un formulario largo con «Vincular pedido» de texto libre, sin
 * precarga, sin borrador y con «Error al crear» como única explicación. Ahora:
 * el pedido se elige con el buscador de Facturas y boletas y llena destinatario,
 * llegada, comprobante e ítems; cada etapa dice lo que le falta; lo escrito
 * queda en un borrador; lo usado antes se elige con un toque.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PedidoElegible } from "@/components/admin/einvoice/emision-reglas";
import type { EDocument } from "@/components/admin/einvoice/tipos";
import { usePedidosParaEmitir } from "@/components/admin/einvoice/use-pedidos-para-emitir";
import { useMembrete } from "@/hooks/use-membrete";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { BorradorGuiaDesdeGtf, Faltante, OrigenGtf } from "@/lib/guias/desde-gtf";
import {
  avisosDe, comprobanteDeFilas, cuerpoGuia, datosFrecuentes, formConPedido, formNuevo, guiaPreviaDelPedido,
  itemsDelPedido, mensajeDeError, PASOS_GUIA, pedidoVinculado, pendientesDe, tieneDatos,
  type DestinoFrecuente, type OrdenParaGuia, type PasoGuia, type PedidoVinculado, type TransporteFrecuente,
} from "./guia-reglas";
import { borrarBorrador, guardarBorrador, leerBorrador, useAutoguardado } from "./use-borrador-guia";
import { emptyItem, type DraftItem, type FormGuia, type FuenteGuia, type GuiaRemision } from "./tipos";

/** Para la guía no importa si el pedido ya tiene comprobante: no bloquea elegirlo. */
const SIN_DOCS: readonly EDocument[] = [];
const ORDEN: readonly PasoGuia[] = PASOS_GUIA.map((p) => p.id);

/** Lo que la guía lleva de la GTF y el formulario base no tiene: licencia, ubigeos, modalidad y de qué GTF nació. */
export interface TrazoGtf {
  origenTipo: OrigenGtf;
  origenId: string;
  numero: string;
  conductorLicencia: string;
  ubigeoPartida: string;
  ubigeoLlegada: string;
  modalidadTraslado: "01" | "02";
  faltan: readonly Faltante[];
  avisos: readonly string[];
  guiaExistente: { id: string; numero: string } | null;
}
export type OpcionGtf = { origen: OrigenGtf; id: string; numero: string; destino: string; fecha: string };

const SEIS = /^\d{6}$/;

export function useNuevaGuia(guias: readonly GuiaRemision[], onCreada: () => void) {
  const membrete = useMembrete();
  const frecuentes = useMemo(() => datosFrecuentes(guias), [guias]);
  const partidaSugerida = frecuentes.partidas[0] ?? membrete?.direccion ?? "";

  const [abierto, setAbierto] = useState(false);
  const [preelegidoId, setPreelegidoId] = useState<string | null>(null);
  const [paso, setPaso] = useState<PasoGuia>("origen");
  const [visitados, setVisitados] = useState<readonly PasoGuia[]>([]);
  const [form, setForm] = useState<FormGuia>(() => formNuevo(""));
  const [items, setItems] = useState<DraftItem[]>(() => [emptyItem()]);
  const [pedido, setPedido] = useState<PedidoVinculado | null>(null);
  const [trayendo, setTrayendo] = useState<string | null>(null);
  const [recuperado, setRecuperado] = useState<string | null>(null);
  const [gtf, setGtf] = useState<TrazoGtf | null>(null);
  const [gtfOpciones, setGtfOpciones] = useState<readonly OpcionGtf[]>([]);
  const [trayendoGtf, setTrayendoGtf] = useState(false);
  const [errorGtf, setErrorGtf] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Turno de la última elección de pedido: una respuesta vieja no pisa la nueva. */
  const turno = useRef(0);
  const autoElegido = useRef(false);
  const partidaPuesta = useRef(false);

  const pedidos = usePedidosParaEmitir(abierto && form.fuente === "pedido", SIN_DOCS, preelegidoId);

  const deCero = useCallback((orderId: string | null) => {
    turno.current += 1;
    setForm(formNuevo(partidaSugerida));
    setItems([emptyItem()]);
    setPedido(null);
    setTrayendo(null);
    setGtf(null);
    setErrorGtf(null);
    setPaso("origen");
    setVisitados([]);
    setRecuperado(null);
    setPreelegidoId(orderId);
    autoElegido.current = false;
    partidaPuesta.current = partidaSugerida !== "";
  }, [partidaSugerida]);

  /** Abre la guía; con `orderId` (desde un pedido) arranca con ese pedido elegido. */
  const abrir = useCallback((orderId?: string) => {
    setError(null);
    const b = leerBorrador();
    if (b && (!orderId || b.pedido?.id === orderId)) {
      turno.current += 1;
      setForm(b.form);
      setItems(b.items);
      setPedido(b.pedido);
      setTrayendo(null);
      setGtf(null);
      setErrorGtf(null);
      setPaso(b.paso);
      setVisitados(ORDEN.slice(0, ORDEN.indexOf(b.paso)));
      setRecuperado(b.guardadoEn);
      setPreelegidoId(null);
      autoElegido.current = true;
      partidaPuesta.current = true;
    } else deCero(orderId ?? null);
    setAbierto(true);
  }, [deCero]);

  // La dirección del negocio llega después de abrir: llena la partida si sigue vacía.
  useEffect(() => {
    if (!abierto || partidaPuesta.current || !partidaSugerida) return;
    partidaPuesta.current = true;
    setForm((p) => (p.puntoPartida ? p : { ...p, puntoPartida: partidaSugerida }));
  }, [abierto, partidaSugerida]);

  // Las GTF recientes para «Desde la GTF»: sólo si el negocio tiene alguna el bloque aparece.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    fetch("/api/guias-remision/desde-gtf")
      .then(async (r) => (r.ok ? (((await r.json()) as { opciones?: OpcionGtf[] }).opciones ?? []) : []))
      .catch((err: unknown) => { logger.warn("[guias] GTF recientes", { error: String(err) }); return [] as OpcionGtf[]; })
      .then((o) => { if (vivo) setGtfOpciones(o); });
    return () => { vivo = false; };
  }, [abierto]);

  const irA = (destino: PasoGuia) => {
    setVisitados((v) => (v.includes(paso) ? v : [...v, paso]));
    setPaso(destino);
  };
  const vecino = (d: 1 | -1) => ORDEN[Math.min(ORDEN.length - 1, Math.max(0, ORDEN.indexOf(paso) + d))];

  const campo = <K extends keyof FormGuia>(k: K, v: FormGuia[K]) => setForm((p) => ({ ...p, [k]: v }));

  const elegirPedido = useCallback(async (p: PedidoElegible) => {
    const mio = ++turno.current;
    setTrayendo(p.id);
    setError(null);
    const respaldo: OrdenParaGuia = {
      id: p.id, total: p.total, customer: { name: p.cliente },
      items: p.lineas.map((l) => ({ name: l.nombre, quantity: l.cantidad, unit: l.unidad })),
    };
    const [orden, comprobante] = await Promise.all([
      fetch(`/api/orders/${encodeURIComponent(p.id)}`)
        .then(async (r) => (r.ok ? ((await r.json()) as OrdenParaGuia) : respaldo))
        .catch((err: unknown) => { logger.warn("[guias] pedido para la guía", { error: String(err) }); return respaldo; }),
      fetch("/api/admin/sunat/invoices?limit=100")
        .then(async (r) => (r.ok ? comprobanteDeFilas(await r.json(), p.id) : null))
        .catch((err: unknown) => { logger.warn("[guias] comprobante del pedido", { error: String(err) }); return null; }),
    ]);
    if (mio !== turno.current) return;
    setTrayendo(null);
    setForm((prev) => formConPedido(prev, orden, comprobante));
    const lineas = itemsDelPedido(orden);
    setItems(lineas.length > 0 ? lineas : [emptyItem()]);
    setPedido({ ...pedidoVinculado(orden, comprobante), id: p.id, codigo: p.codigo, cliente: p.cliente || pedidoVinculado(orden, null).cliente });
    setVisitados((v) => (v.includes("origen") ? v : [...v, "origen"]));
    setPaso((actual) => (actual === "origen" ? "destino" : actual));
  }, []);

  // Llegó con `?guia=<pedido>`: se elige solo apenas aparece en la lista.
  const pre = pedidos.preelegido;
  useEffect(() => {
    if (!abierto || autoElegido.current || !pre || pre.bloqueo) return;
    autoElegido.current = true;
    void elegirPedido(pre);
  }, [abierto, pre, elegirPedido]);

  const quitarPedido = () => {
    turno.current += 1;
    setTrayendo(null);
    setPedido(null);
  };

  /** Trae el borrador de la GTF elegida y llena la guía: lo que la GTF no trae queda vacío y marcado en `faltan`. */
  const traerGtf = useCallback(async (op: OpcionGtf) => {
    setTrayendoGtf(true);
    setErrorGtf(null);
    try {
      const res = await fetch(`/api/guias-remision/desde-gtf?origen=${op.origen}&id=${encodeURIComponent(op.id)}`);
      if (!res.ok) { setErrorGtf(res.status === 404 ? "Esa guía ya no está en este negocio." : "No se pudo traer la guía. Intenta de nuevo."); return; }
      const r = (await res.json()) as BorradorGuiaDesdeGtf;
      const b = r.borrador;
      turno.current += 1;
      setTrayendo(null);
      setPedido(null);
      setForm((p) => ({
        ...p,
        fuente: "sin-pedido",
        modalidad: b.modalidadTraslado === "01" ? "publico" : "privado",
        motivoTraslado: b.motivoTraslado,
        fechaTraslado: b.fechaTraslado ? `${b.fechaTraslado.slice(0, 10)}T${p.fechaTraslado.slice(11, 16) || "08:00"}` : p.fechaTraslado,
        destinatarioNombre: b.destinatarioNombre,
        destinatarioRuc: b.destinatarioRuc ?? "",
        destinatarioDireccion: b.destinatarioDireccion,
        transportistaNombre: b.transportistaNombre ?? "",
        transportistaRuc: b.transportistaRuc ?? "",
        vehiculoPlaca: b.vehiculoPlaca ?? "",
        conductorNombre: b.conductorNombre ?? "",
        conductorDni: b.conductorDni ?? "",
        documentoRef: b.documentoRef ?? "",
        puntoPartida: b.puntoPartida,
        puntoLlegada: b.puntoLlegada,
        pesoBruto: "",
      }));
      setItems(b.items.length > 0 ? b.items.map((i) => ({ descripcion: i.descripcion, cantidad: String(i.cantidad), unidad: i.unidad, pesoUnitario: "" })) : [emptyItem()]);
      setGtf({
        origenTipo: b.origenTipo, origenId: b.origenId, numero: op.numero, conductorLicencia: b.conductorLicencia ?? "",
        ubigeoPartida: b.ubigeoPartida ?? "", ubigeoLlegada: b.ubigeoLlegada ?? "", modalidadTraslado: b.modalidadTraslado ?? "02",
        faltan: r.faltan, avisos: r.avisos, guiaExistente: r.guiaExistente,
      });
    } catch (err) {
      logger.warn("[guias] traer GTF", { error: String(err) });
      setErrorGtf("No se pudo traer la guía. Intenta de nuevo.");
    } finally {
      setTrayendoGtf(false);
    }
  }, []);
  const quitarGtf = () => setGtf(null);
  const gtfCampo = (k: "conductorLicencia" | "ubigeoPartida" | "ubigeoLlegada", v: string) => setGtf((p) => (p ? { ...p, [k]: v } : p));

  const setFuente = (f: FuenteGuia) => {
    setForm((p) => ({
      ...p,
      fuente: f,
      // «Sin pedido» obliga a decir por qué sale la carga; volver al pedido lo deja en «Venta».
      motivoTraslado: f === "sin-pedido" && p.motivoTraslado === "VENTA" ? "" : f === "pedido" && !p.motivoTraslado ? "VENTA" : p.motivoTraslado,
    }));
    if (f === "sin-pedido") quitarPedido();
  };

  const usarDestino = (d: DestinoFrecuente) =>
    setForm((p) => ({ ...p, destinatarioNombre: d.nombre, destinatarioRuc: d.ruc, destinatarioDireccion: d.direccion, puntoLlegada: d.llegada || p.puntoLlegada }));
  const usarTransporte = (t: TransporteFrecuente) => setForm((p) => ({ ...p, ...t }));

  // Cambiar la unidad a mano la da por revisada: se va el aviso «venía como porción».
  const updateItem = (idx: number, field: keyof DraftItem, value: string) =>
    setItems((prev) => prev.map((it, i) => (i !== idx ? it : field === "unidad" ? { ...it, unidad: value, unidadOrigen: undefined } : { ...it, [field]: value })));
  const removeItem = (idx: number) => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyItem()]));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const pendientes = useMemo(() => {
    const base = pendientesDe(form, items, pedido);
    if (!gtf || gtf.guiaExistente) return gtf?.guiaExistente ? [{ paso: "origen" as const, texto: `Esta GTF ya tiene la guía ${gtf.guiaExistente.numero}: anúlala para rehacerla` }, ...base] : base;
    const malos = (["ubigeoPartida", "ubigeoLlegada"] as const).filter((k) => gtf[k] && !SEIS.test(gtf[k]));
    return [...base, ...malos.map((k) => ({ paso: "destino" as const, texto: `El ubigeo de ${k === "ubigeoPartida" ? "partida" : "llegada"} tiene 6 números` }))];
  }, [form, items, pedido, gtf]);
  const previa = useMemo(() => guiaPreviaDelPedido(guias, pedido?.id ?? null), [guias, pedido]);
  const avisos = useMemo(() => avisosDe(form, items, pedido, previa), [form, items, pedido, previa]);
  const hayDatos = tieneDatos(form, items, pedido);

  useAutoguardado(abierto && hayDatos, { paso, form, items, pedido });

  const cerrar = () => {
    if (hayDatos) guardarBorrador({ paso, form, items, pedido });
    turno.current += 1;
    setTrayendo(null);
    setAbierto(false);
  };

  const empezarDeCero = () => {
    borrarBorrador();
    deCero(null);
    setError(null);
  };

  const crear = async () => {
    if (pendientes.length > 0) {
      setVisitados(ORDEN);
      setPaso(pendientes[0].paso);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/guias-remision", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...cuerpoGuia(form, items, pedido),
          ...(gtf ? {
            conductorLicencia: gtf.conductorLicencia.trim() || undefined,
            ubigeoPartida: gtf.ubigeoPartida || undefined,
            ubigeoLlegada: gtf.ubigeoLlegada || undefined,
            modalidadTraslado: form.modalidad === "publico" ? "01" : "02",
            origenTipo: gtf.origenTipo,
            origenId: gtf.origenId,
          } : {}),
        }),
      });
      if (res.status === 409 && gtf) {
        setError(`Esta GTF ya tiene una guía. Anúlala si quieres rehacerla.`);
        return;
      }
      if (!res.ok) {
        setError(mensajeDeError(res.status, await res.json().catch(() => null)));
        return;
      }
      borrarBorrador();
      deCero(null);
      setAbierto(false);
      onCreada();
    } catch (err) {
      logger.warn("[guias] crear guía", { error: String(err) });
      setError(mensajeDeError(null, null));
    } finally {
      setCreating(false);
    }
  };

  return {
    abierto, abrir, cerrar, paso, irA, siguiente: () => irA(vecino(1)), atras: () => irA(vecino(-1)), visitados,
    form, campo, setFuente, setModalidad: (m: FormGuia["modalidad"]) => campo("modalidad", m),
    items, updateItem, removeItem, addItem,
    pedidos, pedido, elegirPedido, quitarPedido, trayendo, previa,
    frecuentes, usarDestino, usarTransporte, pendientes, avisos, recuperado, empezarDeCero,
    gtf, gtfOpciones, trayendoGtf, errorGtf, traerGtf, quitarGtf, gtfCampo,
    creating, error, crear,
  };
}

export type NuevaGuia = ReturnType<typeof useNuevaGuia>;
