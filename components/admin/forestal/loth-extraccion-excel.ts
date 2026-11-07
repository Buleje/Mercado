/**
 * loth-extraccion-excel — las hojas del Excel de «Extracción» (ADR-454):
 * por permiso (con el TOTAL del servidor), permiso × especie, por semana y
 * los avisos. Cifras con 4 decimales, como el libro. Puro.
 */

import type { ExtraccionResponse, FilaExtraccion } from "@/lib/forestal/loth-extraccion-tipos";
import type { HojaExcel } from "@/lib/export-excel";
import { limaDateKey } from "@/lib/utils";
import { nombrePermiso, ordenarAvisos } from "./loth-extraccion-shared";

const r4 = (n: number | null | undefined): number | string => (n == null ? "" : Math.round(n * 10_000) / 10_000);

function columnasDe(f: FilaExtraccion): Record<string, unknown> {
  return {
    "Censado m³": r4(f.censo.censadoM3),
    "Árboles censados": f.censo.censados,
    "Semilleros m³": r4(f.censo.semillerosM3),
    "Excluidos m³": r4(f.censo.excluidosM3),
    "Aprobado según censo m³": r4(f.censo.aprovechableM3),
    "Árboles aprovechables": f.censo.aprovechables,
    "Autorizado m³": r4(f.censo.autorizadoM3),
    "Talado m³": r4(f.talado.m3),
    "Árboles talados": f.talado.n,
    "Saldo de tala m³": r4(f.saldo.tala.m3),
    "Trozado m³": r4(f.trozado.m3),
    Trozas: f.trozado.n,
    "Saldo de trozado m³": r4(f.saldo.trozado.m3),
    "Despachado m³": r4(f.despachado.m3),
    "Trozas despachadas": f.despachado.n,
    "Saldo de despacho m³": r4(f.saldo.despacho.m3),
    "Consumido en el TH m³": r4(f.consumidoTh.m3),
    "En el monte m³": r4(f.enElMonte.m3),
    "Trozas en el monte": f.enElMonte.n,
    "Recibido en planta m³": r4(f.recibido.m3),
    "Aserrado m³": r4(f.aserrado.m3),
    "Saldo autorizado m³": r4(f.saldoAutorizado?.m3),
    "Avance %": f.avance.pct == null ? "" : Math.round(f.avance.pct * 10) / 10,
    "Tope contra": f.tope ? (f.tope.base === "autorizado" ? "autorizado" : "censo") : "",
  };
}

/** Las hojas del Excel: permisos, permiso × especie, semanas y avisos. Cifras con 4 decimales, como el libro. */
export function hojasDeExtraccion(d: ExtraccionResponse): HojaExcel[] {
  const permisos = d.permisos.map((p) => ({
    Permiso: nombrePermiso(p),
    Titular: p.titular ?? "",
    "Código del permiso": p.permiso?.codigo ?? "",
    ...columnasDe(p.total),
  }));
  const porEspecie = d.permisos.flatMap((p) =>
    p.especies.map((e) => ({ Permiso: nombrePermiso(p), Especie: e.etiqueta, ...columnasDe(e) })),
  );
  return [
    { nombre: "Por permiso", filas: [...permisos, { Permiso: "TOTAL", Titular: "", "Código del permiso": "", ...columnasDe(d.total) }] },
    { nombre: "Por especie", filas: porEspecie },
    {
      nombre: "Por semana",
      filas: d.semanas.map((s) => ({
        "Semana (lunes)": s.semana,
        "Talado m³": r4(s.taladoM3),
        "Trozado m³": r4(s.trozadoM3),
        "Despachado m³": r4(s.despachadoM3),
        "Talado acumulado m³": r4(s.taladoAcumM3),
        "Meta acumulada m³": r4(s.metaAcumM3),
      })),
    },
    {
      nombre: "Avisos",
      filas: ordenarAvisos(d.avisos).map((a) => ({
        Nivel: a.nivel === "error" ? "rojo" : a.nivel === "warning" ? "ámbar" : "info",
        Aviso: a.texto,
        Especie: a.especie ?? "",
        "m³": r4(a.cifraM3),
      })),
    },
  ];
}

/** `extraccion-libro-th-<alcance>-<hoy>` sin caracteres que Windows no acepta. */
export function nombreDeArchivo(alcance: string, hoy: string = limaDateKey()): string {
  const limpio = alcance.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `extraccion-libro-th-${limpio || "todos"}-${hoy}`;
}
