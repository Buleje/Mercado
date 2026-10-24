"use client";

/**
 * Mandar mensaje › «Uno por uno»: qué chats abriste y el rastro en «Lo que ya
 * mandaste». El panel no manda nada (cada «Abrir» deja el mensaje escrito en
 * TU WhatsApp); lo que sí sabe es a quién le abriste el chat.
 *
 *  · Las marcas «Abierto» son por grupo + teléfono y duran mientras la
 *    pantalla esté abierta: corregir el texto no las borra (con eso le
 *    escribías dos veces al mismo cliente, revisión 19-10) y volver a un grupo
 *    trae las suyas.
 *  · Un envío anotado por grupo: el primer chat abierto lo crea (POST canal
 *    `manual`, ya enviado, con el texto de ese momento) y los siguientes suben
 *    el conteo cada 15 s como mucho. La cifra cuenta como guardada sólo si el
 *    servidor respondió bien; si no, se reintenta en la próxima pasada.
 *  · Al salir de la pantalla lo que falte sale con `keepalive` (llega aunque
 *    cierres la pestaña).
 *  · `activo = false` (quien no ve «Automático»: /api/campaigns es de
 *    gestión) marca los chats igual pero no anota nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AltaManual, Campanas } from "@/components/admin/crecimiento/campanas/use-campanas";

const ESPERA_MS = 15_000;
const SIN_ABIERTOS: ReadonlySet<string> = new Set();

export type EstadoRegistro = "sin-abrir" | "anotando" | "anotado" | "sin-anotar";

interface Registro {
  /** El id del envío en /api/campaigns, cuando ya se anotó. */
  id: string | null;
  creando: boolean;
  /** Un PATCH en camino: no se manda otro encima (el viejo podría llegar último). */
  enviando: boolean;
  /** Lo último que el servidor confirmó. */
  guardados: number;
  /** Los chats abiertos en este grupo. */
  abiertos: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const registroNuevo = (): Registro => ({ id: null, creando: false, enviando: false, guardados: 0, abiertos: 0, timer: null });

type Actualizar = Campanas["actualizarAbiertos"];

/** Sube el conteo si hay algo nuevo; si el servidor no lo guarda, vuelve a probar en 15 s. */
function guardarRegistro(r: Registro, keepalive: boolean, actualizar: () => Actualizar): void {
  if (r.timer) {
    clearTimeout(r.timer);
    r.timer = null;
  }
  if (!r.id || r.abiertos <= r.guardados) return;
  // Al salir se manda igual: lo último que abriste vale más que esperar al que está en camino.
  if (r.enviando && !keepalive) return;
  const cifra = r.abiertos;
  r.enviando = true;
  void actualizar()(r.id, cifra, keepalive).then((ok) => {
    r.enviando = false;
    if (ok) r.guardados = Math.max(r.guardados, cifra);
    if (!keepalive && r.abiertos > r.guardados) r.timer ??= setTimeout(() => guardarRegistro(r, false, actualizar), ESPERA_MS);
  });
}

export function useRegistroUnoPorUno({
  activo,
  campanas,
  alta,
}: {
  activo: boolean;
  campanas: Pick<Campanas, "anotarManual" | "actualizarAbiertos">;
  /** Lo que se anota (sin `delivered`): grupo, texto y a cuántos les llega. */
  alta: Omit<AltaManual, "delivered">;
}) {
  const grupo = alta.segment;
  const [marcas, setMarcas] = useState<ReadonlyMap<string, ReadonlySet<string>>>(() => new Map());
  const abiertos = marcas.get(grupo) ?? SIN_ABIERTOS;
  const [estados, setEstados] = useState<ReadonlyMap<string, EstadoRegistro>>(() => new Map());
  const ponerEstado = useCallback((g: string, valor: EstadoRegistro) => setEstados((prev) => new Map(prev).set(g, valor)), []);

  const registros = useRef(new Map<string, Registro>());
  const ultimo = useRef({ campanas, alta });
  useEffect(() => {
    ultimo.current = { campanas, alta };
  });
  const actualizar = useCallback(() => ultimo.current.campanas.actualizarAbiertos, []);

  /* Al salir de la pantalla, lo abierto en cada grupo queda guardado. */
  useEffect(() => {
    const todos = registros.current;
    return () => {
      for (const r of todos.values()) guardarRegistro(r, true, actualizar);
    };
  }, [actualizar]);

  const abrir = useCallback(
    (telefono: string) => {
      if (!telefono || abiertos.has(telefono)) return;
      const telefonos = new Set(abiertos);
      telefonos.add(telefono);
      setMarcas((prev) => new Map(prev).set(grupo, telefonos));
      if (!activo) return;

      let r = registros.current.get(grupo);
      if (!r) {
        r = registroNuevo();
        registros.current.set(grupo, r);
      }
      r.abiertos = telefonos.size;
      if (r.id) {
        const reg = r;
        reg.timer ??= setTimeout(() => guardarRegistro(reg, false, actualizar), ESPERA_MS);
        return;
      }
      if (r.creando) return;
      r.creando = true;
      ponerEstado(grupo, "anotando");
      const enviados = r.abiertos;
      const reg = r;
      void ultimo.current.campanas.anotarManual({ ...ultimo.current.alta, delivered: enviados }).then((id) => {
        reg.creando = false;
        if (!id) {
          // Se reintenta con el próximo chat que abras.
          ponerEstado(grupo, "sin-anotar");
          return;
        }
        reg.id = id;
        reg.guardados = enviados;
        ponerEstado(grupo, "anotado");
        // Abriste más mientras se anotaba: que no se pierdan.
        if (reg.abiertos > reg.guardados) reg.timer ??= setTimeout(() => guardarRegistro(reg, false, actualizar), ESPERA_MS);
      });
    },
    [abiertos, activo, actualizar, grupo, ponerEstado],
  );

  return { abiertos, abrir, estado: estados.get(grupo) ?? ("sin-abrir" as EstadoRegistro) };
}
