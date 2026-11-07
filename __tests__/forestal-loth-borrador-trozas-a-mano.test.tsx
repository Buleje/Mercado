/**
 * «Despachar con guía»: las trozas anotadas a mano sobreviven a que el modal se
 * vuelva a montar (15-10). Se monta el par real `useTrozasAMano` +
 * `useBorradorTrozasAMano` en StrictMode (los efectos corren dos veces: el
 * borrador no puede duplicar filas), se desmonta y se vuelve a montar.
 */
import { StrictMode, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTrozasAMano } from "@/components/admin/forestal/hooks/use-trozas-a-mano";
import {
  claveDelBorrador,
  useBorradorTrozasAMano,
} from "@/components/admin/forestal/hooks/use-borrador-trozas-a-mano";
import type { PreparadoGuiaLoth } from "@/components/admin/forestal/hooks/use-preparado-guia-loth";
import type { TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function prepDe(caratulaId: string, planes: string[] = ["plan-1", "plan-2"]): PreparadoGuiaLoth {
  return {
    caratula: { id: caratulaId } as PreparadoGuiaLoth["caratula"],
    planes: planes.map((id) => ({ id, isActive: id === planes[0] }) as PreparadoGuiaLoth["planes"][number]),
    permisos: {},
    trozas: [],
    talonario: { usadas: [] },
    ultimaGuia: null,
    ctpPropio: null,
  };
}

const UNA: TrozaAMano = { d1Cm: 40, d2Cm: 45, largoM: 3.2, cantidad: 1, especie: "Tornillo", arbolId: null };
const OTRA: TrozaAMano = { d1Cm: 50, d2Cm: 46, largoM: 4, cantidad: 3, especie: "Tornillo", arbolId: null };

function montar(prep: PreparadoGuiaLoth, planInicial: string | null = "plan-1") {
  return renderHook(
    () => {
      const [planId, setPlanId] = useState<string | null | undefined>(planInicial);
      const aMano = useTrozasAMano();
      const [registrada, setRegistrada] = useState(false);
      const borrador = useBorradorTrozasAMano({ prep, planId, setPlanId, aMano, registrada });
      return { planId, aMano, borrador, setRegistrada };
    },
    { wrapper: strict },
  );
}

const guardado = (prep: PreparadoGuiaLoth) => JSON.parse(sessionStorage.getItem(claveDelBorrador(prep)) ?? "null");

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("borrador de las trozas a mano (sessionStorage por libro)", () => {
  it("anota 2, el modal se desmonta y al volver están las 2 (una sola vez, aun en StrictMode)", () => {
    const prep = prepDe("car-1");
    const a = montar(prep);
    act(() => a.result.current.aMano.agregar(UNA));
    act(() => a.result.current.aMano.agregar(OTRA));
    expect(guardado(prep).filas).toHaveLength(2);
    a.unmount();

    const b = montar(prep);
    expect(b.result.current.aMano.filas.map((f) => f.d1Cm)).toEqual([40, 50]);
    expect(b.result.current.borrador.recuperado).toMatchObject({ filas: 2, trozas: 4 });
  });

  it("vuelve al plan del borrador si el plan sigue en el libro", () => {
    const prep = prepDe("car-1");
    const a = montar(prep, "plan-2");
    act(() => a.result.current.aMano.agregar(UNA));
    a.unmount();
    const b = montar(prep, "plan-1");
    expect(b.result.current.planId).toBe("plan-2");
  });

  it("«Descartar borrador» quita lo recuperado y deja lo anotado después, que pasa a ser el borrador", () => {
    const prep = prepDe("car-1");
    const a = montar(prep);
    act(() => a.result.current.aMano.agregar(UNA));
    a.unmount();
    const b = montar(prep);
    act(() => b.result.current.aMano.agregar(OTRA));
    act(() => b.result.current.borrador.descartar());
    expect(b.result.current.aMano.filas.map((f) => f.d1Cm)).toEqual([50]);
    expect(b.result.current.borrador.recuperado).toBeNull();
    expect(guardado(prep).filas.map((f: TrozaAMano) => f.d1Cm)).toEqual([50]);
  });

  it("al registrar la guía el borrador se olvida", () => {
    const prep = prepDe("car-1");
    const a = montar(prep);
    act(() => a.result.current.aMano.agregar(UNA));
    act(() => a.result.current.setRegistrada(true));
    expect(guardado(prep)).toBeNull();
  });

  it("no cruza de libro: otra carátula no ve el borrador", () => {
    const a = montar(prepDe("car-1"));
    act(() => a.result.current.aMano.agregar(UNA));
    a.unmount();
    const b = montar(prepDe("car-2"));
    expect(b.result.current.aMano.filas).toHaveLength(0);
    expect(b.result.current.borrador.recuperado).toBeNull();
  });

  it("un borrador roto o una fila que ya no pasa la revisión no se recupera; sin almacenamiento no rompe", () => {
    const prep = prepDe("car-1");
    sessionStorage.setItem(claveDelBorrador(prep), JSON.stringify({ v: 1, planId: "plan-1", filas: [{ ...UNA, d1Cm: -3 }, UNA], guardadoAt: 1 }));
    const a = montar(prep);
    expect(a.result.current.aMano.filas).toHaveLength(1);
    a.unmount();

    sessionStorage.setItem(claveDelBorrador(prep), "{roto");
    expect(montar(prep).result.current.aMano.filas).toHaveLength(0);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const c = montar(prepDe("car-3"));
    expect(() => act(() => c.result.current.aMano.agregar(UNA))).not.toThrow();
    expect(c.result.current.aMano.filas).toHaveLength(1);
  });
});
