/**
 * Revisión ADR-445 (27-09) · A': «con cubicación» sólo cuando la medición
 * alcanza para TODO lo que ampara. Una cubicación atada al lunes y al martes
 * no pinta en verde a los dos: el día no la cuenta (abarca otro día) y la
 * corrida tampoco (no se sabe cuánto declaró el otro día).
 */
import { expect, it } from "vitest";
import { origenYSalidaDelDia, origenYSalidaDeCorrida } from "@/lib/forestal/origen-y-salida-del-dia";
import {
  necesarioDelDia,
  origenVisibleDelDia,
  origenVisibleDeCorrida,
} from "@/components/admin/forestal/marcas-del-dia";

const corrida = (id: string, m3 = 3.2) => ({
  id, cantidad: m3, m3Declarado: m3, paquetes: [], despachado: 0, reprocesado: 0, usado: false, salidas: [], apartados: [],
});
const cub = (corridas: string[], m3 = 3.2075) => [{ id: "cub-lunes", nombre: "Lote lunes", m3, pt: 1360, piezas: 102, corridas }];

it("atada sólo al lunes: el lunes y su corrida dicen «con cubicación»", () => {
  const dia = origenYSalidaDelDia([corrida("c-lunes")], cub(["c-lunes"]));
  expect(origenVisibleDelDia(dia)).toBe("con_cubicacion");
  const c = origenYSalidaDeCorrida(corrida("c-lunes"), { idsDelDia: ["c-lunes"], cubicaciones: cub(["c-lunes"]) });
  expect(origenVisibleDeCorrida(c)).toBe("con_cubicacion");
});

it("atada al lunes Y al martes: ninguno de los dos días ni sus corridas se pintan en verde", () => {
  const ambas = cub(["c-lunes", "c-martes"]);
  const lunes = origenYSalidaDelDia([corrida("c-lunes")], ambas);
  const martes = origenYSalidaDelDia([corrida("c-martes")], ambas);
  expect(origenVisibleDelDia(lunes)).toBe("por_tipo");
  expect(origenVisibleDelDia(martes)).toBe("por_tipo");
  const cMartes = origenYSalidaDeCorrida(corrida("c-martes"), { idsDelDia: ["c-martes"], cubicaciones: ambas });
  expect(origenVisibleDeCorrida(cMartes)).toBe("por_tipo");
  expect(origenVisibleDeCorrida(cMartes, necesarioDelDia([{ id: "c-martes", m3: 3.2, origenYSalida: cMartes }]))).toBe(
    "por_tipo",
  );
});

it("dos corridas del MISMO día con una cubicación que sólo alcanza para una: ninguna en verde", () => {
  const ids = ["c-a", "c-b"];
  const corta = cub(ids); // 3.2075 m³ para 6.4 declarados
  const a = origenYSalidaDeCorrida(corrida("c-a"), { idsDelDia: ids, cubicaciones: corta });
  const b = origenYSalidaDeCorrida(corrida("c-b"), { idsDelDia: ids, cubicaciones: corta });
  const delDia = necesarioDelDia([
    { id: "c-a", m3: 3.2, origenYSalida: a },
    { id: "c-b", m3: 3.2, origenYSalida: b },
  ]);
  expect(origenVisibleDeCorrida(a, delDia)).toBe("por_tipo");
  expect(origenVisibleDeCorrida(b, delDia)).toBe("por_tipo");
  expect(origenVisibleDelDia(origenYSalidaDelDia([corrida("c-a"), corrida("c-b")], corta))).toBe("por_tipo");

  /* Con una que alcanza para las dos, las dos (y el día) en verde. */
  const larga = cub(ids, 6.415);
  const a2 = origenYSalidaDeCorrida(corrida("c-a"), { idsDelDia: ids, cubicaciones: larga });
  const b2 = origenYSalidaDeCorrida(corrida("c-b"), { idsDelDia: ids, cubicaciones: larga });
  const delDia2 = necesarioDelDia([
    { id: "c-a", m3: 3.2, origenYSalida: a2 },
    { id: "c-b", m3: 3.2, origenYSalida: b2 },
  ]);
  expect(origenVisibleDeCorrida(a2, delDia2)).toBe("con_cubicacion");
  expect(origenVisibleDeCorrida(b2, delDia2)).toBe("con_cubicacion");
  expect(origenVisibleDelDia(origenYSalidaDelDia([corrida("c-a"), corrida("c-b")], larga))).toBe("con_cubicacion");
});
