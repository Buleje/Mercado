import { describe, expect, it } from "vitest";
import { cambioDeForm, formDeConfig } from "@/lib/semaforo/formulario";
import type { ConfigSemaforoGuardada } from "@/lib/semaforo/config";

const HOY = "2026-10-20";

describe("formulario de Ajustes del semáforo", () => {
  it("sin tocar nada no manda nada", () => {
    const g: ConfigSemaforoGuardada = { lanzamiento: "2026-11-09", indicadores: { caja: { verde: 400, amarillo: 400 } } };
    const f = formDeConfig(g);
    expect(f.lanzamiento).toBe("2026-11-09");
    expect(f.indicadores.caja.verde).toBe("400");
    expect(f.indicadores.recompra.verde).toBe("25");
    expect(cambioDeForm(f, f, g, HOY)).toEqual({ ok: true, cambio: {} });
  });

  it("manda sólo el campo cambiado; vacío = sin meta; coma decimal", () => {
    const g: ConfigSemaforoGuardada = {};
    const ini = formDeConfig(g);
    const f = structuredClone(ini);
    f.indicadores.ticket_promedio.verde = "99,5";
    f.indicadores.recompra.amarillo = "";
    const r = cambioDeForm(f, ini, g, HOY);
    expect(r).toEqual({
      ok: true,
      cambio: { indicadores: { ticket_promedio: { verde: 99.5 }, recompra: { amarillo: null } } },
    });
  });

  it("la frase del rojo no borra las otras acciones guardadas", () => {
    const g: ConfigSemaforoGuardada = { indicadores: { caja: { acciones: { amarillo: "Cuidar gastos" } } } };
    const ini = formDeConfig(g);
    const f = structuredClone(ini);
    f.indicadores.caja.rojo = "Parar gastos no urgentes";
    const r = cambioDeForm(f, ini, g, HOY);
    expect(r.ok && r.cambio.indicadores?.caja?.acciones).toEqual({ amarillo: "Cuidar gastos", rojo: "Parar gastos no urgentes" });
  });

  it("caja con la fecha de hoy; borrar la caja = null", () => {
    const ini = formDeConfig({});
    const r = cambioDeForm({ ...ini, caja: "450" }, ini, {}, HOY);
    expect(r).toEqual({ ok: true, cambio: { cajaAnotada: { monto: 450, fecha: HOY } } });
    const conCaja = formDeConfig({ cajaAnotada: { monto: 300, fecha: "2026-10-13" } });
    expect(cambioDeForm({ ...conCaja, caja: "" }, conCaja, {}, HOY)).toEqual({ ok: true, cambio: { cajaAnotada: null } });
  });

  it("decisión a medias o con letras → error que se entiende", () => {
    const ini = formDeConfig({});
    const r = cambioDeForm({ ...ini, decisionVerde: "1700" }, ini, {}, HOY);
    expect(r.ok).toBe(false);
    const letras = cambioDeForm({ ...ini, caja: "mil" }, ini, {}, HOY);
    expect(letras).toEqual({ ok: false, error: "Revisa la caja del lunes: tiene que ser un número." });
    const completa = cambioDeForm(
      { ...ini, decisionFecha: "2027-01-10", decisionVerde: "1700", decisionAmarillo: "800", decisionRecompra: "10" },
      ini,
      {},
      HOY,
    );
    expect(completa).toEqual({
      ok: true,
      cambio: { decision: { fecha: "2027-01-10", verde: 1700, amarillo: 800, rojoSiRecompraMenorA: 10 } },
    });
  });

  it("productos A en lista sin repetidos; anuncios en minúscula; apagar", () => {
    const ini = formDeConfig({});
    const f = structuredClone(ini);
    f.productosA = "MU001, MU002,MU001\nMU005";
    f.categoriasAnuncios = "Publicidad; Meta Ads";
    f.indicadores.sin_rotar.apagado = true;
    const r = cambioDeForm(f, ini, {}, HOY);
    expect(r).toEqual({
      ok: true,
      cambio: {
        productosA: ["MU001", "MU002", "MU005"],
        categoriasAnuncios: ["publicidad", "meta ads"],
        indicadores: { sin_rotar: { apagado: true } },
      },
    });
  });
});
