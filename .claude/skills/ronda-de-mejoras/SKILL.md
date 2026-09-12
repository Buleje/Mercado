---
name: ronda-de-mejoras
description: Arma el menú de mejoras/funciones/integraciones de un módulo o pantalla PASANDO PRIMERO las 8 lentes (datos reales del tenant, capacidades sin estrenar, pantalla hermana, unidad/vocabulario, accesibilidad real, cifra declarada, lo que entra sin tipear, capstone+quick win) y devuelve un AskUserQuestion de 3-4 opciones independientes con evidencia medida. Usar al cerrar una entrega, cuando Brandon diga "dame opciones", "qué mejoras", "reforzar funciones", "nuevas funciones", "ideas", "integraciones", o al entrar a un módulo sin pedido concreto.
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[módulo | pantalla | URL del admin | 'todo']"
---

# Ronda de mejoras — propuestas con evidencia

**Regla:** una propuesta sin medición es una opinión. Brandon elige las que nacen de un dato («hay 0 despachos», «4 modales quedan detrás») y descarta las que nacen de la imaginación. Antes de escribir una sola opción, pasar las lentes.

## 0. Ubicar el área

- Si `$ARGUMENTS` es una URL del admin → el `tab=` (y `vista=`) dicen el módulo. Grep del componente raíz en `app/admin/_components/TabRouter.tsx`.
- Si es un nombre → `grep -rln "<Nombre" components/admin | head`.
- Si es `todo` → usar el hub de memorias del área (`MEMORY.md` → `hub-*`) y elegir el módulo con más pedidos recientes en `git log --oneline -30`.

## 1. Las 8 lentes (todas, en este orden — y anotar la medición de cada una)

| # | Lente | Cómo se mide (comando o gesto) |
|---|---|---|
| 1 | **Datos reales del tenant real** | `DOTENV_CONFIG_PATH=.env.local node -r dotenv/config <script pg>`; contar filas/estados del módulo en `inversiones-agroforestales-blas-sociedad-anonima` (nunca `main`) |
| 2 | **Construido sin estrenar** | grep de features/props/endpoints del módulo × uso real (llamadas, registros). Memoria `ctp-capacidades-construidas-sin-usar` |
| 3 | **Pantalla hermana** | grep de la sección/patrón (`"Fecha de"`, `type="date"`, `<CtpX`) en `components/admin/**` — dónde falta lo que acá ya existe |
| 4 | **Unidad y vocabulario** | leer el copy como aserradero/bodeguero: PT antes que m³; «corrida», «jornada», «permiso», «cobrar», «fiado» |
| 5 | **Accesibilidad de uso real** | Playwright: Tab/Escape en modales, viewport 400, `.dark`, consola 0 errores tras navegar, `elementFromPoint` en lo que debe verse |
| 6 | **Cifra declarada / plata** | ¿qué número queda ante SERFOR o en el P&L? ¿las columnas contiguas cierran? (memoria `deuda-no-es-indicador`) |
| 7 | **Lo que entra o sale sin tipear** | ¿qué se tipea hoy que una máquina ya sabe? cámara, WhatsApp, Excel, SNIFFS, voz, papel impreso |
| 8 | **Capstone + quick win** | la mejora que cambia el juego del área (memoria `ambicion-alto-nivel-2026-07-18`) y la de 20 minutos |

Si una lente no se pudo medir, se dice «sin medir» en la opción — no se disimula.

## 2. Escribir el menú

`AskUserQuestion`, `multiSelect: true`, 3-4 opciones. Brandon elige casi siempre **todas** y agrega texto libre → cada opción tiene que poder ejecutarse sola y en paralelo con las otras.

Cada opción = **Qué** (verbo + pantalla exacta) · **cuándo pasa** (la situación real) · **evidencia** (la cifra medida) · **tamaño**.

Mezcla obligatoria: 1 bug/deuda visto de paso · 1 pulido de lo recién hecho · 1 capstone · 1 integración o dato nuevo. La **recomendada primera**, con «(Recomendado)».

Ejemplo de opción bien escrita:
> **La misma tira en «Producir lote» (Recomendado)** — Las otras dos pantallas donde se elige fecha a ciegas: al declarar con lote y en Consumos (grep: 3 `<input type="date">` sin contexto). Mismo componente, cero código duplicado. Medio.

## 3. Después del menú

- Lo elegido se ejecuta **entero** y se verifica por el camino del usuario (rule `verificacion-de-verdad`), con datos reales, claro + oscuro + 400 px cuando es UI.
- El texto libre que agregue va **primero**: es lo que le duele hoy. Un bug nombrado ahí va antes que cualquier feature.
- Cerrar la ejecución con otra ronda (este mismo skill). Nunca en seco.
