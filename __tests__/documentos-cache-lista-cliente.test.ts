// @vitest-environment jsdom
/**
 * Caché de la lista del Archivo (22-10, «abrir el Archivo al instante»): se
 * guarda por quién mira, nunca en localStorage (Ley 29733, PCs compartidas),
 * una escritura al Archivo la borra y salir de la sesión no deja nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedJson, instalarInvalidacionPorEscritura, invalidateCachedJson, SOLO_LECTURA } from "@/lib/client-cache-fetch";
import {
  carpetasGuardadas,
  cuandoTerminenLasEscrituras,
  generacionEscrituras,
  guardarLista,
  listaGuardada,
  olvidarTodoElArchivo,
  pedirLista,
  precargarListaArchivo,
  QS_TODOS,
  qsDeFiltros,
  seGuarda,
} from "@/lib/documentos/cache-lista-cliente";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

let pedidos: string[] = [];
let yo: Record<string, unknown> = {};
let soltarEscritura: (() => void) | null = null;

function doc(id: string): DbDocument {
  return { id, name: `Contrato ${id}.pdf` } as DbDocument;
}
const carpeta = { id: "c1", name: "Contratos" } as DbDocumentFolder;

function responder(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  pedidos.push(init?.method && init.method !== "GET" ? `${init.method} ${url}` : url);
  const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200 }));
  if (url === "/api/auth/me") return json(yo);
  if (url.startsWith("/api/admin/documents/folders")) return json({ folders: [carpeta] });
  if (url.startsWith("/api/admin/documents?")) return json({ documents: [doc("srv")] });
  if (init?.method === "PATCH") {
    return new Promise((ok) => {
      soltarEscritura = () => ok(new Response("{}", { status: 200 }));
    });
  }
  return json({});
}

async function drenar() {
  for (let i = 0; i < 4; i++) await new Promise((ok) => setTimeout(ok, 0));
}

async function entrarComo(username: string, tenantId = "t1") {
  yo = { authenticated: true, tenantId, username, role: "owner" };
  invalidateCachedJson("/api/auth/me");
  await cachedJson("/api/auth/me");
}

beforeEach(async () => {
  pedidos = [];
  soltarEscritura = null;
  invalidateCachedJson();
  olvidarTodoElArchivo();
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(responder));
  // El envoltorio que avisa de las escrituras (en tests no se instala solo).
  vi.stubEnv("NODE_ENV", "development");
  Reflect.deleteProperty(window, Symbol.for("bsm.cachedJson.invalidaAlEscribir"));
  instalarInvalidacionPorEscritura();
  await entrarComo("ana");
  pedidos = [];
});

describe("cache de la lista del Archivo", () => {
  it("guarda por quién mira y nunca en localStorage", async () => {
    guardarLista(QS_TODOS, [doc("a")], [carpeta]);
    expect(listaGuardada(QS_TODOS)?.data.map((d) => d.id)).toEqual(["a"]);
    expect(carpetasGuardadas()?.data).toEqual([carpeta]);
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem("archivo:v1:ultima")).toContain("t1|ana|owner");

    // Otra persona en la misma PC (mismo rol, otro usuario): no ve lo de Ana.
    await entrarComo("beto");
    expect(listaGuardada(QS_TODOS)).toBeNull();
    expect(carpetasGuardadas()).toBeNull();
  });

  it("sin saber quién mira no guarda ni lee", () => {
    invalidateCachedJson("/api/auth/me");
    guardarLista(QS_TODOS, [doc("a")], null);
    expect(listaGuardada(QS_TODOS)).toBeNull();
  });

  it("una búsqueda escrita no se guarda; la vista «Todos» sí", () => {
    expect(seGuarda({ q: "dni" })).toBe(false);
    expect(seGuarda({ sinTags: ["personas"] })).toBe(true);
    expect(qsDeFiltros({ folderId: null, favorite: true })).toBe("folderId=null&favorite=1");
  });

  it("salir de la sesión borra la memoria y el sessionStorage", async () => {
    guardarLista(QS_TODOS, [doc("a")], [carpeta]);
    window.dispatchEvent(new Event("pagehide"));
    await window.fetch("/api/auth/logout", { method: "POST" });
    expect(sessionStorage.getItem("archivo:v1:ultima")).toBeNull();
    await entrarComo("ana");
    expect(listaGuardada(QS_TODOS)).toBeNull();
  });

  it("una escritura al Archivo borra lo guardado y avisa cuando termina; la velocidad no cuenta", async () => {
    guardarLista(QS_TODOS, [doc("a")], [carpeta]);
    const gen0 = generacionEscrituras();
    await window.fetch("/api/admin/documents/velocidad", { method: "POST", body: "{}" });
    expect(generacionEscrituras()).toBe(gen0);
    expect(listaGuardada(QS_TODOS)).not.toBeNull();
    // Un POST que sólo consulta (el plan de «Ordenar») tampoco.
    await window.fetch("/api/admin/documents/ordenar", { method: "POST", headers: { [SOLO_LECTURA]: "1" }, body: "{}" });
    expect(generacionEscrituras()).toBe(gen0);
    expect(listaGuardada(QS_TODOS)).not.toBeNull();

    const escritura = window.fetch("/api/admin/documents/x", { method: "PATCH", body: "{}" });
    expect(generacionEscrituras()).toBeGreaterThan(gen0);
    expect(listaGuardada(QS_TODOS)).toBeNull();
    const releer = vi.fn();
    cuandoTerminenLasEscrituras(releer);
    expect(releer).not.toHaveBeenCalled();
    soltarEscritura?.();
    await escritura;
    expect(releer).toHaveBeenCalledTimes(1);
  });

  it("la precarga y el hook comparten el pedido en vuelo", async () => {
    precargarListaArchivo();
    const delHook = pedirLista(QS_TODOS);
    await delHook;
    await drenar();
    expect(pedidos.filter((p) => p.startsWith("/api/admin/documents?"))).toHaveLength(1);
    expect(listaGuardada(QS_TODOS)?.data.map((d) => d.id)).toEqual(["srv"]);
    // Recién leída: pasar otra vez el puntero no vuelve a pedir.
    precargarListaArchivo();
    await drenar();
    expect(pedidos.filter((p) => p.startsWith("/api/admin/documents"))).toHaveLength(2);
  });
});
