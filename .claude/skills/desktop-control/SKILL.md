---
name: desktop-control
description: Control TOTAL del Windows host de Brandon vía MCP desktop-control. Mouse, teclado, screenshots, navegación entre apps. Activar cuando la tarea involucre UI fuera del navegador, formularios externos, demos visuales, cross-app workflows, OCR de pantalla, o Brandon diga "controla mi pc", "abrime", "navegá", "tipea por mí", "pone esto en X app".
model: sonnet
argument-hint: "[acción o app a controlar]"
---

# Desktop Control — Patrón blindado

Acceso directo al desktop Windows de Brandon via MCP `desktop-control`.

---

## 1. Setup pre-aprobado ✅

Permisos en `.claude/settings.local.json`. Servidor corriendo automático al boot.
**NO pide confirmación** para ninguna acción de mouse/teclado/screenshot.

---

## 2. Tools — cargar al primer uso

```ts
ToolSearch(query="select:mcp__desktop-control__screenshot,mcp__desktop-control__screen_info,mcp__desktop-control__mouse_position,mcp__desktop-control__mouse_click,mcp__desktop-control__mouse_move,mcp__desktop-control__keyboard_type,mcp__desktop-control__keyboard_combo,mcp__desktop-control__keyboard_press,mcp__desktop-control__mouse_scroll,mcp__desktop-control__wait", max_results=10)
```

---

## 3. Workflow base (SIEMPRE en este orden)

| Paso | Tool | Por qué |
|---|---|---|
| 1 | `screen_info` | Saber dimensiones (1920x1080 típico) |
| 2 | `mouse_position` | Detectar si Brandon está activo (multi-monitor: x>1920) |
| 3 | `screenshot` | Ver el estado actual antes de actuar |
| 4 | Acción concreta | mouse_click / keyboard_type / etc |
| 5 | `wait` | Dar tiempo al UI a actualizar (3-10s típico) |
| 6 | `screenshot` | Verificar que la acción funcionó |
| 7 | Próximo paso o reportar | Si OK, seguir. Si no, retry. |

---

## 4. Casos de uso comunes

### A. Abrir URL en nueva pestaña Chrome

```ts
// Opción 1: usar wslview desde Bash (más simple)
Bash("wslview 'https://example.com'")

// Opción 2: si ya hay Chrome abierto, Ctrl+T + tipear URL
keyboard_combo(["ctrl", "t"])
wait(500)
keyboard_type("https://example.com")
keyboard_press("enter")
```

### B. Preguntar a ChatGPT/Claude/Gemini y traer respuesta

```ts
// 1. Abrir el LLM (si no está)
Bash("wslview 'https://chatgpt.com'")
wait(3000)
screenshot()  // verificar que cargó

// 2. Click en input box (típicamente al centro-bajo)
mouse_click(x=980, y=551)  // ChatGPT input

// 3. Tipear pregunta
keyboard_type("¿pregunta?")

// 4. Enviar
keyboard_press("enter")

// 5. Esperar respuesta (5-10s)
wait(8000)

// 6. Leer
screenshot()  // visual, o
Bash("tesseract /tmp/screenshot.png - 2>/dev/null")  // OCR si necesitás texto exacto
```

### C. Llenar formulario externo (sin API)

```ts
// Enfocar primer campo
mouse_click(x=..., y=...)

// Tipear + Tab para siguiente campo
keyboard_type("Juan")
keyboard_press("tab")
keyboard_type("Pérez")
keyboard_press("tab")
keyboard_type("juan@example.com")

// Submit
keyboard_combo(["enter"])  // o click en botón Submit
```

### D. Subir archivo via dialog nativo

```ts
// Click en botón "Upload"
mouse_click(x=..., y=...)
wait(1500)  // dialog Windows tarda en abrir

// El path C:\... se tipea directo en el campo "File name"
keyboard_type("C:\\Users\\Usuario\\Downloads\\imagen.webp")
keyboard_press("enter")
```

### E. Cross-app workflow (WSL → Windows)

```bash
# Bash WSL
echo "datos a copiar" | xclip -selection clipboard
```

```ts
// Después en Windows app
mouse_click(x=..., y=...)
keyboard_combo(["ctrl", "v"])  // pega lo del clipboard de Windows
```

---

## 5. Limitaciones y workarounds

| Limitación | Workaround |
|---|---|
| **Acentos perdidos** (`á → a`) en `keyboard_type` | Usar clipboard: `Bash("echo 'Cuál' \| xclip -sel clip")` + `keyboard_combo(["ctrl","v"])` |
| **Captchas Cloudflare** bloquean bots | Pedir a Brandon que pase el captcha manualmente |
| **Coordenadas hardcodeadas se rompen** si UI cambia | Tomar screenshot ANTES y recalcular coords si layout cambió |
| **OCR de respuesta** complejo | `tesseract <screenshot> -` (instalado, español + inglés) |
| **Multi-monitor**: cursor a veces en x>1920 | Verificar `mouse_position` antes de actuar |

---

## 6. Coordenadas conocidas del setup de Brandon

| Elemento | x, y |
|---|---|
| **ChatGPT input box** (chatgpt.com home) | ~980, 551 |
| **Chrome address bar** | ~600, 63 |
| **Chrome new tab button** | después última pestaña |
| **Avatar perfil ChatGPT** | ~28, 1048 (esquina abajo izq) |

> Estas coords pueden cambiar si abre o cierra la barra lateral de Chrome.
> SIEMPRE tomar screenshot primero para confirmar.

---

## 7. Anti-patterns

| ❌ NO hacer | ✅ En su lugar |
|---|---|
| Click ciego sin screenshot previo | screenshot → identificar elemento → click |
| Mover mouse mientras Brandon usa la PC | mouse_position → si está activo, preguntar |
| Acciones destructivas sin confirmar | Cerrar app/browser/etc → preguntar a Brandon primero |
| Tipear contraseñas | NUNCA. Brandon las tipea él |
| Loop infinito sin verificación | Cada 3 acciones → screenshot → verificar estado |

---

## 8. Cuándo NO usar este skill

- Si hay API REST → usar Bash + curl
- Para localhost → preferir Playwright headless (más rápido, no interrumpe Brandon)
- Para automatizar el propio Claude Code → usar Bash + scripts
- Para tareas que van a tardar >5 min sin pausa → confirmar con Brandon
