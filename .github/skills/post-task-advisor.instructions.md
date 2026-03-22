---
applyTo: "NEVER_AUTO_LOAD"
---

# Post-Task Advisor — Formato Obligatorio

Define el formato EXACTO de "¿Qué hacemos ahora?" al terminar cualquier tarea.

## Regla #1: Solo tablas — cero texto suelto

Prohibido párrafos de introducción, recomendaciones en prosa, o explicaciones de fase.
TODA la información va dentro de las tablas.

## Formato exacto — dos tablas seguidas

### Tabla 1 — Sugerencias

| # | Qué vamos a hacer | Para qué sirve | Área | ⚡ |
|---|-------------------|----------------|------|-----|
| 1 | [acción directa sin jerga técnica] | [analogía cotidiana que entiende un niño de 10 años] | [Área] | 🔴 |

**Columnas:**

- **#** — Número del 1 al 8. Máximo 8 sugerencias.
- **Qué vamos a hacer** — acción concreta en lenguaje simple.
  - ✅ "Agregar contraseña al panel admin"
  - ❌ "Implementar capa de autenticación"
- **Para qué sirve** — UNA analogía cotidiana. Formato: "[situación conocida] — [consecuencia clara]"
  - ✅ "Como ponerle llave a la puerta de tu casa — nadie entra sin permiso"
  - ❌ "Mejora la seguridad del sistema de autenticación"
- **Área** — una sola etiqueta: `Seguridad · Rendimiento · DX · UX/UI · Backend · Testing · DevOps · BD · SEO`
- **⚡** — urgencia con emoji únicamente:
  - 🔴 Ahora mismo (bloquea o es crítico)
  - 🟠 Esta semana (importante)
  - 🟡 Cuando puedas (mejora valiosa)
  - 🟢 Opcional (nice-to-have)

Ordenar de 🔴 → 🟢 de arriba a abajo.

### Separador

```
---
```

### Tabla 2 — Formulario de aprobación

**¿Qué apruebas?**

| # | Qué es | ¿Lo hacemos? |
|---|--------|-------------|
| 1 | [3-5 palabras max] | ☐ Sí &nbsp;&nbsp; ☐ No &nbsp;&nbsp; ☐ Después |
| 2 | ... | ☐ Sí &nbsp;&nbsp; ☐ No &nbsp;&nbsp; ☐ Después |

> Responde con los números: **"Apruebo 1 y 3"** · **"Todo"** · **"Ninguno"** · **"2 después"**

---

## Ejemplo completo CORRECTO

```markdown
## ¿Qué hacemos ahora?

| # | Qué vamos a hacer | Para qué sirve | Área | ⚡ |
|---|-------------------|----------------|------|-----|
| 1 | Pedir contraseña para entrar al panel admin | Como ponerle llave a la puerta de tu casa — nadie puede entrar sin permiso, aunque sepa la dirección | Seguridad | 🔴 |
| 2 | Guardar copia automática de los datos | Como guardar el juego antes de apagarlo — si algo se rompe, vuelves al punto anterior sin perder nada | DevOps | 🟠 |
| 3 | Mostrar cuánto stock queda en la pantalla principal | Como el marcador de gasolina del carro — sabes cuándo hay que reponer antes de quedarte sin nada | UX/UI | 🟠 |
| 4 | Acelerar la búsqueda de productos | Como ordenar la despensa por tipo de alimento — encuentras lo que necesitas en segundos, no minutos | Rendimiento | 🟡 |
| 5 | Avisar si una venta fue inusualmente grande | Como cuando el banco te llama porque alguien usó tu tarjeta en otro país — detecta algo raro a tiempo | Seguridad | 🟡 |

---

**¿Qué apruebas?**

| # | Qué es | ¿Lo hacemos? |
|---|--------|-------------|
| 1 | Contraseña al panel | ☐ Sí &nbsp;&nbsp; ☐ No &nbsp;&nbsp; ☐ Después |
| 2 | Backup automático | ☐ Sí &nbsp;&nbsp; ☐ No &nbsp;&nbsp; ☐ Después |
| 3 | Stock en pantalla | ☐ Sí &nbsp;&nbsp; ☐ No &nbsp;&nbsp; ☐ Después |
| 4 | Búsqueda más rápida | ☐ Sí &nbsp;&nbsp; ☐ No &nbsp;&nbsp; ☐ Después |
| 5 | Alerta ventas raras | ☐ Sí &nbsp;&nbsp; ☐ No &nbsp;&nbsp; ☐ Después |

> Responde con los números: **"Apruebo 1 y 3"** · **"Todo"** · **"Ninguno"** · **"2 después"**
```

---

## Lo que está PROHIBIDO

| ❌ Prohibido | ✅ En su lugar |
|-------------|--------------|
| Párrafos de texto suelto | Todo dentro de tablas |
| Jerga técnica: "refactor", "bundle", "endpoint", "middleware" | Palabras simples del español cotidiano |
| Columnas "Fase" y "Riesgo" | Solo Área + ⚡ urgencia |
| Texto "Impacto: 🔴 Crítico" | Solo el emoji en la columna ⚡ |
| Más de 8 sugerencias | Máximo 8, las más importantes |
| Analogías técnicas o abstractas | Analogías de la vida cotidiana (comida, casa, carro, juego) |
| Párrafo de "Recomendación de fase" después de la tabla | Nada de texto después del formulario |
