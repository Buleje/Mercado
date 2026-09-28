"use client";

/**
 * use-vincular-trozas — «¿De qué trozas salió?» del lado de la pantalla.
 *
 * Brandon (27-09): «al producir eliges el lote, y sus trozas se descuentan
 * solas». Tres lecturas y una escritura, todas contra
 * `/api/admin/forestal/ctp/vincular-trozas` (la regla vive en
 * `lib/forestal/vincular-trozas.ts`, no acá):
 *
 *  - `useTrozasDeLaDeclaracion`: la propuesta de trozas ANTES de declarar, una
 *    por especie. La persona desmarca las que no entraron.
 *  - `vincularLoDeclarado`: el SEGUNDO acto, después de declarar. Si falla, la
 *    corrida queda declarada sin origen y se dice por qué: nunca se pierde la
 *    declaración.
 *  - `useDiagnosticoSinOrigen`: la bandeja de las ya declaradas, por motivo.
 *
 * Nada se vincula sin que alguien lo confirme: la propuesta sólo marca.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type {
  DiagnosticoCorrida,
  DiagnosticoSinOrigen,
  MotivoSinOrigen,
  ResultadoVincularTrozas,
  TrozaPropuesta,
} from "@/lib/forestal/vincular-trozas";

export const URL_VINCULAR_TROZAS = "/api/admin/forestal/ctp/vincular-trozas";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

async function leerJson(r: Response): Promise<Record<string, unknown> | null> {
  let j: unknown = null;
  try {
    j = await r.json();
  } catch {
    /* Cuerpo vacío o que no es JSON (un 502 del proxy): decide el status. */
  }
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
}

/** Lo que se le dice a la persona cuando el servidor no manda su frase. */
function mensajePorStatus(status: number): string {
  if (status === 401) return "Tu sesión venció. Vuelve a entrar.";
  if (status === 403) return "Tu usuario no puede descontar trozas.";
  if (status === 409) return "Otra persona usó esas trozas. Revisa y vuelve a elegir.";
  if (status === 404) return "No se encontró la producción.";
  return `El servidor respondió ${status}.`;
}

// ── Escribir ────────────────────────────────────────────────────────────────

/** Ata las trozas elegidas a UNA corrida ya declarada. Nunca tira: devuelve el resultado. */
export async function vincularTrozas(
  corridaId: string,
  trozaIds: readonly string[],
): Promise<ResultadoVincularTrozas> {
  try {
    const r = await fetch(URL_VINCULAR_TROZAS, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ corridaId, trozaIds }),
    });
    const j = await leerJson(r);
    if (r.ok && j?.ok === true) return j as unknown as ResultadoVincularTrozas;
    return {
      ok: false,
      error: typeof j?.error === "string" ? j.error : `HTTP_${r.status}`,
      message: typeof j?.message === "string" && j.message ? j.message : mensajePorStatus(r.status),
    };
  } catch {
    return { ok: false, error: "SIN_CONEXION", message: "Sin conexión. No se descontaron las trozas." };
  }
}

/** Lo de una corrida recién declarada: qué se le pidió atar y qué contestó el servidor. */
export interface VinculoDeCorrida {
  corridaId: string;
  lineNo: number | null;
  especie: string;
  /** `null` = no había trozas marcadas: se declaró sin origen a propósito. */
  resultado: ResultadoVincularTrozas | null;
}

/**
 * El segundo acto de «Declarar y descontar trozas»: un pedido por corrida, con
 * las trozas marcadas de SU especie. Corre después de que la declaración ya
 * quedó escrita.
 */
export async function vincularLoDeclarado(
  corridas: readonly { id: string; lineNo: number | null; especie: string }[],
  marcadasDe: (clave: string) => readonly string[],
): Promise<VinculoDeCorrida[]> {
  return Promise.all(
    corridas.map(async (c) => {
      const ids = marcadasDe(claveEspecie(c.especie));
      return {
        corridaId: c.id,
        lineNo: c.lineNo,
        especie: c.especie,
        resultado: ids.length > 0 ? await vincularTrozas(c.id, ids) : null,
      };
    }),
  );
}

/** El remate del mensaje de registro y las fallas, cada una en su renglón. */
export function textoDeVinculos(vinculos: readonly VinculoDeCorrida[]): {
  texto: string;
  fallas: string[];
  /** Las especies que se declararon sin trozas a propósito (ninguna marcada). */
  sinTrozas: string[];
} {
  let trozas = 0;
  let m3 = 0;
  const fallas: string[] = [];
  const sobreElTope: string[] = [];
  const sinTrozas: string[] = [];
  for (const v of vinculos) {
    if (!v.resultado) {
      sinTrozas.push(v.especie);
      continue;
    }
    if (v.resultado.ok) {
      trozas += v.resultado.trozas;
      m3 += v.resultado.m3;
      /* Pasa el 56 % (ADR-358): se avisa, no se corrige. */
      if (v.resultado.sobreElTope) sobreElTope.push(v.lineNo != null ? `N.º ${v.lineNo}` : v.especie);
    } else {
      const n = v.lineNo != null ? `N.º ${v.lineNo} ` : "";
      fallas.push(`${n}${v.especie} quedó sin trozas: ${v.resultado.message}`);
    }
  }
  const partes: string[] = [];
  if (trozas > 0) partes.push(`Se descontaron ${trozas} ${trozas === 1 ? "troza" : "trozas"} (${r4(m3)} m³).`);
  if (sobreElTope.length > 0) partes.push(`Ojo: ${sobreElTope.join(", ")} rinde más del 56 %.`);
  partes.push(...fallas);
  return { texto: partes.join(" "), fallas, sinTrozas };
}

// ── Leer: la propuesta antes de declarar ────────────────────────────────────

export interface PropuestaDeEspecie {
  clave: string;
  especie: string;
  m3: number;
  cargando: boolean;
  error: string | null;
  propuesta: TrozaPropuesta[];
  motivo: MotivoSinOrigen | null;
  detalle: string;
}

interface Leida {
  propuesta: TrozaPropuesta[];
  motivo: MotivoSinOrigen | null;
  detalle: string;
}

export interface TrozasDeLaDeclaracion {
  especies: PropuestaDeEspecie[];
  /** Las trozas marcadas de una especie (por `claveEspecie`). */
  marcadas: (clave: string) => TrozaPropuesta[];
  estaMarcada: (trozaId: string) => boolean;
  alternar: (trozaId: string) => void;
  marcarTodas: (clave: string, marcar: boolean) => void;
  hayMarcadas: boolean;
  reintentar: () => void;
  /** Tras declarar: las trozas usadas ya no están libres, se vuelve a pedir todo. */
  reiniciar: () => void;
}

/**
 * Pide una propuesta por especie (fecha, permiso y m³ de lo que se declara) y
 * guarda lo que la persona DESmarcó. Arranca todo marcado: la propuesta es la
 * mejor respuesta del sistema, y desmarcar lo que no entró es más corto que
 * buscar lo que sí.
 */
export function useTrozasDeLaDeclaracion({
  corridas,
  fecha,
  contratoId,
  permiso = null,
  activo = true,
}: {
  corridas: readonly { especie: string; m3: number }[];
  fecha: string;
  /** El permiso de trabajo (id). Manda sobre `permiso`. */
  contratoId: string | null;
  /** El código escrito en el asiento, si no es el de trabajo. */
  permiso?: string | null;
  activo?: boolean;
}): TrozasDeLaDeclaracion {
  const [leidas, setLeidas] = useState<Record<string, Leida | { error: string }>>({});
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());
  const [vuelta, setVuelta] = useState(0);

  const pedidos = useMemo(
    () =>
      corridas
        .filter((c) => claveEspecie(c.especie))
        .map((c) => {
          const p = new URLSearchParams({ propuesta: "1", especie: c.especie, fecha, m3: String(r4(c.m3)) });
          if (contratoId) p.set("contratoId", contratoId);
          else if (permiso) p.set("permiso", permiso);
          return { clave: claveEspecie(c.especie), especie: c.especie, m3: c.m3, url: `${URL_VINCULAR_TROZAS}?${p}` };
        }),
    [corridas, fecha, contratoId, permiso],
  );
  const urls = pedidos.map((p) => p.url).join("\n");
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  /* Cada URL se pide UNA vez (lleva todos los parámetros: fecha, permiso, m³),
     así que una respuesta vieja no puede pisar a otra: cae en su propia llave. */
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    if (!activo || !urls || !fechaValida) return;
    for (const url of urls.split("\n")) {
      if (pedidas.current.has(url)) continue;
      pedidas.current.add(url);
      fetch(url, { credentials: "include" })
        .then(async (r) => {
          const j = await leerJson(r);
          if (!r.ok) throw new Error(typeof j?.message === "string" && j.message ? j.message : mensajePorStatus(r.status));
          return {
            propuesta: Array.isArray(j?.propuesta) ? (j.propuesta as TrozaPropuesta[]) : [],
            motivo: typeof j?.motivo === "string" ? (j.motivo as MotivoSinOrigen) : null,
            detalle: typeof j?.detalle === "string" ? j.detalle : "",
          };
        })
        .then((l) => setLeidas((prev) => ({ ...prev, [url]: l })))
        .catch((e: unknown) =>
          setLeidas((prev) => ({ ...prev, [url]: { error: e instanceof Error ? e.message : "No se pudo leer." } })),
        );
    }
  }, [activo, urls, fechaValida, vuelta]);

  const especies = useMemo<PropuestaDeEspecie[]>(
    () =>
      pedidos.map((p) => {
        const l = leidas[p.url];
        const base = { clave: p.clave, especie: p.especie, m3: p.m3 };
        /* Sin fecha no se pide nada: «Buscando…» para siempre mentiría. */
        if (!fechaValida)
          return { ...base, cargando: false, error: null, propuesta: [], motivo: null, detalle: "Pon la fecha para buscar las trozas." };
        if (!l) return { ...base, cargando: true, error: null, propuesta: [], motivo: null, detalle: "" };
        if ("error" in l) return { ...base, cargando: false, error: l.error, propuesta: [], motivo: null, detalle: "" };
        return { ...base, cargando: false, error: null, ...l };
      }),
    [pedidos, leidas, fechaValida],
  );

  const marcadas = useCallback(
    (clave: string) => especies.find((e) => e.clave === clave)?.propuesta.filter((t) => !desmarcadas.has(t.trozaId)) ?? [],
    [especies, desmarcadas],
  );
  const alternar = useCallback(
    (id: string) =>
      setDesmarcadas((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );
  const marcarTodas = useCallback(
    (clave: string, marcar: boolean) => {
      const ids = especies.find((e) => e.clave === clave)?.propuesta.map((t) => t.trozaId) ?? [];
      setDesmarcadas((prev) => {
        const n = new Set(prev);
        for (const id of ids) if (marcar) n.delete(id);
        else n.add(id);
        return n;
      });
    },
    [especies],
  );

  return {
    especies,
    marcadas,
    estaMarcada: (id) => !desmarcadas.has(id),
    alternar,
    marcarTodas,
    hayMarcadas: especies.some((e) => e.propuesta.some((t) => !desmarcadas.has(t.trozaId))),
    reintentar: () => {
      for (const [url, l] of Object.entries(leidas)) if ("error" in l) pedidas.current.delete(url);
      setLeidas((prev) => Object.fromEntries(Object.entries(prev).filter(([, l]) => !("error" in l))));
      setVuelta((v) => v + 1);
    },
    reiniciar: () => {
      pedidas.current.clear();
      setLeidas({});
      setDesmarcadas(new Set());
      setVuelta((v) => v + 1);
    },
  };
}

// ── Leer: la bandeja de las ya declaradas ───────────────────────────────────

/** Una corrida, fresca: tras un 409 la propuesta que se mostraba ya no vale. */
export async function leerCorridaSinOrigen(corridaId: string): Promise<DiagnosticoCorrida | null> {
  try {
    const r = await fetch(`${URL_VINCULAR_TROZAS}?corridaId=${encodeURIComponent(corridaId)}`, {
      credentials: "include",
    });
    return r.ok ? ((await r.json()) as DiagnosticoCorrida) : null;
  } catch {
    return null;
  }
}

export function useDiagnosticoSinOrigen({ activo, clave = "" }: { activo: boolean; clave?: string }) {
  const [datos, setDatos] = useState<DiagnosticoSinOrigen | null>(null);
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState<string | null>(null);
  /* Sólo escribe el último pedido: una lectura vieja no pisa la vigente. */
  const ultimo = useRef(0);

  const recargar = useCallback(async () => {
    if (!activo) return;
    const n = ++ultimo.current;
    setCargando(true);
    try {
      const r = await fetch(`${URL_VINCULAR_TROZAS}?diagnostico=1`, { credentials: "include" });
      const j = await leerJson(r);
      if (n !== ultimo.current) return;
      if (!r.ok || !j || !Array.isArray(j.corridas)) {
        throw new Error(typeof j?.message === "string" && j.message ? j.message : mensajePorStatus(r.status));
      }
      setDatos(j as unknown as DiagnosticoSinOrigen);
      setError(null);
    } catch (e) {
      if (n !== ultimo.current) return;
      setError(e instanceof Error ? e.message : "No se pudo revisar.");
    } finally {
      if (n === ultimo.current) setCargando(false);
    }
  }, [activo]);

  /* `clave` cambia cuando el libro cambió (se declaró, se vinculó): se relee. */
  useEffect(() => {
    void recargar();
  }, [recargar, clave]);

  return { datos, cargando, error, recargar };
}

// ── La bandeja: una fila por motivo ─────────────────────────────────────────

export interface FilaDeBandeja {
  motivo: MotivoSinOrigen;
  corridas: DiagnosticoCorrida[];
  /** Guías distintas que nombran sus propuestas (0 = el servidor no las dijo). */
  guias: number;
  /** Trozas distintas en sus propuestas. */
  trozas: number;
}

/** En el orden en que se resuelven: lo que ya se puede vincular, primero. */
export const ORDEN_MOTIVOS: readonly MotivoSinOrigen[] = [
  "lista",
  "llegada_posterior",
  "fila_de_otra_especie",
  "guia_sin_recibir",
  "apertura",
  "sin_trozas_de_la_especie",
];

export function filasDeBandeja(d: DiagnosticoSinOrigen): FilaDeBandeja[] {
  return ORDEN_MOTIVOS.map((motivo) => {
    const corridas = d.corridas.filter((c) => c.motivo === motivo);
    const trozas = corridas.flatMap((c) => c.propuesta);
    return {
      motivo,
      corridas,
      guias: new Set(trozas.map((t) => t.gtfNumber).filter(Boolean)).size,
      trozas: new Set(trozas.map((t) => t.trozaId)).size,
    };
  }).filter((f) => f.corridas.length > 0);
}
