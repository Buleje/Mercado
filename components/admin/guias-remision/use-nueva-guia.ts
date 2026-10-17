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

  const pendientes = useMemo(() => pendientesDe(form, items, pedido), [form, items, pedido]);
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
        body: JSON.stringify(cuerpoGuia(form, items, pedido)),
      });
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
    creating, error, crear,
  };
}

export type NuevaGuia = ReturnType<typeof useNuevaGuia>;
