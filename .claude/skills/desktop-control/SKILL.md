---
name: desktop-control
description: Control TOTAL del Windows host de Brandon vía MCP desktop-control. Mouse, teclado, screenshots, navegación entre apps. Activar cuando la tarea involucre UI fuera del navegador, formularios externos, demos visuales, cross-app workflows, OCR de pantalla, o Brandon diga "controla mi pc", "abrime", "navegá", "tipea por mí", "pone esto en X app".
model: sonnet
argument-hint: "[acción o app a controlar]"
allowed-tools: mcp__desktop-control, Bash, Read
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
ToolSearch(query="select:mcp__desktop-control__ui_find,mcp__desktop-control__ui_act,mcp__desktop-control__ui_wait,mcp__desktop-control__ui_tree,mcp__desktop-control__batch,mcp__desktop-control__window_list,mcp__desktop-control__screenshot,mcp__desktop-control__zoom,mcp__desktop-control__ocr_screen,mcp__desktop-control__keyboard_type", max_results=10)
```

---

## 2b. Primero por nombre (v2.2, 09-10)

Antes de captura + OCR + coordenadas, buscar el control por su **nombre** en el árbol de UI Automation (8-25 ms por llamada; una captura cuesta ~50 ms más leerla).

| Paso | Herramienta | Nota |
|---|---|---|
| 1 | `ui_tree {window}` | Solo si no sabés cómo se llama el botón: lista `[{role, name, rect}]` de lo visible |
| 2 | `ui_act {window, role, name, action}` | `invoke` (default) / `set_value`+`value` / `select` / `toggle` / `expand` / `focus` / `click`. Usa el patrón de UIA y, si no hay, clic real verificando que nada lo tape |
| 3 | `ui_wait {window, name, gone?}` | En vez de `wait` fijo: espera en una sola llamada a que aparezca o se vaya |
| — | `batch` con pasos `ui_*` | Flujo conocido en UNA llamada; en batch la acción de `ui_act` va en `act` |

- **Medido en vivo (09-10)**, «abrir Google y entrar al 2.º resultado»: a la vieja (captura → mirar →
  desplazar → clic) **31,5 s, 9 llamadas, 5 capturas y 2 tropiezos** (la página se reacomodó al
  cargar la visión de IA y la rueda cayó en otra ventana); por nombre **~5 s, 1 llamada, 0 capturas**.
- **Chrome SÍ expone el contenido de la página a UIA** (los resultados de Google son `Hyperlink`; los
  orgánicos llevan «›» en el nombre: `{role:"Hyperlink", name:"›", index:1}` = 2.º orgánico).
  `invoke` funciona aunque el enlace esté fuera de la pantalla: no hace falta desplazar.
- Para confirmar que cambió de página: `ui_wait {role:"Document", name:"<título viejo>", gone:true}`
  (un `ui_wait` de `Document` a secas encuentra la página vieja al instante).
- **OCR solo cuando UIA no ve**: apps Java (IBKR probablemente), juegos, barra de tareas auto-oculta. Ahí: `zoom`/`screenshot` → `ocr_screen` → `mouse_click`. La rueda (`scroll`) puede caer en otra ventana: para bajar en Chrome, `press pagedown` con Chrome al frente.
- `ui_find` sin resultado trae `near` (nombres visibles parecidos): usarlo antes de pedir otra captura.
- Candados: `keyboard_type`/`ui_act set_value` con `window` abortan si esa ventana no está activa; mouse en la esquina superior izquierda = parada de emergencia; bancos de `config.json` bloquean acciones (no lecturas). Detalle en `C:\Users\Usuario\mcp-desktop-control\README.md`.

---

## 3. Workflow con captura (cuando UIA no ve el control)

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
