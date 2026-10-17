"use client";

/**
 * use-rrhh-asistencia — la hoja de asistencia (ADR-414 §4), día o mes.
 *
 * Cada toque de celda se ve al instante (optimista) y se acumula en un buffer
 * que se vacía en UNA sola llamada a `PUT /api/rrhh/asistencia` tras ~800ms de
 * inactividad — tildar 20 casilleros seguidos no dispara 20 requests (bucket
 * `GENEROUS`, pero igual es la cortesía correcta con la red del patio). Si el
 * componente se desmonta con cambios pendientes (cambiar de día/mes), el
 * flush se dispara igual antes de perderlos.
 *
 * El masivo («Todos presentes») es una llamada aparte, inmediata: no tiene
 * sentido acumularla con marcas sueltas.
 *
 * Corregir NO es marcar (ADR-417): si en la tanda hay marcas que YA estaban
 * guardadas en el servidor, antes de mandarlas se pide el motivo por el buzón
 * de `lib/rrhh/motivo-correccion` —lo contesta `MotivoCorreccionModal`, montado
 * en `AsistenciaView`— y viaja en el mismo PUT, que lo escribe en
 * `motivoCorreccion` de la fila que se da de baja. Las marcas nuevas de la
 * misma tanda NO esperan a esa respuesta: salen igual, para que preguntar por
 * una corrección no retenga las otras 19 marcas del día.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import type { AsistenciaDTO, EstadoAsistencia, FechaKey, HojaAsistenciaDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "./use-rrhh-puestos";
import { pedirMotivoCorreccion, type CambioACorregir } from "@/lib/rrhh/motivo-correccion";
import { sinDato } from "@/lib/errores/sin-dato";

export interface MarcaInput {
  colaboradorId: string;
  fecha: FechaKey;
  /** `null` = quitar la marca del día. */
  estado: EstadoAsistencia | null;
  entrada?: string | null;
  salida?: string | null;
  refrigerioMin?: number;
  horas?: number | null;
  nota?: string | null;
}

export interface MasivoInput {
  fecha: FechaKey;
  estado?: EstadoAsistencia;
  entrada?: string | null;
  salida?: string | null;
  colaboradorIds?: string[];
  sobrescribir?: boolean;
  nota?: string | null;
}

export interface OmitidoMasivo {
  colaboradorId: string;
  nombre: string;
  motivo: "ya_marcado" | "no_activo" | "no_ingresado" | "cesado";
}

const DEBOUNCE_MS = 800;

/**
 * Prefijo del id de una marca que todavía NO existe en el servidor. Es lo que
 * separa «primera marca del día» de «corrección»: si la marca previa tenía un
 * id de verdad, ya está en la base y cambiarla se audita.
 */
const ID_OPTIMISTA = "optimista-";

const clave = (colaboradorId: string, fecha: FechaKey) => `${colaboradorId}|${fecha}`;

/** Lo que devuelve un flush: si algo falló, con qué motivo y de qué fecha — para que quien navegó lejos lo pueda avisar igual. */
export interface ResultadoFlush {
  ok: boolean;
  fallos: { fecha: FechaKey; motivo: string }[];
}

type Fallo = ResultadoFlush["fallos"][number];

/**
 * «No se guardaron 2 marcas del jueves 11/09: <motivo>» — agrupa por
 * fecha+motivo, un toast por grupo. Exportado: lo usan también
 * `HojaDelDia`/`HojaDelMes` cuando `guardarAhora()` falla justo antes de
 * navegar a otro día/mes (ALTO 5) — ahí `flush()` no se avisa solo porque el
 * componente todavía está montado, así que es responsabilidad de quien llama.
 */
export function avisarFallos(fallos: { fecha: FechaKey; motivo: string }[]) {
  const porGrupo = new Map<string, { fecha: FechaKey; motivo: string; n: number }>();
  for (const f of fallos) {
    const k = `${f.fecha}::${f.motivo}`;
    const previo = porGrupo.get(k);
    porGrupo.set(k, { fecha: f.fecha, motivo: f.motivo, n: (previo?.n ?? 0) + 1 });
  }
  for (const { fecha, motivo, n } of porGrupo.values()) {
    toast.error(`No se ${n === 1 ? "guardó" : "guardaron"} ${n} ${n === 1 ? "marca" : "marcas"} del ${etiquetaDia(fecha)}: ${motivo}`);
  }
}

export interface UseRrhhAsistenciaResult {
  hoja: HojaAsistenciaDTO | null;
  loading: boolean;
  error: string | null;
  guardando: boolean;
  /** Claves `colaboradorId|fecha` con un cambio local todavía sin confirmar por el servidor. */
  pendientes: ReadonlySet<string>;
  /** Claves `colaboradorId|fecha` cuyo último guardado falló, con el motivo. */
  erroresPorCelda: ReadonlyMap<string, string>;
  marcar: (input: MarcaInput) => void;
  /**
   * Vacía el buffer YA (ej. antes de cambiar de día/mes). Idempotente si no
   * hay nada pendiente. Devuelve si falló algo — quien llama sabe de qué
   * fecha se está yendo y puede avisarlo aunque la hoja visible ya haya
   * cambiado para cuando la respuesta vuelve.
   */
  guardarAhora: () => Promise<ResultadoFlush>;
  masivo: (input: MasivoInput) => Promise<
    | { ok: true; creadas: number; reemplazadas: number; omitidos: OmitidoMasivo[] }
    | { ok: false; error: RrhhApiError }
  >;
  recargar: () => void;
}

export function useRrhhAsistencia(desde: FechaKey, hasta: FechaKey): UseRrhhAsistenciaResult {
  const [hoja, setHoja] = useState<HojaAsistenciaDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());
  const [erroresPorCelda, setErroresPorCelda] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);

  const bufferRef = useRef<Map<string, MarcaInput>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Versión de la última EDICIÓN LOCAL por celda (no de la respuesta del
   * servidor) — para que dos `flush()` superpuestos de la misma celda no se
   * pisen. Si tildás una celda, y ANTES de que su flush vuelva la tildás de
   * nuevo, el segundo toque dispara su propio flush con una versión más
   * nueva; cuando el primero responde, su resultado ya está viejo y no debe
   * sobreescribir el optimista (más nuevo) que dejó el segundo toque.
   */
  const versionRef = useRef<Map<string, number>>(new Map());
  /**
   * Cómo estaba cada celda ANTES del primer toque de la tanda: `null` si no
   * había marca. Es lo que distingue «primera marca del día» de «corrección»
   * (id del servidor vs. `optimista-`) y a lo que se vuelve si se cancela el
   * motivo. Se borra cuando la celda ya viajó bien al servidor.
   */
  const previaRef = useRef<Map<string, AsistenciaDTO | null>>(new Map());
  /** La hoja vigente, legible desde los callbacks sin volver a crearlos (los nombres del modal salen de acá). */
  const hojaRef = useRef<HojaAsistenciaDTO | null>(null);
  /** Envíos en vuelo: con dos lotes a la vez (marcas nuevas + correcciones) `guardando` no se apaga con el primero. */
  const enVueloRef = useRef(0);
  /** `false` tras desmontar — el flush del cleanup (fire-and-forget, nadie lo espera) se avisa SOLO, con un toast. */
  const montadoRef = useRef(true);
  useEffect(() => () => { montadoRef.current = false; }, []);
  useEffect(() => { hojaRef.current = hoja; }, [hoja]);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(null);
    fetch(`/api/rrhh/asistencia?desde=${desde}&hasta=${hasta}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la asistencia");
        return r.json() as Promise<HojaAsistenciaDTO>;
      })
      .then((data) => {
        if (!vigente) return;
        setHoja(data);
        setErroresPorCelda(new Map());
        // Las fotos de celdas que ya se guardaron no valen contra la hoja
        // nueva; las de lo que sigue en el buffer sí (todavía no se mandó).
        for (const k of [...previaRef.current.keys()]) if (!bufferRef.current.has(k)) previaRef.current.delete(k);
      })
      .catch((err) => {
        sinDato("RRHH asistencia")(err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar la asistencia");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [desde, hasta, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  /** Aplica la marca al estado local YA — antes de que el servidor confirme. */
  const aplicarOptimista = useCallback((input: MarcaInput) => {
    setHoja((prev) => {
      if (!prev) return prev;
      const k = clave(input.colaboradorId, input.fecha);
      const previa = prev.marcas.find((m) => clave(m.colaboradorId, m.fecha) === k) ?? null;
      // La foto de cómo estaba la celda antes del PRIMER toque de esta tanda.
      // Idempotente a propósito: ni el segundo toque ni el doble render de
      // StrictMode la pisan — si no, «volver atrás en dos segundos» se leería
      // como una corrección de algo que el servidor nunca vio.
      if (!previaRef.current.has(k)) previaRef.current.set(k, previa);
      const sinEsta = prev.marcas.filter((m) => clave(m.colaboradorId, m.fecha) !== k);
      if (input.estado === null) return { ...prev, marcas: sinEsta };
      const nueva: AsistenciaDTO = {
        id: previa?.id ?? `${ID_OPTIMISTA}${k}`,
        colaboradorId: input.colaboradorId,
        fecha: input.fecha,
        estado: input.estado,
        entrada: input.entrada !== undefined ? input.entrada : (previa?.entrada ?? null),
        salida: input.salida !== undefined ? input.salida : (previa?.salida ?? null),
        refrigerioMin: input.refrigerioMin ?? previa?.refrigerioMin ?? 0,
        horas: input.horas !== undefined ? input.horas : (previa?.horas ?? null),
        nota: input.nota !== undefined ? input.nota : (previa?.nota ?? null),
        origen: "manual",
        marcadoPor: previa?.marcadoPor ?? "",
        marcadoEn: new Date().toISOString(),
      };
      return { ...prev, marcas: [...sinEsta, nueva] };
    });
  }, []);

  /**
   * Manda UN lote al servidor (con su motivo, si lo lleva) y acomoda el estado
   * local con la respuesta. Sale de adentro de `flush` porque una misma tanda
   * puede partirse en dos envíos: las marcas nuevas viajan YA y las
   * correcciones esperan a que se conteste el motivo.
   */
  const enviarLote = useCallback(async (marcas: MarcaInput[], motivo?: string): Promise<Fallo[]> => {
    const claves = marcas.map((m) => clave(m.colaboradorId, m.fecha));
    // Fecha de cada clave, para poder armar el aviso «N marcas del jueves
    // 11/09» sin tener que reparsear la clave compuesta más abajo.
    const fechaPorClave = new Map(marcas.map((m) => [clave(m.colaboradorId, m.fecha), m.fecha]));
    // Instantánea de "qué versión de cada celda es esta petición": si al
    // volver la respuesta la celda ya tiene una versión MÁS NUEVA (un toque
    // posterior armó su propio flush), esta respuesta quedó vieja y NO debe
    // tocar esa celda — el flush del toque más nuevo ya se encarga.
    const versionEnvio = new Map(claves.map((k) => [k, versionRef.current.get(k) ?? 0]));
    const sigueVigente = (k: string) => versionRef.current.get(k) === versionEnvio.get(k);
    enVueloRef.current += 1;
    if (montadoRef.current) setGuardando(true);
    const fallos: Fallo[] = [];
    try {
      const res = await fetch("/api/rrhh/asistencia", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(motivo ? { marcas, motivo } : { marcas }),
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { guardadas: AsistenciaDTO[] };
        const vigentes = data.guardadas.filter((g) => sigueVigente(clave(g.colaboradorId, g.fecha)));
        // Lo que ya está en el servidor no necesita su foto: el próximo toque
        // vuelve a sacarla, y esa sí será una corrección de algo guardado.
        for (const k of claves) if (sigueVigente(k)) previaRef.current.delete(k);
        if (montadoRef.current) {
          setHoja((prev) => {
            if (!prev) return prev;
            const guardadasPorClave = new Map(vigentes.map((g) => [clave(g.colaboradorId, g.fecha), g]));
            const conservadas = prev.marcas.filter((m) => !guardadasPorClave.has(clave(m.colaboradorId, m.fecha)));
            return { ...prev, marcas: [...conservadas, ...vigentes] };
          });
          setErroresPorCelda((prev) => {
            const siguiente = new Map(prev);
            for (const k of claves) if (sigueVigente(k)) siguiente.delete(k);
            return siguiente;
          });
        }
      } else if (res.status === 422) {
        const data = (await res.json()) as { errores?: { colaboradorId: string; fecha: string; motivo: string; message: string }[] };
        const erroresVigentes = (data.errores ?? []).filter((e) => sigueVigente(clave(e.colaboradorId, e.fecha)));
        for (const e of erroresVigentes) fallos.push({ fecha: e.fecha, motivo: e.message });
        if (montadoRef.current) {
          setErroresPorCelda((prev) => {
            const siguiente = new Map(prev);
            for (const e of erroresVigentes) siguiente.set(clave(e.colaboradorId, e.fecha), e.message);
            return siguiente;
          });
        }
      } else {
        for (const k of claves) if (sigueVigente(k)) fallos.push({ fecha: fechaPorClave.get(k) ?? "", motivo: "No se pudo guardar" });
        if (montadoRef.current) {
          setErroresPorCelda((prev) => {
            const siguiente = new Map(prev);
            for (const k of claves) if (sigueVigente(k)) siguiente.set(k, "No se pudo guardar");
            return siguiente;
          });
        }
      }
    } catch (err) {
      sinDato("RRHH guardar asistencia")(err);
      for (const k of claves) if (sigueVigente(k)) fallos.push({ fecha: fechaPorClave.get(k) ?? "", motivo: "Sin conexión — reintenta" });
      if (montadoRef.current) {
        setErroresPorCelda((prev) => {
          const siguiente = new Map(prev);
          for (const k of claves) if (sigueVigente(k)) siguiente.set(k, "Sin conexión — reintenta");
          return siguiente;
        });
      }
    } finally {
      enVueloRef.current -= 1;
      if (montadoRef.current) {
        // Sólo se limpia `pendientes` de las claves que siguen vigentes: una
        // celda con un toque más nuevo todavía tiene SU flush por delante.
        setPendientes((prev) => {
          const siguiente = new Set(prev);
          for (const k of claves) if (sigueVigente(k)) siguiente.delete(k);
          return siguiente;
        });
        setGuardando(enVueloRef.current > 0);
      }
    }
    return fallos;
  }, []);

  /**
   * Se canceló el motivo: la corrección NO se guarda y la celda vuelve a lo
   * que el servidor tiene. Sube la versión de cada clave para que una
   * respuesta vieja en vuelo tampoco la reviva.
   */
  const revertirCorrecciones = useCallback((marcas: MarcaInput[]) => {
    const claves = marcas.map((m) => clave(m.colaboradorId, m.fecha));
    const enJuego = new Set(claves);
    // Las fotos se leen ACÁ, no adentro del updater: `setHoja` corre después
    // del `for` que limpia `previaRef`, y ahí ya no quedaría nada que
    // restaurar (la celda se borraba en vez de volver a su marca guardada).
    const restauradas = claves
      .map((k) => previaRef.current.get(k) ?? null)
      .filter((m): m is AsistenciaDTO => m !== null);
    setHoja((prev) => {
      if (!prev) return prev;
      const sinEsas = prev.marcas.filter((m) => !enJuego.has(clave(m.colaboradorId, m.fecha)));
      return { ...prev, marcas: [...sinEsas, ...restauradas] };
    });
    setPendientes((prev) => {
      const siguiente = new Set(prev);
      for (const k of claves) siguiente.delete(k);
      return siguiente;
    });
    for (const k of claves) {
      previaRef.current.delete(k);
      versionRef.current.set(k, (versionRef.current.get(k) ?? 0) + 1);
    }
  }, []);

  const flush = useCallback(async (): Promise<ResultadoFlush> => {
    if (bufferRef.current.size === 0) return { ok: true, fallos: [] };
    const marcas = [...bufferRef.current.values()];
    bufferRef.current.clear();

    /**
     * Corrección = la celda YA tenía una marca con id del servidor antes del
     * primer toque de esta tanda. La primera marca del día no lo es; tocar dos
     * veces la misma celda antes de que se guarde, tampoco.
     */
    const esCorreccion = (m: MarcaInput) => {
      const previa = previaRef.current.get(clave(m.colaboradorId, m.fecha));
      return !!previa && !previa.id.startsWith(ID_OPTIMISTA);
    };
    const correcciones = marcas.filter(esCorreccion);

    if (correcciones.length === 0) {
      const fallos = await enviarLote(marcas);
      if (!montadoRef.current && fallos.length > 0) avisarFallos(fallos);
      return { ok: fallos.length === 0, fallos };
    }

    // Lo que NO es corrección sale ya mismo: preguntar por una celda no puede
    // retener las otras 19 marcas frescas del día.
    const nuevas = marcas.filter((m) => !esCorreccion(m));
    const enVuelo: Promise<Fallo[]> = nuevas.length > 0 ? enviarLote(nuevas) : Promise.resolve([]);

    const cambios: CambioACorregir[] = correcciones.map((m) => {
      const previa = previaRef.current.get(clave(m.colaboradorId, m.fecha)) ?? null;
      return {
        colaboradorId: m.colaboradorId,
        fecha: m.fecha,
        nombre: hojaRef.current?.colaboradores.find((c) => c.id === m.colaboradorId)?.nombre ?? "Esta persona",
        antes: previa?.estado ?? null,
        despues: m.estado,
      };
    });
    const respuesta = await pedirMotivoCorreccion(cambios);

    let fallosDeCorreccion: Fallo[] = [];
    if (respuesta.tipo === "cancelado") {
      revertirCorrecciones(correcciones);
      // El flush del debounce no lo espera nadie: este toast es la única
      // devolución posible de «no se guardó, y por qué».
      const n = correcciones.length;
      toast.error(`No se ${n === 1 ? "guardó la corrección" : `guardaron las ${n} correcciones`}: sin motivo no se puede corregir.`);
    } else {
      // `sin-host` (nadie montó el modal) va sin motivo: perder la corrección
      // del usuario sería peor que perder el motivo.
      fallosDeCorreccion = await enviarLote(correcciones, respuesta.tipo === "motivo" ? respuesta.motivo : undefined);
    }

    const fallos = [...(await enVuelo), ...fallosDeCorreccion];
    if (!montadoRef.current && fallos.length > 0) avisarFallos(fallos);
    return { ok: fallos.length === 0, fallos };
  }, [enviarLote, revertirCorrecciones]);

  const guardarAhora = useCallback(async (): Promise<ResultadoFlush> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return flush();
  }, [flush]);

  const marcar = useCallback((input: MarcaInput) => {
    aplicarOptimista(input);
    const k = clave(input.colaboradorId, input.fecha);
    versionRef.current.set(k, (versionRef.current.get(k) ?? 0) + 1);
    bufferRef.current.set(k, input);
    setPendientes((prev) => new Set(prev).add(k));
    setErroresPorCelda((prev) => {
      if (!prev.has(k)) return prev;
      const siguiente = new Map(prev);
      siguiente.delete(k);
      return siguiente;
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, DEBOUNCE_MS);
  }, [aplicarOptimista, flush]);

  // Vaciar el buffer si el componente se va (cambio de día/mes, cerrar el hub).
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (bufferRef.current.size > 0) void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const masivo = useCallback(async (input: MasivoInput) => {
    setGuardando(true);
    try {
      const res = await fetch("/api/rrhh/asistencia/masivo", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "error_desconocido" })) as RrhhApiError;
        toast.error(error.message ?? "No se pudo hacer el masivo");
        return { ok: false as const, error };
      }
      const data = (await res.json()) as { creadas: number; reemplazadas: number; omitidos: OmitidoMasivo[] };
      recargar();
      return { ok: true as const, ...data };
    } finally {
      setGuardando(false);
    }
  }, [recargar]);

  return { hoja, loading, error, guardando, pendientes, erroresPorCelda, marcar, guardarAhora, masivo, recargar };
}
