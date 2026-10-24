/**
 * La ficha de la libreta y la hoja de la guía dicen lo mismo (revisión 16-10-2026).
 *
 * La ficha sella cada dato «Guía» (sale en el papel) o «Interno». Si un dato
 * sellado «Guía» no tiene casillero en `casillerosGtf` (la única fuente de la
 * hoja A4 y del talonario), la ficha miente: pasó con la placa del remolque,
 * que la ficha marcaba «Guía» y la hoja no imprimía.
 *
 * Por cada papel se llena SÓLO ese dato en el bloque que lo recibe y se mira
 * que su casillero lo traiga. Un campo «Guía» nuevo sin fila en `MAPA` hace
 * fallar el test: obliga a decir dónde sale.
 */
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import type { Parte, RolParte, Vehiculo } from "@/lib/forestal/directorio";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { casillerosGtf, cuerpoGtfOficial, type CasillerosGtf, type CuerpoGtfInput } from "@/lib/forestal/ctp-gtf-formato";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import { fichaDeParte, fichaDeVehiculo } from "@/lib/forestal/libreta";
import type { LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";

const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];
const DATOS = JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown;
const DOC = {
  gtfNumber: "019-001-0000482", gtfDate: "2026-09-02", tipo: "trozas", titularName: "PEREZ MUÑOZ JUAN CARLOS",
  tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null, conductor: null,
  conductorLicencia: null, placaVehiculo: null, origen: null, destino: null, observations: null, status: "emitida",
  annulledReason: null, volumenTotalM3: null, items: [], gtfDatos: DATOS,
} as unknown as LothGtfDoc;
const BASE = entradasDeLaGuia(DOC, null).cuerpo;

type Bloque = "destinatario" | "propietario" | "partida" | "conductor";
type Clave = "nombre" | "documento" | "direccion" | "ubigeo" | "autorizacion" | "tipoEstablecimiento" | "licencia";
type Fila = { poner: (d: GtfDatos) => void; casilleros: (keyof CasillerosGtf)[]; valor: string };

const UBI = { departamento: "UCAYALI", provincia: "CORONEL PORTILLO", distrito: "YARINACOCHA" };

/** Vacía el bloque (lo que traía la guía de prueba) y llena sólo un dato. */
function soloEsto(bloque: Bloque, d: GtfDatos, poner: (b: Record<string, string>) => void): void {
  if (bloque === "conductor") {
    Object.assign(d.vehiculo, { conductor: "", conductorDni: "", licencia: "" });
    poner(d.vehiculo as unknown as Record<string, string>);
    return;
  }
  const vacio = { nombre: "", docTipo: "RUC", docNumero: "", direccion: "", departamento: "", provincia: "", distrito: "", dniExtra: "" };
  if (bloque === "partida") {
    d.traslado.partida = { ...d.traslado.partida, ...vacio, modo: "establecimiento", autorizacion: "", tipoEstablecimiento: "" };
    poner(d.traslado.partida as unknown as Record<string, string>);
    return;
  }
  Object.assign(d[bloque], vacio, bloque === "destinatario" ? { autorizacion: "" } : {});
  poner(d[bloque] as unknown as Record<string, string>);
}

/** Cómo llega cada dato de la ficha al bloque y en qué casilleros sale. */
function filasDe(bloque: Bloque, cas: Partial<Record<Clave, (keyof CasillerosGtf)[]>>): Partial<Record<Clave, Fila>> {
  const fila = (casilleros: (keyof CasillerosGtf)[], valor: string, poner: (b: Record<string, string>) => void): Fila => ({
    casilleros,
    valor,
    poner: (d) => soloEsto(bloque, d, poner),
  });
  const out: Partial<Record<Clave, Fila>> = {};
  const nombreCampo = bloque === "conductor" ? "conductor" : "nombre";
  if (cas.nombre) out.nombre = fila(cas.nombre, "MADERERA DEL ORIENTE", (b) => (b[nombreCampo] = "MADERERA DEL ORIENTE"));
  if (cas.documento)
    out.documento = fila(cas.documento, bloque === "conductor" ? "45871236" : "20156698963", (b) => {
      if (bloque === "conductor") b.conductorDni = "45871236";
      else Object.assign(b, { docTipo: "RUC", docNumero: "20156698963" });
    });
  if (cas.direccion) out.direccion = fila(cas.direccion, "JR. TACNA 123", (b) => (b.direccion = "JR. TACNA 123"));
  if (cas.ubigeo) out.ubigeo = fila(cas.ubigeo, "", (b) => Object.assign(b, UBI));
  if (cas.autorizacion) out.autorizacion = fila(cas.autorizacion, "25-UCA/DEP-0042", (b) => (b.autorizacion = "25-UCA/DEP-0042"));
  if (cas.tipoEstablecimiento)
    out.tipoEstablecimiento = fila(cas.tipoEstablecimiento, "Depósito", (b) => (b.tipoEstablecimiento = "Depósito"));
  if (cas.licencia) out.licencia = fila(cas.licencia, "Q45871236", (b) => (b.licencia = "Q45871236"));
  return out;
}

const DESTINATARIO = filasDe("destinatario", { nombre: ["22"], documento: ["24"], direccion: ["25"], ubigeo: ["26", "27", "28"], autorizacion: ["d22"] });
const MAPA: Record<RolParte, Partial<Record<Clave, Fila>>> = {
  destinatario: DESTINATARIO,
  cliente: DESTINATARIO,
  proveedor: filasDe("propietario", { nombre: ["13"], documento: ["15"], direccion: ["16"], ubigeo: ["17", "18", "19"] }),
  establecimiento: filasDe("partida", { nombre: ["p17"], direccion: ["p20a"], ubigeo: ["p20b", "p20c", "p20d"], autorizacion: ["p18"], tipoEstablecimiento: ["p19"] }),
  conductor: filasDe("conductor", { nombre: ["32"], documento: ["33"], licencia: ["34"] }),
  transportista: {},
};

const LLENA: Parte = {
  id: "p1", roles: ["destinatario"], nombre: "Maderera del Oriente SAC", categoria: "empresa", codigoCtp: "25-UCA/DEP-0042",
  docTipo: "RUC", docNumero: "20156698963", direccion: "Jr. Tacna 123", region: "Ucayali", provincia: "Coronel Portillo",
  distrito: "Yarinacocha", zona: null, ubigeo: null, telefono: null, email: null, registroMtc: "15M-001", licencia: "Q45871236",
  tituloHabilitante: null, resolucion: null, planManejo: null, arffs: null, representante: null, representanteDni: null,
  notas: null, activo: true, usos: 0, ultimoUso: null, logo: null, adjuntos: [],
};

function conDatos(poner: (d: GtfDatos) => void): CuerpoGtfInput {
  const c = structuredClone(BASE);
  poner(c.datos);
  return c;
}

describe("cada dato «Guía» de la ficha tiene casillero en la hoja", () => {
  for (const rol of Object.keys(MAPA) as RolParte[]) {
    it(rol, () => {
      const guia = fichaDeParte(LLENA, rol).grupos.flatMap((g) => g.campos).filter((c) => c.sello === "guia");
      for (const c of guia) {
        const fila = MAPA[rol][c.clave as Clave];
        expect(fila, `${rol}: «${c.etiqueta}» dice «Guía» y no tiene fila en el MAPA`).toBeDefined();
        if (!fila) continue;
        const v = casillerosGtf(conDatos(fila.poner));
        for (const k of fila.casilleros) {
          expect(v[k], `${rol}: «${c.etiqueta}» → (${k})`).not.toBe("");
          if (fila.valor) expect(v[k], `${rol}: «${c.etiqueta}» → (${k})`).toContain(fila.valor);
        }
      }
    });
  }

  it("el (22) del destinatario sale siempre en la hoja (formato 2024, ADR-494), como avisa la ficha", () => {
    const aut = fichaDeParte(LLENA, "destinatario").grupos.flatMap((g) => g.campos).find((c) => c.clave === "autorizacion");
    expect(aut?.condicion).toBe("solo si recibe un establecimiento");
    const con = conDatos((d) => {
      d.destinatario.autorizacion = "25-UCA/C-OPE-777";
      d.traslado.partida = { ...d.traslado.partida, modo: "inicio" };
    });
    expect(cuerpoGtfOficial(con)).toContain("25-UCA/C-OPE-777");
    const sin = conDatos((d) => {
      d.destinatario.autorizacion = "25-UCA/C-OPE-777";
      d.traslado.partida = { ...d.traslado.partida, modo: "" };
    });
    // Formato 2024 (ADR-494): el (22) sale siempre, con o sin punto de partida.
    expect(cuerpoGtfOficial(sin)).toContain("25-UCA/C-OPE-777");
  });
});

describe("vehículo: placa, remolque y tipo salen en la hoja", () => {
  const v: Vehiculo = {
    id: "v1", placa: "ABC123", placaRemolque: "XYZ456", marca: "Volvo", tipo: "Camión", configuracion: null, capacidadM3: null,
    transportistaId: null, transportistaNombre: null, notas: null, activo: true, usos: 0, ultimoUso: null,
  };
  const MAPA_VEH: Record<string, { poner: (d: GtfDatos) => void; casillero: keyof CasillerosGtf; valor: string }> = {
    placa: { poner: (d) => Object.assign(d.vehiculo, { placa: "ABC-123", placaRemolque: "" }), casillero: "31p", valor: "ABC-123" },
    remolque: { poner: (d) => Object.assign(d.vehiculo, { placa: "", placaRemolque: "XYZ-456" }), casillero: "31p", valor: "XYZ-456" },
    tipo: { poner: (d) => Object.assign(d.vehiculo, { tipo: "Camión" }), casillero: "31", valor: "Camión" },
  };

  it("cada «Guía» de la ficha del vehículo tiene casillero", () => {
    const guia = fichaDeVehiculo(v).grupos.flatMap((g) => g.campos).filter((c) => c.sello === "guia");
    expect(guia.map((c) => c.clave).sort()).toEqual(["placa", "remolque", "tipo"]);
    for (const c of guia) {
      const f = MAPA_VEH[c.clave];
      expect(f, `«${c.etiqueta}» sin fila`).toBeDefined();
      expect(casillerosGtf(conDatos(f.poner))[f.casillero], c.etiqueta).toContain(f.valor);
    }
  });

  it("«Placa(s) N°» lleva las dos placas en la hoja y en el talonario (misma fuente); la embarcación, sólo su matrícula", () => {
    const dos = conDatos((d) => Object.assign(d.vehiculo, { modo: "terrestre", placa: "ABC-123", placaRemolque: "XYZ-456" }));
    expect(casillerosGtf(dos)["31p"]).toBe("ABC-123 / XYZ-456");
    expect(cuerpoGtfOficial(dos)).toContain("ABC-123 / XYZ-456");
    const fluvial = conDatos((d) => Object.assign(d.vehiculo, { modo: "fluvial", placa: "PA-1234", placaRemolque: "XYZ-456" }));
    expect(casillerosGtf(fluvial)["31p"]).toBe("PA-1234");
  });
});
