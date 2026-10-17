import { describe, expect, it } from "vitest";
import {
  analizarPedidos,
  muestraDe,
  textoDuracion,
  zonaDeDireccion,
  type PedidoAnalisis,
} from "@/lib/pedidos/analisis-operativo";

const AHORA = new Date("2026-10-17T20:00:00Z");
const MIN = 60_000;

/** Un pedido que pasó por los estados dados, cada uno `pasos[i]` minutos después del anterior. */
function pedido(id: string, estados: string[], pasos: number[], extra: Partial<PedidoAnalisis> = {}): PedidoAnalisis {
  const creado = Date.parse("2026-10-17T14:00:00Z"); // 9:00 de Lima, sábado
  let t = creado;
  let de = "pendiente";
  const historial = estados.map((a, i) => {
    t += pasos[i] * MIN;
    const ev = { de, a, cuando: new Date(t).toISOString(), nota: null as string | null };
    de = a;
    return ev;
  });
  return {
    id,
    cliente: `Cliente ${id}`,
    estado: estados.at(-1) ?? "pendiente",
    origen: "direct",
    total: 20,
    creado: new Date(creado).toISOString(),
    motivo: null,
    repartidor: null,
    costoReparto: null,
    direccion: "",
    historial,
    ...extra,
  };
}

describe("muestraDe", () => {
  it("mediana par e impar, p90 y los ids del más lento al más rápido", () => {
    const m = muestraDe([
      { id: "a", ms: 10 },
      { id: "b", ms: 30 },
      { id: "c", ms: 20 },
    ]);
    expect(m).toMatchObject({ n: 3, medianaMs: 20, promedioMs: 20, p90Ms: 30, ids: ["b", "c", "a"] });
    expect(muestraDe([{ id: "a", ms: 10 }, { id: "b", ms: 20 }]).medianaMs).toBe(15);
    expect(muestraDe([]).medianaMs).toBeNull();
  });
});

describe("analizarPedidos", () => {
  const entregado = pedido("e1", ["confirmado", "preparando", "en_camino", "entregado"], [5, 10, 30, 20], {
    repartidor: "Luis",
    costoReparto: 5,
    direccion: "Jr. Ucayali 123 · frente al parque",
  });
  const saltado = pedido("e2", ["confirmado", "en_camino", "entregado"], [15, 40, 25], { repartidor: "Luis" });
  const cancelado = pedido("c1", ["confirmado", "cancelado"], [5, 60], {
    motivo: "Cliente no contesta",
    historial: [
      { de: "pendiente", a: "confirmado", cuando: "2026-10-17T14:05:00Z", nota: null },
      { de: "confirmado", a: "cancelado", cuando: "2026-10-17T15:05:00Z", nota: null },
    ],
  });
  const cancelado2 = pedido("c2", ["cancelado"], [3], { motivo: "cliente NO contesta " });

  const r = analizarPedidos(
    [entregado, saltado, cancelado, cancelado2],
    [{ id: "x1", cliente: "Rosa", estado: "confirmado", enEstadoDesde: "2026-10-17T17:00:00Z" }, { id: "x2", cliente: "Tito", estado: "preparando", enEstadoDesde: "2026-10-17T19:30:00Z" }],
    [{ nombre: "Centro", barrios: ["Jr. Ucayali"] }],
    AHORA,
  );

  it("cada etapa cuenta sólo a los que pasaron por sus dos estados", () => {
    const etapa = (k: string) => r.etapas.find((e) => e.clave === k)!.muestra;
    expect(etapa("confirmar").n).toBe(3);
    expect(etapa("empezar")).toMatchObject({ n: 1, medianaMs: 10 * MIN });
    // e2 se saltó «preparando»: no entra en «Preparar y despachar».
    expect(etapa("salir")).toMatchObject({ n: 1, medianaMs: 30 * MIN });
    expect(etapa("llevar").n).toBe(2);
    expect(r.hastaEntregar).toMatchObject({ n: 2, medianaMs: 72.5 * MIN });
  });

  it("agrupa cancelados por motivo sin tildes ni mayúsculas, con desde qué estado", () => {
    expect(r.cancelados).toHaveLength(1);
    expect(r.cancelados[0]).toMatchObject({ pedidos: 2, monto: 40, desde: { confirmado: 1, pendiente: 1 } });
  });

  it("repartidor: sólo entregados; el costo sólo con la tarifa registrada", () => {
    expect(r.repartidores).toEqual([
      expect.objectContaining({ nombre: "Luis", entregados: 2, costo: 5, ids: ["e1", "e2"] }),
    ]);
    expect(r.costoReparto).toEqual({ total: 5, entregadosConTarifa: 1, entregados: 2 });
  });

  it("zona por barrio escrito en la dirección; atascados ≥2 h, el que más espera primero", () => {
    expect(r.zonas.find((z) => z.zona === "Centro")).toMatchObject({ pedidos: 1, entregados: 1 });
    expect(r.zonas.find((z) => z.zona === "Sin zona reconocida")?.pedidos).toBe(3);
    expect(r.atascados.map((a) => a.id)).toEqual(["x1"]);
  });

  it("demanda por franja y día de Lima", () => {
    expect(r.franjas).toEqual([expect.objectContaining({ clave: "manana", pedidos: 4 })]);
    expect(r.dias).toEqual([expect.objectContaining({ rotulo: "Sábado", pedidos: 4 })]);
  });
});

describe("zonaDeDireccion y textoDuracion", () => {
  it("gana el texto más largo", () => {
    const zonas = [{ nombre: "Yarinacocha", barrios: [] }, { nombre: "Norte", barrios: ["Yarinacocha Norte"] }];
    expect(zonaDeDireccion("Av. Yarinacocha Norte 5", zonas)).toBe("Norte");
    expect(zonaDeDireccion("", zonas)).toBeNull();
  });

  it("escribe duraciones cortas y largas", () => {
    expect(textoDuracion(null)).toBe("Sin datos");
    expect(textoDuracion(12 * MIN)).toBe("12 min");
    expect(textoDuracion(200 * MIN)).toBe("3 h 20 min");
    expect(textoDuracion(3 * 24 * 60 * MIN)).toBe("3 días");
  });
});
