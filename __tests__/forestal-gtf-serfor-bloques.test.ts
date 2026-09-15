import { describe, expect, it } from "vitest";
import {
  bloquesDeGuia,
  camposNoMapeados,
  completitudGuia,
  documentosDestinatario,
} from "@/lib/forestal/gtf-serfor-bloques";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";

/**
 * La guía de SERFOR mostrada como el papel (ADR-338).
 *
 * Lo que se prueba acá es lo que un fiscalizador cruza casillero por casillero:
 * que el (24) sea el RUC y el (23) el DNI, que los cuatro casilleros que la
 * consulta pública NO devuelve queden declarados como ausentes —y no como
 * "vacíos"—, y que nada de lo que SERFOR publicó se pierda en silencio.
 */

const GUIA: GtfSerfor = {
  numeroRegistro: "1-19-0313629",
  gtfNumber: "019-0000004",
  estado: "Activa",
  registradoPor: "SERFOR",
  fechaRegistro: "18/12/2024",
  fechaExpedicion: "18.12.2024",
  fechaVencimiento: "25.12.2024",
  origenRecurso: "PERMISO",
  numeroTitulo: "19-SEC/PER-FMC-2024-008",
  titular: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  direccionTitular: "CC.NN SAN LUIS DE CHINCHIHUANI",
  numeroResolucion: "R.A N° D000485-2024-MIDAGRI-SERFOR-ATFFS SELVA CENTRAL",
  representanteLegal: "OSVALDO MUÑOS DIAS",
  departamento: "PASCO",
  provincia: "OXAPAMPA",
  distrito: "PUERTO BERMUDEZ",
  rucInstancia: "20156701263",
  instanciaRegistra: "ATFFS SELVA CENTRAL",
  propietario: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  propietarioDoc: "20156701263",
  propietarioDireccion: "CC.NN SAN LUIS DE CHINCHIHUANI",
  propietarioDepartamento: "PASCO",
  propietarioProvincia: "OXAPAMPA",
  propietarioDistrito: "PUERTO BERMUDEZ",
  destinatario: "INVERSIONES AGROFORESTALES BLAS SAC",
  destinatarioDoc: "20605859438 / 80186494",
  destinatarioDireccion: "JR. JOSE MARIA ARGUEDAS MZA. 24 LOTE. 04 (4TA ETAPA)",
  destinatarioDepartamento: "PASCO",
  destinatarioProvincia: "OXAPAMPA",
  destinatarioDistrito: "CONSTITUCION",
  transportista: "RUBEN BAZAN ROSALES",
  transportistaDni: "48831805",
  licenciaConducir: "Q48831805",
  guiaRemision: null,
  tipoTransporte: "Terrestre",
  tipoVehiculo: "Camión / Carreta",
  placa: "V2H-901",
  listaTrozas: "019-0000004",
  productos: [],
  trozas: [],
  volumenTotal: 13.311,
  campos: {
    "Fecha de Expedición": "18.12.2024",
    "Estado del trámite": "APROBADO",
    "N° de Registro": "1-19-0313629",
  },
};

describe("bloques del documento", () => {
  const bloques = bloquesDeGuia(GUIA);

  it("son los cinco del papel, en su orden", () => {
    expect(bloques.map((b) => b.id)).toEqual(["guia", "propietario", "destinatario", "transportista", "producto"]);
  });

  it("cada casillero sale del campo que le corresponde", () => {
    const porNumero = new Map(
      bloques.flatMap((b) => b.casilleros.map((c) => [`${b.id}.${c.n ?? c.label}`, c])),
    );
    expect(porNumero.get("guia.6")?.valor).toBe("19-SEC/PER-FMC-2024-008");
    expect(porNumero.get("guia.12")?.valor).toBe("PUERTO BERMUDEZ");
    expect(porNumero.get("propietario.15")?.valor).toBe("20156701263");
    expect(porNumero.get("transportista.34")?.valor).toBe("Q48831805");
    expect(porNumero.get("producto.35")?.valor).toBe("019-0000004");
  });

  it("parte el documento del destinatario en sus DOS casilleros", () => {
    const destinatario = bloques.find((b) => b.id === "destinatario")!;
    const dni = destinatario.casilleros.find((c) => c.n === "23")!;
    const ruc = destinatario.casilleros.find((c) => c.n === "24")!;
    expect(ruc.valor).toBe("20605859438");
    expect(dni.valor).toBe("80186494");
  });

  it("un documento sin la barra deja el DNI vacío en vez de inventarlo", () => {
    expect(documentosDestinatario("20605859438")).toEqual({ ruc: "20605859438", dni: null });
    expect(documentosDestinatario(null)).toEqual({ ruc: null, dni: null });
  });

  it("los casilleros que la consulta no devuelve quedan marcados como ausentes", () => {
    const ausentes = bloques.flatMap((b) => b.casilleros.filter((c) => c.noPublicado).map((c) => c.n));
    expect(ausentes).toEqual(["9", "14", "20", "21", "36"]);
    // Ninguno finge tener dato.
    expect(bloques.flatMap((b) => b.casilleros).filter((c) => c.noPublicado).every((c) => c.valor === null)).toBe(true);
  });

  it("los vacíos del documento son null, no cadena vacía", () => {
    const remision = bloques.find((b) => b.id === "transportista")!.casilleros.find((c) => c.n === "29")!;
    expect(remision.valor).toBeNull();
    expect(remision.noPublicado).toBeUndefined();
  });
});

describe("completitud de la guía", () => {
  it("cuenta aparte lo que falta y lo que la consulta no publica", () => {
    const c = completitudGuia(bloquesDeGuia(GUIA));
    expect(c.ausentes).toBe(5);
    expect(c.enBlanco).toBe(1); // (29) guía de remisión
    expect(c.conDato + c.enBlanco).toBe(c.publicables);
  });

  it("una guía vacía no reporta datos, pero tampoco pierde los ausentes", () => {
    const crudo: Record<string, unknown> = { ...GUIA, campos: {} };
    for (const [k, v] of Object.entries(crudo)) {
      if (typeof v === "string" && k !== "numeroRegistro") crudo[k] = null;
    }
    const c = completitudGuia(bloquesDeGuia(crudo as unknown as GtfSerfor));
    expect(c.conDato).toBe(0);
    expect(c.ausentes).toBe(5);
  });
});

describe("campos que SERFOR publicó y ningún casillero muestra", () => {
  it("saca los que ya se ven y deja los nuevos", () => {
    const extra = camposNoMapeados(GUIA);
    expect(extra.map((c) => c.etiqueta)).toEqual(["Estado del trámite"]);
  });

  it("sin campos crudos no rompe", () => {
    expect(camposNoMapeados({ ...GUIA, campos: {} })).toEqual([]);
  });
});
