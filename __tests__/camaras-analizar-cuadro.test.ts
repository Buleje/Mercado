/**
 * «Analizar» del vivo de Hik-Connect (ADR-471): el tope por cámara, el cuadro
 * de EZUIKit convertido en la foto que se sube, y lo que se le dice al que mira.
 */
import { describe, expect, it } from "vitest";
import type { Captura } from "@/lib/camaras/camaras";
import {
  base64DeCaptura,
  capturaAnalizada,
  formularioDeAnalisis,
  imagenDeBase64,
  mensajeDeSubida,
  resumenDeLectura,
  segundosParaAnalizar,
} from "@/components/admin/forestal/camaras/analizar-cuadro";
import { vecesMas } from "@/components/admin/forestal/camaras/use-mosaico-nube";

/** Cabecera JPEG real (FF D8 FF E0 …) + relleno: lo que importa es que viaje entera. */
const BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const B64 = Buffer.from(BYTES).toString("base64");

const lectura = (l: Partial<NonNullable<Captura["lectura"]>>): Pick<Captura, "lectura"> => ({
  lectura: {
    descripcion: null,
    hayPersona: false,
    hayVehiculo: false,
    personas: null,
    placa: null,
    confianza: "alta",
    motivo: null,
    ...l,
  },
});

describe("segundosParaAnalizar — 1 análisis cada 10 s por cámara", () => {
  it("la primera vez se puede", () => {
    expect(segundosParaAnalizar(undefined, 1_000_000)).toBe(0);
  });
  it("a los 3 s faltan 7; a los 9,2 s falta 1 (redondea hacia arriba)", () => {
    expect(segundosParaAnalizar(1_000_000, 1_003_000)).toBe(7);
    expect(segundosParaAnalizar(1_000_000, 1_009_200)).toBe(1);
  });
  it("a los 10 s justos ya se puede", () => {
    expect(segundosParaAnalizar(1_000_000, 1_010_000)).toBe(0);
  });
  it("con el reloj corrido hacia atrás nunca pide más que el tope", () => {
    expect(segundosParaAnalizar(1_000_000, 900_000)).toBe(10);
  });
});

describe("base64DeCaptura — lo que devuelve capturePicture de ezuikit-js 9.0.23", () => {
  it("la promesa: { code, data: { fileName, base64 } }", () => {
    expect(base64DeCaptura({ id: "x", code: 0, data: { fileName: "a", base64: `data:image/jpeg;base64,${B64}` }, type: "handleCapturePicture" })).toBe(`data:image/jpeg;base64,${B64}`);
  });
  it("el callback: { fileName, base64 }; o el string pelado", () => {
    expect(base64DeCaptura({ fileName: "a", base64: B64 })).toBe(B64);
    expect(base64DeCaptura(` ${B64} `)).toBe(B64);
  });
  it("nada que sirva → null", () => {
    expect(base64DeCaptura(undefined)).toBeNull();
    expect(base64DeCaptura({ data: { base64: "" } })).toBeNull();
    expect(base64DeCaptura({ code: -1, msg: "fallo" })).toBeNull();
  });
});

describe("imagenDeBase64 — el cuadro como archivo", () => {
  it("con prefijo data: conserva el tipo y los bytes exactos", async () => {
    const b = imagenDeBase64(`data:image/jpeg;base64,${B64}`);
    expect(b?.type).toBe("image/jpeg");
    expect(new Uint8Array(await b!.arrayBuffer())).toEqual(BYTES);
  });
  it("sin prefijo asume JPEG; image/jpg → image/jpeg; png se respeta", () => {
    expect(imagenDeBase64(B64)?.type).toBe("image/jpeg");
    expect(imagenDeBase64(`data:image/jpg;base64,${B64}`)?.type).toBe("image/jpeg");
    expect(imagenDeBase64(`data:image/png;base64,${B64}`)?.type).toBe("image/png");
  });
  it("base64 roto o vacío → null (no se sube basura)", () => {
    expect(imagenDeBase64("")).toBeNull();
    expect(imagenDeBase64("data:image/jpeg;base64,")).toBeNull();
    expect(imagenDeBase64("no es base64 ¿?")).toBeNull();
  });
});

describe("formularioDeAnalisis — misma puerta que «Subir desde la galería»", () => {
  it("manda `file` con nombre del vivo y `origen=vivo`", () => {
    const foto = imagenDeBase64(B64)!;
    const f = formularioDeAnalisis(foto, new Date(2026, 9, 5, 19, 7, 3));
    const file = f.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("vivo-2026-10-05-190703.jpg");
    expect((file as File).type).toBe("image/jpeg");
    expect((file as File).size).toBe(BYTES.length);
    expect(f.get("origen")).toBe("vivo");
    expect([...f.keys()].sort()).toEqual(["file", "origen"]);
  });
});

describe("mensajeDeSubida", () => {
  it("traduce lo que puede pasar", () => {
    expect(mensajeDeSubida(429)).toMatch(/espera un minuto/);
    expect(mensajeDeSubida(403)).toMatch(/no puede guardar/);
    expect(mensajeDeSubida(413, "muy_grande")).toMatch(/SD/);
    expect(mensajeDeSubida(502, "storage")).toMatch(/Reintenta/);
    expect(mensajeDeSubida(500, "no_se_pudo_procesar")).toContain("no_se_pudo_procesar");
  });
});

describe("capturaAnalizada", () => {
  const c = (id: string, nota: string | null) => ({ id, nota }) as Captura;
  it("por id cuando el servidor lo dio", () => {
    expect(capturaAnalizada([c("a", null), c("b", "del vivo (Hik-Connect), analizada por x")], "a")?.id).toBe("a");
    expect(capturaAnalizada([c("a", null)], "zz")).toBeNull();
  });
  it("sin id, la más nueva del vivo", () => {
    expect(capturaAnalizada([c("a", "subida desde el panel"), c("b", "del vivo (Hik-Connect), analizada por x"), c("c", "del vivo …")], null)?.id).toBe("b");
  });
});

describe("resumenDeLectura — personas, placa y chalecos", () => {
  it("lo que vio, en una línea, y la descripción abajo", () => {
    const r = resumenDeLectura(lectura({ hayPersona: true, hayVehiculo: true, personas: 2, placa: "ABC-123", chalecos: ["3", "12"], descripcion: "Carga de trozas" }));
    expect(r).toEqual({ titulo: "2 personas · placa ABC-123 · chalecos N° 3, N° 12", detalle: "Carga de trozas", tono: "ok" });
  });
  it("una persona sin número, un vehículo sin placa", () => {
    expect(resumenDeLectura(lectura({ hayPersona: true, hayVehiculo: true, chalecos: ["7"] })).titulo).toBe("1 persona · un vehículo sin placa legible · chaleco N° 7");
  });
  it("vacío", () => {
    expect(resumenDeLectura(lectura({})).titulo).toBe("Nadie a la vista");
  });
  it("sin la clave de la IA: la foto igual quedó, y se dice", () => {
    const r = resumenDeLectura(lectura({ motivo: "sin_ia_configurada", confianza: "baja" }));
    expect(r.tono).toBe("aviso");
    expect(r.titulo).toBe("Foto guardada, sin IA configurada");
  });
  it("presupuesto agotado: guardada y sin leer", () => {
    expect(resumenDeLectura(lectura({ motivo: "presupuesto_agotado" })).detalle).toMatch(/saldo de la IA/);
  });
  it("todavía sin lectura, o sin encontrar la foto", () => {
    expect(resumenDeLectura({ lectura: null }).tono).toBe("espera");
    expect(resumenDeLectura(null).titulo).toBe("Foto guardada");
  });
});

describe("vecesMas — el aviso del mosaico", () => {
  it("2 → el doble, 3 → el triple, 5 → 5 veces más", () => {
    expect(vecesMas(2)).toBe("el doble");
    expect(vecesMas(3)).toBe("el triple");
    expect(vecesMas(5)).toBe("5 veces más");
  });
});
