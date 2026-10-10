/**
 * La llegada del traslado sigue al destinatario en los dos libros, también en
 * StrictMode (desarrollo): el updater de `setState` corre dos veces y una
 * escritura a un `ref` ahí adentro dejaba de seguir al destinatario desde el
 * segundo cambio.
 */
import { StrictMode, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { datosInicialesLoth, identidadDelTitulo, rellenarGuiaLoth } from "@/lib/forestal/loth-guia-despacho";
import { useTrasladoGuiaLoth } from "@/components/admin/forestal/hooks/use-traslado-guia-loth";
import { useTrasladoGuiaCtp } from "@/components/admin/forestal/hooks/use-traslado-guia-ctp";

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function conDestinatario(d: GtfDatos, direccion: string): GtfDatos {
  return { ...d, destinatario: { ...d.destinatario, nombre: "Cliente", direccion, departamento: "LIMA", provincia: "LIMA", distrito: "ATE" } };
}

describe("la llegada sigue al destinatario (StrictMode)", () => {
  it("Libro TH: cambia el destinatario dos veces y la llegada lo sigue las dos", () => {
    const { result } = renderHook(
      () => {
        const [datos, setDatos] = useState<GtfDatos>(gtfDatosVacio());
        const h = useTrasladoGuiaLoth({ datos, setDatos, talonario: null, trozas: 1 });
        return { datos, setDatos, h };
      },
      { wrapper: strict },
    );
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Uno 1")));
    expect(result.current.datos.traslado.puntoLlegada).toBe("Av. Uno 1, ATE, LIMA, LIMA");
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Dos 2")));
    expect(result.current.datos.traslado.puntoLlegada).toBe("Av. Dos 2, ATE, LIMA, LIMA");
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Tres 3")));
    expect(result.current.datos.traslado.puntoLlegada).toBe("Av. Tres 3, ATE, LIMA, LIMA");
  });

  it("Libro CTP: lo mismo", () => {
    const { result } = renderHook(
      () => {
        const [datos, setDatos] = useState<GtfDatos>(gtfDatosVacio());
        useTrasladoGuiaCtp({ datos, setDatos, ficha: null });
        return { datos, setDatos };
      },
      { wrapper: strict },
    );
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Uno 1")));
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Dos 2")));
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Tres 3")));
    expect(result.current.datos.traslado.puntoLlegada).toBe("Av. Tres 3, ATE, LIMA, LIMA");
  });

  it("Libro TH: lo escrito a mano en la llegada no lo pisa el destinatario", () => {
    const { result } = renderHook(
      () => {
        const [datos, setDatos] = useState<GtfDatos>(gtfDatosVacio());
        const h = useTrasladoGuiaLoth({ datos, setDatos, talonario: null, trozas: 1 });
        return { datos, setDatos, h };
      },
      { wrapper: strict },
    );
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Uno 1")));
    act(() => result.current.h.setPunto("llegada", { direccion: "Mi patio" }));
    act(() => result.current.setDatos((p) => conDestinatario(p, "Av. Dos 2")));
    expect(result.current.datos.traslado.llegada.direccion).toBe("Mi patio");
  });
});

describe("rellenarGuiaLoth no hereda la partida de otro bosque", () => {
  it("un plan sin ubicación no toma la partida (por casilleros) de la guía anterior", () => {
    const id = identidadDelTitulo({
      plan: { planType: "DEMA", tituloHabilitante: "19-SEC/PER-FMC-2024-008", titularName: "Juan Pérez" },
      caratula: { titularName: "Juan Pérez", dni: "40404040" },
    });
    const base = gtfDatosVacio();
    const anterior = {
      ...base,
      traslado: { ...base.traslado, partida: { direccion: "Otro bosque", departamento: "Ucayali", provincia: "Coronel Portillo", distrito: "Callería" }, puntoPartida: "Otro bosque, Callería, Coronel Portillo, Ucayali" },
    };
    const d = rellenarGuiaLoth(datosInicialesLoth(id, "2026-09-29"), { ultimaGuia: anterior, emision: "2026-09-29" });
    expect(d.traslado.puntoPartida).not.toContain("Otro bosque");
    expect(d.traslado.partida.direccion).not.toBe("Otro bosque");
  });
});
