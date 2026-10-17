/**
 * «Abriste hace poco» (M06, noche 17-10): qué se anota de una URL, cómo se
 * ordena y qué pasa con lo guardado roto.
 */
import { describe, expect, it } from "vitest";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import {
  entradaDeUrl,
  idLegible,
  leerRecientes,
  limpiarTitulo,
  recienteCoincide,
  retitular,
  sumarReciente,
  TOPE_RECIENTES,
  type Reciente,
} from "@/lib/admin/recientes-panel";

const etiqueta = (tab: string) => (ALL_TABS.find((t) => t.id === tab)?.label as string | undefined) ?? null;

describe("entradaDeUrl", () => {
  it("una vista: título = la vista, camino = la pestaña; sin parámetros de paso", () => {
    const r = entradaDeUrl("/admin?tab=clientes&vista=crm&q=juan", etiqueta, null, 5);
    expect(r?.href).toBe("/admin?tab=clientes&vista=crm");
    expect(r?.tipo).toBeNull();
    expect(r?.camino).toBe(etiqueta("clientes"));
    expect(r?.en).toBe(5);
  });

  it("una ficha: el tipo, el título de la ventana y la ruta de regreso", () => {
    const r = entradaDeUrl("/admin?tab=clientes&vista=crm&cliente=987654321", etiqueta, "Rosa Flores");
    expect(r?.tipo).toBe("Cliente");
    expect(r?.titulo).toBe("Rosa Flores");
    expect(r?.href).toContain("cliente=987654321");
  });

  it("sin el nombre de la ventana usa un id legible, nunca un cuid", () => {
    expect(entradaDeUrl("/admin?tab=clientes&vista=crm&cliente=987654321", etiqueta)?.titulo).toBe("Cliente 987 654 321");
    expect(idLegible("cmpxiv6p4000bohvzwl6bnfpv")).toBeNull();
  });

  it("sin tab o con un tab que no existe no se anota", () => {
    expect(entradaDeUrl("/admin", etiqueta)).toBeNull();
    expect(entradaDeUrl("/admin?tab=no-existe", etiqueta)).toBeNull();
  });
});

const r = (href: string, titulo = href, en = 1): Reciente => ({ href, titulo, camino: "", tipo: null, en });

describe("la lista", () => {
  it("la nueva va arriba, sin repetidos y con tope", () => {
    let lista: Reciente[] = [];
    for (let i = 0; i < TOPE_RECIENTES + 3; i++) lista = sumarReciente(lista, r(`/admin?tab=t${i}`));
    lista = sumarReciente(lista, r("/admin?tab=t5"));
    expect(lista).toHaveLength(TOPE_RECIENTES);
    expect(lista[0].href).toBe("/admin?tab=t5");
    expect(lista.filter((x) => x.href === "/admin?tab=t5")).toHaveLength(1);
  });

  it("volver a una ficha sin leer el nombre no pisa el nombre leído", () => {
    const ficha = { ...r("/admin?tab=clientes&cliente=1", "Rosa Flores"), tipo: "Cliente" };
    const otra = sumarReciente([ficha], { ...ficha, titulo: "Cliente 1" });
    expect(otra[0].titulo).toBe("Rosa Flores");
  });

  it("retitular ignora los «Cargando…»", () => {
    expect(retitular([r("/admin?tab=a", "A")], "/admin?tab=a", "Cargando…")[0].titulo).toBe("A");
    expect(limpiarTitulo("  Rosa   Flores ")).toBe("Rosa Flores");
  });

  it("lo guardado roto o ajeno no rompe", () => {
    expect(leerRecientes("{no es json")).toEqual([]);
    expect(leerRecientes(JSON.stringify([{ href: "https://otro.sitio", titulo: "x", camino: "", en: 1 }]))).toEqual([]);
    expect(leerRecientes(JSON.stringify([r("/admin?tab=a")]))).toHaveLength(1);
  });

  it("coincide por título o camino, sin tildes y desde 2 letras", () => {
    const x = { ...r("/admin?tab=a", "Quién me debe"), camino: "Ventas & Caja" };
    expect(recienteCoincide(x, "quien")).toBe(true);
    expect(recienteCoincide(x, "caja")).toBe(true);
    expect(recienteCoincide(x, "q")).toBe(false);
  });
});
