/**
 * La memoria de conversación del asistente.
 *
 * Es lo que hace que «el N7» después de «¿qué camión?» signifique algo. Sin
 * ella el bot se sentía tonto: no porque el modelo lo fuera, sino porque le
 * borrábamos el contexto entre una frase y la siguiente.
 *
 * Los dos casos que rompen de verdad y que acá quedan fijados: que el recorte
 * deje un `tool` huérfano (el proveedor rechaza la conversación entera con 400)
 * y que la memoria de un negocio se filtre a otro.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordar, anotarTurno, anotarHecho, olvidar, _sesionesVivas,
  type MensajeTurno,
} from "@/lib/asistente/memoria";

const usuario = (content: string): MensajeTurno => ({ role: "user", content });
const asistente = (content: string): MensajeTurno => ({ role: "assistant", content });
const herramienta = (content: string, id: string): MensajeTurno => ({
  role: "tool", content, tool_call_id: id,
});

describe("recordar y anotar", () => {
  beforeEach(() => { olvidar("s1"); olvidar("s2"); });

  it("una sesión nueva no recuerda nada", () => {
    expect(recordar("s1", "main")).toEqual([]);
  });

  it("devuelve lo que se guardó", () => {
    anotarTurno("s1", "main", [usuario("cargué petróleo"), asistente("¿qué camión?")]);
    const m = recordar("s1", "main");
    expect(m).toHaveLength(2);
    expect(m[1].content).toBe("¿qué camión?");
  });

  it("⛔ la memoria de un negocio NO se lee desde otro", () => {
    // Un id de sesión es un chatId de Telegram. Si ese chat se desvinculara de
    // un negocio y se vinculara a otro, lo hablado no puede viajar con él.
    anotarTurno("s1", "main", [usuario("le adelanté 300 a Juan")]);
    expect(recordar("s1", "otro-negocio")).toEqual([]);
    expect(recordar("s1", "main")).toHaveLength(1);
  });

  it("`anotarHecho` deja constancia de lo que ya se registró", () => {
    anotarTurno("s1", "main", [usuario("anotá el combustible")]);
    anotarHecho("s1", "main", "Anotado: S/ 675.00 de combustible para Camión N12");
    const m = recordar("s1", "main");
    expect(m[m.length - 1].content).toContain("quedó registrado");
    expect(m[m.length - 1].content).toContain("S/ 675.00");
  });

  it("olvidar corta el hilo", () => {
    anotarTurno("s1", "main", [usuario("hola")]);
    olvidar("s1");
    expect(recordar("s1", "main")).toEqual([]);
  });
});

describe("el recorte, que es donde estaba el riesgo", () => {
  beforeEach(() => olvidar("s1"));

  it("guarda sólo los últimos mensajes", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => usuario(`mensaje ${i}`));
    anotarTurno("s1", "main", muchos);
    const m = recordar("s1", "main");
    expect(m.length).toBeLessThanOrEqual(12);
    // Lo último es lo que importa: la conversación es lo reciente.
    expect(m[m.length - 1].content).toBe("mensaje 29");
  });

  it("🚨 nunca empieza con un `tool` huérfano", () => {
    /**
     * Un resultado de herramienta sin la llamada que lo pidió deja al proveedor
     * con un mensaje sin padre y rechaza la conversación ENTERA con HTTP 400 —
     * o sea, el bot deja de contestar del todo.
     */
    const conversacion: MensajeTurno[] = [
      ...Array.from({ length: 10 }, (_, i) => usuario(`viejo ${i}`)),
      { role: "assistant", content: "", tool_calls: [{ id: "c1" }] },
      herramienta("{}", "c1"),
      herramienta("{}", "c2"),
      asistente("listo"),
    ];
    anotarTurno("s1", "main", conversacion);
    const m = recordar("s1", "main");
    expect(m.length).toBeGreaterThan(0);
    expect(m[0].role).not.toBe("tool");
  });

  it("aguanta una conversación que es SÓLO resultados de herramienta", () => {
    // Caso extremo: si todo lo que queda son `tool`, la memoria queda vacía en
    // vez de guardar algo que el proveedor va a rechazar.
    anotarTurno("s1", "main", [herramienta("{}", "a"), herramienta("{}", "b")]);
    expect(recordar("s1", "main")).toEqual([]);
  });
});

describe("la conversación se cierra sola", () => {
  it("a la media hora sin hablar", () => {
    vi.useFakeTimers();
    try {
      olvidar("s2");
      anotarTurno("s2", "main", [usuario("cargué petróleo")]);
      expect(recordar("s2", "main")).toHaveLength(1);

      vi.advanceTimersByTime(29 * 60 * 1000);
      expect(recordar("s2", "main")).toHaveLength(1);

      // Retomar «sí, ese» horas después es más peligroso que empezar de nuevo:
      // el «ese» apuntaría a algo que el dueño ya no tiene en la cabeza.
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(recordar("s2", "main")).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no crece para siempre", () => {
    for (let i = 0; i < 260; i++) anotarTurno(`masiva-${i}`, "main", [usuario("x")]);
    expect(_sesionesVivas()).toBeLessThanOrEqual(200);
  });
});
