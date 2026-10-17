"use client";

/**
 * use-campos-personalizados — las preguntas que el negocio inventó, en un modal.
 *
 * El módulo puro (`lib/campos-personalizados.ts`) decide QUÉ se muestra y qué
 * está mal escrito; acá vive lo único que él no puede tener: el ida y vuelta
 * con el servidor y el estado de la pantalla.
 *
 * Dos cosas que este hook trata como normales y no como error:
 *
 * · **No estar disponible** — un tenant sin la función (403) o un despliegue
 *   donde el endpoint todavía no existe (404) no es una falla que mostrarle al
 *   operador: es que acá no hay campos personalizados. Se marca
 *   `disponible: false` y el bloque desaparece del modal.
 * · **Un registro que todavía no existe** — en un alta no hay a qué colgar los
 *   valores. Quedan como PENDIENTES y se guardan cuando el padre devuelve el
 *   id, igual que los permisos de una ficha nueva del Directorio
 *   (`CtpPartePermisos`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import {
  camposDelRegistro,
  esPermanente,
  partirValor,
  reutilizables as reutilizablesDe,
  type CampoPersonalizado,
  type TipoCampo,
  type ValorDeCampo,
} from "@/lib/campos-personalizados";

const BASE = "/api/admin/campos-personalizados";

/** El motivo que manda el servidor, o el código HTTP si no mandó ninguno. */
async function motivo(r: Response, quePedia: string): Promise<string> {
  const j = await leerJson<{ message?: string; error?: string }>(r);
  return j?.message ?? j?.error ?? `No se pudo ${quePedia} (HTTP ${r.status})`;
}

/** Lo que se elige al inventar un campo. */
export interface CampoNuevoInput {
  nombre: string;
  descripcion: string;
  tipo: TipoCampo;
  opciones: string[];
  /** `true` = temporal: vive sólo en este registro y no ensucia el formulario. */
  soloEnEsteRegistro: boolean;
}

/** Un campo inventado durante un alta, con lo que ya se escribió en él. */
export interface CampoPendiente extends CampoNuevoInput {
  /** Identidad local de la fila mientras no existe en el servidor. */
  clave: string;
  valor: string;
}

/**
 * Lo que quedó esperando el id del registro: los valores escritos en campos que
 * ya existen, y los campos inventados en esta alta (que tampoco se pueden crear
 * antes, porque un campo temporal necesita el id al que pertenece).
 */
export interface PendientesCampos {
  formulario: string;
  /** `campoId` → lo escrito, tal cual salió del input. */
  valores: Record<string, string>;
  nuevos: CampoPendiente[];
}

export const pendientesVacios = (formulario: string): PendientesCampos => ({
  formulario,
  valores: {},
  nuevos: [],
});

export const hayPendientes = (p: PendientesCampos): boolean =>
  p.nuevos.length > 0 || Object.values(p.valores).some((v) => v.trim() !== "");

let secuencia = 0;
export const clavePendiente = (): string => `cp${(secuencia += 1)}`;

/** El cuerpo del POST: el mismo para el alta normal y para los pendientes. */
function cuerpoDeAlta(formulario: string, input: CampoNuevoInput, registroId: string | null) {
  return {
    formulario,
    nombre: input.nombre.trim(),
    descripcion: input.descripcion.trim() || null,
    tipo: input.tipo,
    opciones: input.opciones,
    soloParaRegistroId: input.soloEnEsteRegistro ? registroId : null,
  };
}

/**
 * Crea los campos que se inventaron durante un alta y guarda lo escrito, ahora
 * que el registro existe.
 *
 * De a uno y sin cortar: si un nombre chocó con otro, los demás igual entran y
 * el aviso dice cuál falló. Nada de esto puede voltear el guardado del registro
 * —ya está guardado—, así que los errores se devuelven para contarlos, no se
 * tiran.
 */
export async function guardarValoresPendientes(
  registroId: string,
  pendientes: PendientesCampos,
): Promise<{ creados: number; guardados: number; errores: string[] }> {
  const res = { creados: 0, guardados: 0, errores: [] as string[] };
  const valores: { campoId: string; valor: string }[] = Object.entries(pendientes.valores)
    .filter(([, v]) => v.trim() !== "")
    .map(([campoId, valor]) => ({ campoId, valor }));

  for (const nuevo of pendientes.nuevos) {
    try {
      const r = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify(cuerpoDeAlta(pendientes.formulario, nuevo, registroId)),
      });
      const j = (await leerJson<{ campo?: CampoPersonalizado; message?: string; error?: string }>(r)) ?? {};
      const campo = j.campo;
      if (!r.ok || !campo) {
        res.errores.push(`${nuevo.nombre}: ${j.message ?? j.error ?? `HTTP ${r.status}`}`);
        continue;
      }
      res.creados += 1;
      if (nuevo.valor.trim() !== "") valores.push({ campoId: campo.id, valor: nuevo.valor });
    } catch (e) {
      res.errores.push(`${nuevo.nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (valores.length > 0) {
    try {
      const r = await fetch(`${BASE}/valores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ registroId, valores }),
      });
      if (!r.ok) res.errores.push(await motivo(r, "guardar lo escrito en los campos personalizados"));
      else {
        const j = (await leerJson<{ guardados?: number }>(r)) ?? {};
        res.guardados = j.guardados ?? valores.length;
      }
    } catch (e) {
      res.errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  return res;
}

export function useCamposPersonalizados({
  formulario,
  registroId,
  activo = true,
}: {
  formulario: string;
  /** `null` en un alta: ahí todo queda pendiente. */
  registroId: string | null;
  /** `false` mientras el bloque está plegado: no se pide lo que no se ve. */
  activo?: boolean;
}) {
  const [todos, setTodos] = useState<CampoPersonalizado[]>([]);
  const [valores, setValores] = useState<Record<string, ValorDeCampo>>({});
  const [catalogo, setCatalogo] = useState<CampoPersonalizado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disponible, setDisponible] = useState(true);
  const catalogoRef = useRef(false);
  /** Guarda de «carga vieja pisa lo optimista» (ver `use-contratos`). */
  const cargasRef = useRef({ ultima: 0, cambios: 0 });

  const cargar = useCallback(
    async (opciones?: { silenciosa?: boolean }) => {
      const esta = ++cargasRef.current.ultima;
      const cambiosAlSalir = cargasRef.current.cambios;
      if (!opciones?.silenciosa) {
        setCargando(true);
        setError(null);
      }
      try {
        const qs = new URLSearchParams({ formulario });
        if (registroId) qs.set("registroId", registroId);
        const r = await fetch(`${BASE}?${qs.toString()}`, { credentials: "include", cache: "no-store" });
        if (r.status === 403 || r.status === 404) {
          if (esta === cargasRef.current.ultima) setDisponible(false);
          return;
        }
        if (!r.ok) throw new Error(await motivo(r, "cargar los campos personalizados"));
        const j = (await r.json()) as { campos?: CampoPersonalizado[]; valores?: ValorDeCampo[] };
        if (esta === cargasRef.current.ultima && cambiosAlSalir === cargasRef.current.cambios) {
          setTodos(j.campos ?? []);
          setValores(Object.fromEntries((j.valores ?? []).map((v) => [v.campoId, v])));
          setDisponible(true);
        }
      } catch (e) {
        if (esta === cargasRef.current.ultima && !opciones?.silenciosa) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (esta === cargasRef.current.ultima) setCargando(false);
      }
    },
    [formulario, registroId],
  );

  useEffect(() => {
    if (!activo) return;
    void cargar();
  }, [activo, cargar]);

  /** Mete o reemplaza un campo en la lista sin esperar el GET. */
  const aplicar = useCallback((c: CampoPersonalizado) => {
    cargasRef.current.cambios += 1;
    setTodos((prev) => [...prev.filter((x) => x.id !== c.id), c]);
  }, []);

  const crear = useCallback(
    async (input: CampoNuevoInput): Promise<{ campo: CampoPersonalizado | null; error: string | null }> => {
      setGuardando(true);
      try {
        const r = await fetch(BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify(cuerpoDeAlta(formulario, input, registroId)),
        });
        const j = (await leerJson<{ campo?: CampoPersonalizado; message?: string; error?: string }>(r)) ?? {};
        const campo = j.campo;
        /* 409: esa clave ya está tomada en este formulario. El nombre se valida
           antes con `motivoNombreInvalido`, así que llegar acá es el caso raro:
           un campo **apagado** (sigue existiendo, sólo no se pinta) o una
           carrera con otra pestaña. Un campo **dado de baja** ya NO ocupa el
           nombre: los índices únicos son parciales y excluyen `deletedAt`
           (ADR-427) — verificado contra el servidor: baja y recreación con el
           mismo nombre responde 201. */
        if (!r.ok || !campo) {
          if (r.status === 409) {
            return { campo: null, error: "Ese nombre ya está usado en este formulario, por un campo que puede estar apagado. Buscalo en «Ver los apagados» y encendelo, o poné otro nombre." };
          }
          return { campo: null, error: j.message ?? j.error ?? `No se pudo crear el campo (HTTP ${r.status})` };
        }
        aplicar(campo);
        return { campo, error: null };
      } catch (e) {
        return { campo: null, error: e instanceof Error ? e.message : String(e) };
      } finally {
        setGuardando(false);
      }
    },
    [aplicar, formulario, registroId],
  );

  const actualizar = useCallback(
    async (
      id: string,
      cambios: Partial<Pick<CampoPersonalizado, "nombre" | "descripcion" | "opciones" | "orden" | "activo">>,
    ): Promise<{ campo: CampoPersonalizado | null; error: string | null }> => {
      try {
        const r = await fetch(BASE, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({ id, ...cambios }),
        });
        const j = (await leerJson<{ campo?: CampoPersonalizado; message?: string; error?: string }>(r)) ?? {};
        const campo = j.campo;
        if (!r.ok || !campo) {
          return { campo: null, error: j.message ?? j.error ?? `No se pudo guardar el campo (HTTP ${r.status})` };
        }
        aplicar(campo);
        return { campo, error: null };
      } catch (e) {
        return { campo: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [aplicar],
  );

  const eliminar = useCallback(async (id: string): Promise<{ ok: boolean; error: string | null }> => {
    try {
      const r = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (!r.ok) return { ok: false, error: await motivo(r, "dar de baja el campo") };
      cargasRef.current.cambios += 1;
      setTodos((prev) => prev.filter((c) => c.id !== id));
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  /**
   * Guarda lo escrito. Manda TODOS los campos visibles, incluidos los que se
   * vaciaron: borrar lo que había también es un cambio, y omitirlo dejaría el
   * valor viejo vivo en la base mientras la pantalla lo muestra en blanco.
   */
  const guardarValores = useCallback(
    async (borrador: Record<string, string>): Promise<{ ok: boolean; error: string | null }> => {
      if (!registroId) return { ok: false, error: "Todavía no hay registro donde guardar." };
      const lista = Object.entries(borrador).map(([campoId, valor]) => ({ campoId, valor }));
      if (lista.length === 0) return { ok: true, error: null };
      setGuardando(true);
      cargasRef.current.cambios += 1;
      try {
        const r = await fetch(`${BASE}/valores`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({ registroId, valores: lista }),
        });
        if (!r.ok) return { ok: false, error: await motivo(r, "guardar lo escrito") };
        setValores((prev) => {
          const sig = { ...prev };
          for (const { campoId, valor } of lista) {
            const tipo = todos.find((c) => c.id === campoId)?.tipo ?? "texto";
            sig[campoId] = { campoId, ...partirValor(tipo, valor) };
          }
          return sig;
        });
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      } finally {
        setGuardando(false);
      }
    },
    [registroId, todos],
  );

  /** Las preguntas que otros formularios ya definieron. Se pide al abrir el alta. */
  const cargarReutilizables = useCallback(async () => {
    if (catalogoRef.current) return;
    catalogoRef.current = true;
    setCargandoCatalogo(true);
    try {
      const r = await fetch(`${BASE}?reutilizables=${encodeURIComponent(formulario)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) {
        // Sin catálogo se puede crear igual: no es un error que mostrar.
        catalogoRef.current = false;
        return;
      }
      const j = (await r.json()) as { campos?: CampoPersonalizado[] };
      setCatalogo(j.campos ?? []);
    } catch {
      catalogoRef.current = false;
    } finally {
      setCargandoCatalogo(false);
    }
  }, [formulario]);

  const campos = useMemo(() => camposDelRegistro(todos, registroId), [todos, registroId]);
  /** Apagados que alguien puede querer volver a mostrar (sólo los de acá). */
  const apagados = useMemo(
    () => todos.filter((c) => !c.activo && (esPermanente(c) || c.soloParaRegistroId === registroId)),
    [todos, registroId],
  );
  const reutilizables = useMemo(() => reutilizablesDe([...todos, ...catalogo], formulario), [todos, catalogo, formulario]);

  return {
    campos,
    apagados,
    valores,
    reutilizables,
    cargando,
    cargandoCatalogo,
    guardando,
    error,
    disponible,
    recargar: cargar,
    cargarReutilizables,
    crear,
    actualizar,
    eliminar,
    guardarValores,
  };
}
