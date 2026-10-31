/**
 * `usePlantillasGuia`: el ORDEN al aplicar una plantilla de otro permiso
 * (16-10-2026). La revisión encontró que la plantilla quedaba pendiente si la
 * siembra no cambiaba `datos` (sin talonario) o si cambiaban el plan a mano,
 * y caía sobre la próxima edición. Y que podía pasar la guía a un plan sin
 * trozas para despachar. Cada caso falla si el defecto vuelve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { contenidoDesdeDatos, type PlantillaGuia } from "@/lib/forestal/gtf-plantillas";
import { ESPERA_SIEMBRA_MS, usePlantillasGuia } from "@/components/admin/forestal/hooks/use-plantillas-guia";
import type { DespachoGuiaLoth } from "@/components/admin/forestal/hooks/use-despacho-guia-loth";

const PLANES = [
  { id: "plan-a", planNumber: "12-2024", planType: "PO", titularName: "Juan Pérez" },
  { id: "plan-b", planNumber: "7-2025", planType: "PO", titularName: "Rosa Díaz" },
];
const prep = { planes: PLANES, permisos: {} };

/** La plantilla: título del plan B y un destinatario. */
function plantilla(): PlantillaGuia {
  const d = gtfDatosVacio();
  const llena: GtfDatos = {
    ...d,
    titulos: ["16-UCA/C-OPP-007-25"],
    guia: { ...d.guia, autoridad: "ATFFS Ucayali" },
    destinatario: { ...d.destinatario, nombre: "Maderera San Juan SAC", docNumero: "20123456789" },
  };
  return {
    id: "p1",
    nombre: "PO 7-2025 → Maderera San Juan",
    contenido: contenidoDesdeDatos(llena, ["titulo", "destinatario"], { planId: "plan-b", etiqueta: "PO 7-2025 · Rosa Díaz" }),
    creadaEn: "2026-10-16T10:00:00.000Z",
    creadaPor: "",
    actualizadaEn: "2026-10-16T10:00:00.000Z",
    usadaEn: null,
    usos: 0,
  };
}

/**
 * El despacho de mentira: plan y datos con estado de verdad, y la siembra
 * (un VALOR, como `use-despacho-guia-loth`) en un efecto declarado DESPUÉS
 * del hook, para que corra después, como el del padre.
 */
function useDespachoFalso({ siembra, conTrozas }: { siembra: boolean; conTrozas: string[] }) {
  const [planId, setPlanId] = useState<string | null>("plan-a");
  const [datos, setDatos] = useState<GtfDatos>(() => ({ ...gtfDatosVacio(), titulos: ["T-plan-a"] }));
  const g = {
    prep,
    plan: PLANES.find((p) => p.id === planId) ?? null,
    planId,
    identidad: null,
    planesConTrozas: PLANES.filter((p) => conTrozas.includes(p.id)),
    datos,
    setDatos,
    setPlanId,
    numeroQueSePierde: () => null,
  } as unknown as DespachoGuiaLoth;
  const pl = usePlantillasGuia(g);
  const sembrado = useRef(planId);
  useEffect(() => {
    if (!siembra || sembrado.current === planId) return;
    sembrado.current = planId;
    setDatos({ ...gtfDatosVacio(), titulos: [`T-${planId}`] });
  }, [siembra, planId]);
  return { pl, datos, planId, setPlanId, setDatos };
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ plantillas: [] }), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("usar una plantilla de otro permiso", () => {
  it("espera la siembra del plan nuevo y va encima: el título es el del plan, el destino el de la plantilla", async () => {
    const { result } = renderHook(() => useDespachoFalso({ siembra: true, conTrozas: ["plan-a", "plan-b"] }));
    expect(result.current.pl.estado(plantilla()).tipo).toBe("cambia");
    act(() => result.current.pl.usar(plantilla()));
    expect(result.current.planId).toBe("plan-b");
    expect(result.current.datos.titulos).toEqual(["T-plan-b"]);
    expect(result.current.datos.destinatario.nombre).toBe("Maderera San Juan SAC");
    expect(result.current.pl.aviso).toMatch(/^Rellené con «PO 7-2025/);
  });

  it("sin siembra (sin talonario) no queda colgada: se aplica al tope, sin esperar otra edición", async () => {
    const { result } = renderHook(() => useDespachoFalso({ siembra: false, conTrozas: ["plan-a", "plan-b"] }));
    act(() => result.current.pl.usar(plantilla()));
    expect(result.current.planId).toBe("plan-b");
    expect(result.current.datos.destinatario.nombre).toBe("");
    await waitFor(() => expect(result.current.datos.destinatario.nombre).toBe("Maderera San Juan SAC"), { timeout: ESPERA_SIEMBRA_MS * 3 });
  });

  it("si cambian el plan a mano antes, se descarta: la próxima edición no la trae", async () => {
    const { result } = renderHook(() => useDespachoFalso({ siembra: false, conTrozas: ["plan-a", "plan-b"] }));
    act(() => result.current.pl.usar(plantilla()));
    act(() => result.current.setPlanId("plan-a"));
    await act(() => espera(ESPERA_SIEMBRA_MS + 100));
    act(() => result.current.setDatos((d) => ({ ...d, observaciones: "editado a mano" })));
    act(() => result.current.setPlanId("plan-b"));
    await act(() => espera(ESPERA_SIEMBRA_MS + 100));
    expect(result.current.datos.observaciones).toBe("editado a mano");
    expect(result.current.datos.destinatario.nombre).toBe("");
    expect(result.current.pl.aviso).toBeNull();
  });

  it("un permiso sin trozas para despachar no cambia el plan: el título se salta y se dice por qué", () => {
    const { result } = renderHook(() => useDespachoFalso({ siembra: true, conTrozas: ["plan-a"] }));
    expect(result.current.pl.estado(plantilla()).tipo).toBe("sin_trozas");
    act(() => result.current.pl.usar(plantilla()));
    expect(result.current.planId).toBe("plan-a");
    expect(result.current.datos.titulos).toEqual(["T-plan-a"]);
    expect(result.current.datos.guia.autoridad).toBe("");
    expect(result.current.datos.destinatario.nombre).toBe("Maderera San Juan SAC");
    expect(result.current.pl.aviso).toContain("el título no: ese permiso no tiene trozas para despachar");
  });
});
