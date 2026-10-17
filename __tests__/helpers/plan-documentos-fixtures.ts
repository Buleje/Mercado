/**
 * Fixtures de «Documentos del plan» (ADR-467) para los tests de la pantalla:
 * una vista del servidor y un `fetch` que enruta como las rutas reales y
 * anota cada llamada (método, ruta, cuerpo).
 */
import { vi } from "vitest";
import type { CarpetaDelPlan, PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";

const campo = (id: string, formulario: string, clave: string, nombre: string, soloParaRegistroId: string | null = null) => ({
  id,
  formulario,
  clave,
  nombre,
  descripcion: null,
  tipo: "archivo" as const,
  opciones: [],
  soloParaRegistroId,
  orden: 1,
  activo: true,
});

export function carpeta(over: Partial<CarpetaDelPlan> & Pick<CarpetaDelPlan, "clave" | "nombre">): CarpetaDelPlan {
  return { folderId: null, plantillaId: `t-${over.clave}`, soloEstePlan: false, orden: 1, casilleros: [], sueltos: [], subcarpetas: 0, ...over };
}

/** La vista de un plan con la plantilla sugerida. `preparada` = con carpetas en el Drive. */
export function vistaDePlan(planId: string, preparada: boolean, extra: CarpetaDelPlan[] = []): PlanDocumentosVista {
  const f = (id: string) => (preparada ? id : null);
  const carpetas: CarpetaDelPlan[] = [
    carpeta({
      clave: "resolucion",
      nombre: "Registro de plantación / Resolución",
      folderId: f("f-res"),
      orden: 1,
      casilleros: [
        { campo: campo("c-res", "forestal.plan.documentos.resolucion", "resolucion-o-constancia-de-registro", "Resolución o constancia de registro"), estado: "falta", archivos: [], venceEl: null },
      ],
    }),
    carpeta({
      clave: "jefe",
      nombre: "Jefe / representante (DNI, actas, poderes)",
      folderId: f("f-jefe"),
      orden: 2,
      casilleros: [
        { campo: campo("c-dni", "forestal.plan.documentos.jefe", "dni-del-jefe-o-representante", "DNI del jefe o representante"), estado: "falta", archivos: [], venceEl: null },
      ],
    }),
    ...extra,
  ];
  return {
    planId,
    planType: "PO",
    carpetaRaizId: preparada ? "f-raiz" : null,
    rutaRaiz: "Libro TH/QA TITULAR/PO-1",
    preparada,
    carpetas,
    resumen: { esperados: 2, cargados: 0, faltan: 2, vencenPronto: 0, vencidos: 0 },
    delPlan: { resolucionNumber: "RDF 1", resolucionDate: "2026-01-15", representanteLegal: null, propietarioNombre: null },
  };
}

export interface Llamada {
  metodo: string;
  ruta: string;
  cuerpo: unknown;
}

type Respuesta = { status?: number; json?: unknown };
type Ruteo = (l: Llamada) => Respuesta | undefined;

/**
 * Un `fetch` que responde como el servidor. `ruteo` decide primero (para
 * inyectar fallas); si devuelve `undefined`, contesta lo de siempre.
 */
export function servidorFalso(planId: string, ruteo: Ruteo = () => undefined) {
  const llamadas: Llamada[] = [];
  let preparada = false;
  let extra: CarpetaDelPlan[] = [];
  let docs = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const metodo = (init?.method ?? "GET").toUpperCase();
    const cuerpo = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : null;
    const l: Llamada = { metodo, ruta: url.pathname + url.search, cuerpo };
    llamadas.push(l);
    const r = ruteo(l) ?? porDefecto(l);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });

  function porDefecto(l: Llamada): Respuesta {
    const p = l.ruta.split("?")[0];
    if (p === "/api/admin/forestal/plan/documentos/preparar") {
      preparada = true;
      return { json: { vista: vistaDePlan(planId, true, extra) } };
    }
    if (p === "/api/admin/forestal/plan/documentos/carpetas" && l.metodo === "POST") {
      const nombre = (l.cuerpo as { nombre: string }).nombre;
      extra = [...extra, carpeta({ clave: "contratos", nombre, folderId: "f-contratos", orden: 5, soloEstePlan: true })];
      return { json: { vista: vistaDePlan(planId, true, extra) } };
    }
    if (p === "/api/admin/forestal/plan/documentos") return { json: { vista: vistaDePlan(planId, preparada, extra) } };
    if (p === "/api/admin/campos-personalizados" && l.metodo === "POST") {
      const b = l.cuerpo as { formulario: string; nombre: string; tipo: string; soloParaRegistroId: string | null };
      /* El casillero nuevo aparece en su carpeta a partir de ahora. */
      extra = extra.map((c) =>
        `forestal.plan.documentos.${c.clave}` === b.formulario
          ? { ...c, casilleros: [...c.casilleros, { campo: campo("c-nuevo", b.formulario, "contrato", b.nombre, b.soloParaRegistroId), estado: "falta", archivos: [], venceEl: null }] }
          : c,
      );
      return { status: 201, json: { campo: { id: "c-nuevo", ...b, clave: "contrato", opciones: [], orden: 1, activo: true, descripcion: null } } };
    }
    if (p === "/api/admin/campos-personalizados") return { json: { campos: [], valores: [] } };
    if (p === "/api/admin/documents" && l.metodo === "POST") {
      docs += 1;
      const file = (l.cuerpo as FormData).get("file") as File;
      return { json: { document: { id: `doc-${docs}`, name: file.name, tags: [file.type.startsWith("image/") ? "imagen" : "pdf"], folderId: (l.cuerpo as FormData).get("folderId") } } };
    }
    if (p.startsWith("/api/admin/documents/") && l.metodo === "PATCH") return { json: { document: { id: p.split("/").pop() } } };
    return { json: {} };
  }

  const de = (metodo: string, prefijo: string) => llamadas.filter((l) => l.metodo === metodo && l.ruta.startsWith(prefijo));
  return { fetchMock, llamadas, de };
}

export const pdf = (nombre = "resolucion.pdf") => new File(["%PDF-1.4 prueba"], nombre, { type: "application/pdf" });
export const foto = (nombre = "dni.jpg") => new File(["jpg"], nombre, { type: "image/jpeg" });
