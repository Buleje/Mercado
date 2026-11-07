/**
 * El aviso que llega el día que la IA se cae.
 *
 * Lo que se fija acá no es el envío —eso es fontanería— sino las dos decisiones
 * que separan un aviso útil de una notificación que se aprende a ignorar:
 *
 *  1. **El dedupe va por lo que está roto**, no por «hubo un problema». Si el
 *     mismo modelo sigue caído mañana, silencio; si se cae OTRO, avisa de nuevo.
 *  2. **El texto explica el síntoma que el usuario YA está viendo.** Un aviso
 *     que dice «error en el proveedor» no conecta con «el bot no me contesta»;
 *     uno que dice «las respuestas fallan sin dar error, como si fuera un
 *     problema de conexión» sí.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { comoTexto, claveDe } = await import("@/app/api/cron/ia-salud/route");

type Diag = Parameters<typeof comoTexto>[0];

/** Un diagnóstico mínimo con lo que cada test necesita. */
const diag = (over: Partial<Diag> = {}): Diag =>
  ({
    generadoEn: "2026-09-05T00:00:00.000Z",
    proveedor: { nombre: "Groq", configurado: true, modelosDisponibles: 14 },
    modelos: [],
    vision: { disponible: false, modelo: "x", nota: "" },
    agentes: { tools: 62, huecos: [] },
    resumen: "",
    estado: "roto",
    ...over,
  }) as Diag;

const modeloRoto = (modelo: string, para: string) => ({ para, modelo, estado: "roto" as const });

describe("la clave del dedupe lleva QUÉ está roto", () => {
  it("dos modelos distintos dan claves distintas", () => {
    const a = claveDe(diag({ modelos: [modeloRoto("llama-x", "Asistente")] }));
    const b = claveDe(diag({ modelos: [modeloRoto("llama-y", "Asistente")] }));
    expect(a).not.toBe(b);
  });

  it("el mismo problema da la misma clave — mañana no vuelve a molestar", () => {
    const hoy = claveDe(diag({ modelos: [modeloRoto("llama-x", "Asistente")] }));
    const manana = claveDe(diag({ modelos: [modeloRoto("llama-x", "Asistente")] }));
    expect(hoy).toBe(manana);
  });

  it("no depende del orden en que vengan los problemas", () => {
    const uno = claveDe(
      diag({ modelos: [modeloRoto("a", "X"), modeloRoto("b", "Y")] }),
    );
    const otro = claveDe(
      diag({ modelos: [modeloRoto("b", "Y"), modeloRoto("a", "X")] }),
    );
    expect(uno).toBe(otro);
  });

  it("si se cae un SEGUNDO modelo, la clave cambia y vuelve a avisar", () => {
    const antes = claveDe(diag({ modelos: [modeloRoto("a", "X")] }));
    const despues = claveDe(diag({ modelos: [modeloRoto("a", "X"), modeloRoto("b", "Y")] }));
    expect(despues).not.toBe(antes);
  });

  it("un hueco de cableado también entra en la clave", () => {
    const sinHuecos = claveDe(diag({ modelos: [modeloRoto("a", "X")] }));
    const conHueco = claveDe(
      diag({
        modelos: [modeloRoto("a", "X")],
        agentes: { tools: 62, huecos: [{ tipo: "permiso", donde: "agenda.agendar", sintoma: "" }] },
      }),
    );
    expect(conHueco).not.toBe(sinHuecos);
  });
});

describe("el texto conecta con lo que el usuario está viendo", () => {
  it("nombra el modelo caído y para qué servía", () => {
    const { titulo, cuerpo } = comoTexto(
      diag({ modelos: [modeloRoto("openai/gpt-oss-20b", "Asistente y bots")] }),
    );
    expect(titulo).toMatch(/mudo/i);
    expect(cuerpo).toContain("openai/gpt-oss-20b");
    expect(cuerpo).toMatch(/asistente y bots/i);
  });

  it("explica que falla SIN dar error — que es lo confuso del bug", () => {
    const { cuerpo } = comoTexto(diag({ modelos: [modeloRoto("m", "Asistente")] }));
    expect(cuerpo).toMatch(/sin dar error/i);
  });

  it("dice dónde se arregla", () => {
    const { cuerpo } = comoTexto(diag({ modelos: [modeloRoto("m", "Asistente")] }));
    expect(cuerpo).toContain("lib/llm-providers/groq.ts");
  });

  it("concuerda en singular y plural", () => {
    const uno = comoTexto(diag({ modelos: [modeloRoto("a", "X")] })).cuerpo;
    const dos = comoTexto(diag({ modelos: [modeloRoto("a", "X"), modeloRoto("b", "Y")] })).cuerpo;
    expect(uno).toContain("el modelo ");
    expect(dos).toContain("los modelos ");
  });

  it("cuando el problema es de cableado, habla de herramientas y no de modelos", () => {
    const { titulo, cuerpo } = comoTexto(
      diag({
        agentes: { tools: 62, huecos: [{ tipo: "permiso", donde: "agenda.agendar", sintoma: "" }] },
      }),
    );
    expect(titulo).toMatch(/herramientas/i);
    expect(cuerpo).toContain("agenda.agendar");
    expect(cuerpo).toMatch(/no puedo hacer eso/i);
  });
});
