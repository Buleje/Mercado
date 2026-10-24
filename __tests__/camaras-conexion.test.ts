/**
 * Conectar una cámara Hikvision por ISAPI (ADR-421).
 *
 * Dos cosas se prueban acá y las dos duelen si fallan:
 *
 *  1. **El SSRF.** El servidor llama a un host que escribió una persona. Sin
 *     lista de bloqueo, ese endpoint alcanza `169.254.169.254` (las credenciales
 *     de la nube) o `127.0.0.1:5432` (la base). No es una validación de forma:
 *     es la puerta.
 *  2. **La clave no sale.** La clave de la cámara se guarda cifrada; si alguna
 *     respuesta la devolviera, cualquiera con la pestaña abierta la copia. El
 *     test serializa lo que devuelve la API y BUSCA el secreto adentro.
 *
 * Y el caso que Brandon vive: 192.168.1.64 en la misma red del panel tiene que
 * pasar. Una defensa que bloquee la LAN deja la función sin razón de existir.
 */

import { describe, expect, it } from "vitest";
import {
  anotarPrueba,
  camaraParaPantalla,
  camarasParaPantalla,
  conectarCamara,
  desconectarCamara,
  hostPermitido,
  ipPermitida,
  puertoPermitido,
  textoDeFalla,
  type Camara,
  type PruebaDeCamara,
} from "@/lib/camaras/camaras";

const camara = (over: Partial<Camara> = {}): Camara => ({
  id: "cam_patio",
  nombre: "Portón",
  lugar: "Entrada",
  token: "t".repeat(32),
  activa: true,
  creadaEn: "2026-09-01T10:00:00.000Z",
  ultimaCapturaEn: null,
  ...over,
});

const ok = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

const pruebaBuena: PruebaDeCamara = {
  ok: true,
  en: "2026-09-15T12:00:00.000Z",
  info: { modelo: "DS-2CD2143G2-I", firmware: "V5.7.3", serie: "DS0123456789", soportaPtz: false },
};

const datos = {
  host: "192.168.1.64",
  puerto: 80,
  usuario: "admin",
  claveCifrada: "v1:9f2c:BASURA-CIFRADA-QUE-NO-PUEDE-SALIR",
  prueba: pruebaBuena,
};

describe("hostPermitido — la guarda contra el SSRF", () => {
  it("rechaza 127.0.0.1 (el propio servidor)", () => {
    const r = hostPermitido("127.0.0.1");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/propio servidor/i);
  });

  it("rechaza 169.254.169.254 (la metadata de la nube)", () => {
    expect(hostPermitido("169.254.169.254").ok).toBe(false);
  });

  it("rechaza el puerto 5432, aunque esté arriba de 1024", () => {
    expect(puertoPermitido(5432).ok).toBe(false);
    /* Y también pegado al host, que es como se copia de la app del fabricante. */
    expect(hostPermitido("192.168.1.64:5432").ok).toBe(false);
  });

  it("rechaza los otros servicios internos típicos", () => {
    for (const p of [22, 25, 3306, 6379]) expect(puertoPermitido(p).ok, `puerto ${p}`).toBe(false);
  });

  it("acepta 192.168.1.64:80 — la cámara en la red del panel ES el caso de uso", () => {
    expect(hostPermitido("192.168.1.64:80").ok).toBe(true);
    expect(hostPermitido("192.168.1.64").ok).toBe(true);
    expect(puertoPermitido(80).ok).toBe(true);
  });

  it("acepta un DDNS público y los puertos de una cámara", () => {
    expect(hostPermitido("patio-buleje.ddns.net").ok).toBe(true);
    for (const p of [80, 443, 554, 8000, 8080, 8443, 37777]) {
      expect(puertoPermitido(p).ok, `puerto ${p}`).toBe(true);
    }
  });

  it("acepta el resto de la LAN (10/8 y 172.16/12) y bloquea lo que nunca es una cámara", () => {
    expect(ipPermitida("10.0.0.5").ok).toBe(true);
    expect(ipPermitida("172.16.3.9").ok).toBe(true);
    for (const ip of ["0.0.0.0", "127.0.0.53", "169.254.1.1", "100.64.0.1", "224.0.0.1", "255.255.255.255", "::1"]) {
      expect(ipPermitida(ip).ok, ip).toBe(false);
    }
  });

  it("no se deja engañar por las formas raras de escribir 127.0.0.1", () => {
    for (const h of ["localhost", "LOCALHOST", "127.1", "2130706433", "0177.0.0.1", "[::1]:80", "::ffff:127.0.0.1"]) {
      expect(hostPermitido(h).ok, h).toBe(false);
    }
  });

  it("pide la dirección pelada, sin esquema ni barras", () => {
    expect(hostPermitido("http://192.168.1.64").ok).toBe(false);
    expect(hostPermitido("192.168.1.64/ISAPI").ok).toBe(false);
    expect(hostPermitido("").ok).toBe(false);
  });
});

describe("conectarCamara", () => {
  it("guarda la conexión cuando el aparato contestó", () => {
    const r = ok(conectarCamara([camara()], "cam_patio", datos));
    const c = r.camaras[0].conexion!;
    expect(c.host).toBe("192.168.1.64");
    expect(c.modelo).toBe("DS-2CD2143G2-I");
    expect(c.probadaEn).toBe("2026-09-15T12:00:00.000Z");
    expect(c.ultimaFalla).toBeNull();
    /* El canal por defecto es el 1: una cámara suelta no tiene otro. */
    expect(c.canal).toBe(1);
  });

  it("NO guarda nada si la prueba falló", () => {
    const antes = [camara()];
    const r = conectarCamara(antes, "cam_patio", {
      ...datos,
      prueba: { ok: false, motivo: "credenciales", detalle: "401 Unauthorized", en: "2026-09-15T12:00:00.000Z" },
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toBe("El usuario o la clave no son los de la cámara.");
    /* Y la lista original quedó intacta: ni una conexión a medias. */
    expect(antes[0].conexion).toBeUndefined();
  });

  it("NO guarda una dirección bloqueada aunque venga con prueba buena", () => {
    const r = conectarCamara([camara()], "cam_patio", { ...datos, host: "169.254.169.254" });
    expect(r.ok).toBe(false);
  });

  it("no inventa una cámara que no está en la lista", () => {
    expect(conectarCamara([camara()], "cam_fantasma", datos).ok).toBe(false);
  });
});

describe("la clave cifrada no puede salir del servidor", () => {
  it("no aparece en el JSON que devuelve la API", () => {
    const r = ok(conectarCamara([camara()], "cam_patio", datos));
    /* Exactamente lo que arma el endpoint en `accion: "conectar"`. */
    const respuesta = { camaras: camarasParaPantalla(r.camaras), mensaje: r.mensaje };
    const json = JSON.stringify(respuesta);

    expect(json).not.toContain(datos.claveCifrada);
    expect(json).not.toContain("BASURA-CIFRADA");
    expect(json).not.toContain("claveCifrada");
    /* Lo que SÍ tiene que viajar, para que la pantalla muestre a quién se conectó. */
    expect(json).toContain("192.168.1.64");
    expect(respuesta.camaras[0].conexion?.usuario).toBe("admin");
    expect(Object.keys(respuesta.camaras[0].conexion ?? {})).not.toContain("claveCifrada");
  });

  it("tampoco cuando la conexión gana campos nuevos (la lista es a mano, no un delete)", () => {
    const conFuturo = camara({
      conexion: {
        host: "192.168.1.64",
        puerto: 80,
        usuario: "admin",
        claveCifrada: "SECRETO",
        https: false,
        canal: 1,
        // @ts-expect-error — un campo que todavía no existe en el tipo: el serializador no lo copia.
        tokenDeLaNube: "OTRO-SECRETO",
      },
    });
    const json = JSON.stringify(camaraParaPantalla(conFuturo));
    expect(json).not.toContain("SECRETO");
    expect(json).not.toContain("OTRO-SECRETO");
  });
});

describe("conectar y desconectar", () => {
  it("ida y vuelta: se conecta, se ve, se desconecta y la clave se va con ella", () => {
    const conectada = ok(conectarCamara([camara()], "cam_patio", datos));
    expect(conectada.camaras[0].conexion?.claveCifrada).toBe(datos.claveCifrada);

    const suelta = ok(desconectarCamara(conectada.camaras, "cam_patio"));
    expect(suelta.camaras[0].conexion).toBeNull();
    expect(JSON.stringify(suelta.camaras)).not.toContain(datos.claveCifrada);
    /* Sigue siendo la misma cámara: el token de push no se toca. */
    expect(suelta.camaras[0].token).toBe("t".repeat(32));
    expect(suelta.mensaje).toMatch(/siguen entrando/i);
  });

  it("desconectar dos veces avisa en vez de mentir", () => {
    const conectada = ok(conectarCamara([camara()], "cam_patio", datos));
    const primera = ok(desconectarCamara(conectada.camaras, "cam_patio"));
    expect(desconectarCamara(primera.camaras, "cam_patio").ok).toBe(false);
  });
});

describe("anotarPrueba — lo que la pantalla cuenta sin volver a golpear el aparato", () => {
  it("guarda el motivo de la última falla y lo limpia cuando vuelve a contestar", () => {
    const conectada = ok(conectarCamara([camara()], "cam_patio", datos));
    const caida = ok(
      anotarPrueba(conectada.camaras, "cam_patio", {
        ok: false,
        motivo: "inalcanzable",
        detalle: "ECONNREFUSED",
        en: "2026-09-15T13:00:00.000Z",
      }),
    );
    expect(caida.camaras[0].conexion?.ultimaFalla?.motivo).toBe("inalcanzable");
    /* La pantalla lo muestra traducido, no «ECONNREFUSED». */
    expect(camaraParaPantalla(caida.camaras[0]).conexion?.ultimaFallaTexto).toMatch(/No se llega a la cámara/);

    const revivida = ok(
      anotarPrueba(caida.camaras, "cam_patio", { ...pruebaBuena, en: "2026-09-15T14:00:00.000Z" }),
    );
    expect(revivida.camaras[0].conexion?.ultimaFalla).toBeNull();
    expect(revivida.camaras[0].conexion?.probadaEn).toBe("2026-09-15T14:00:00.000Z");
  });

  it("una cámara sin conexión no puede tener resultado de prueba", () => {
    expect(anotarPrueba([camara()], "cam_patio", pruebaBuena).ok).toBe(false);
  });

  it("traduce los motivos del cliente ISAPI y cae en el detalle si no lo conoce", () => {
    expect(textoDeFalla("tiempo")).toMatch(/no contestó a tiempo/i);
    expect(textoDeFalla("no-es-hikvision")).toMatch(/no es una cámara Hikvision/i);
    expect(textoDeFalla("marciano", "lo que dijo el aparato")).toBe("lo que dijo el aparato");
  });
});
