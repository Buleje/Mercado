import { describe, expect, it } from "vitest";
import { inicioDelBuscador, masUsadas, recientesSinRepetidos } from "@/lib/admin/mas-usadas";
import { CLAVE_DESDE, type ContadorDeUso } from "@/lib/admin/orden-por-uso";
import type { Reciente } from "@/lib/admin/recientes-panel";

const etiqueta = (t: string) => ({ plata: "Plata", clientes: "Clientes", compras: "Compras" })[t as "plata"] ?? null;
const c = (o: Record<string, [number, number]>): ContadorDeUso => ({
  [CLAVE_DESDE]: { n: 0, ultima: 1 },
  ...Object.fromEntries(Object.entries(o).map(([k, [n, ultima]]) => [k, { n, ultima }])),
});

describe("masUsadas", () => {
  it("ordena por aperturas y desempata por la más reciente", () => {
    const r = masUsadas(c({ "clientes:": [3, 10], "plata:": [5, 1], "compras:": [3, 20] }), etiqueta);
    expect(r.map((x) => x.tab)).toEqual(["plata", "compras", "clientes"]);
  });
  it("ignora #desde, tabs que no existen y sin contador da vacío", () => {
    expect(masUsadas(null, etiqueta)).toEqual([]);
    expect(masUsadas(c({ "nada:x": [9, 1] }), etiqueta)).toEqual([]);
  });
  it("suma las claves que caen al mismo lugar y respeta el tope y 'fuera'", () => {
    const r = masUsadas(c({ "plata:viejaA": [2, 1], "plata:viejaB": [2, 5], "clientes:": [1, 1] }), etiqueta);
    expect(r[0]).toMatchObject({ tab: "plata", n: 4, ultima: 5 });
    expect(masUsadas(c({ "plata:": [2, 1], "clientes:": [1, 1] }), etiqueta, ["/admin?tab=plata"]).map((x) => x.tab)).toEqual(["clientes"]);
    expect(masUsadas(c({ "plata:": [2, 1], "clientes:": [1, 1] }), etiqueta, [], 1)).toHaveLength(1);
  });
});

describe("recientesSinRepetidos", () => {
  it("quita lo que ya salió en más usadas", () => {
    const rec = [{ href: "/admin?tab=plata" }, { href: "/admin?tab=clientes" }] as Reciente[];
    const u = masUsadas(c({ "plata:": [1, 1] }), etiqueta);
    expect(recientesSinRepetidos(rec, u).map((r) => r.href)).toEqual(["/admin?tab=clientes"]);
  });
});

describe("inicioDelBuscador", () => {
  const rec = (href: string): Reciente => ({ href, titulo: href, camino: "", ts: 1 }) as unknown as Reciente;
  it("saca el lugar actual, lo no permitido y no repite entre usadas y recientes", () => {
    const k = c({ "plata:": [5, 1], "clientes:": [3, 1], "compras:": [1, 1] });
    const r = inicioDelBuscador(k, [rec("/admin?tab=plata"), rec("/admin?tab=clientes"), rec("/admin?tab=otro")], etiqueta, "/admin?tab=plata", (h) => h !== "/admin?tab=compras");
    expect(r.usadas.map((x) => x.tab)).toEqual(["clientes"]);
    expect(r.recientes.map((x) => x.href)).toEqual(["/admin?tab=otro"]);
  });
  it("persona nueva: todo vacío", () => {
    expect(inicioDelBuscador(null, [], etiqueta, null)).toEqual({ usadas: [], recientes: [] });
  });
});
