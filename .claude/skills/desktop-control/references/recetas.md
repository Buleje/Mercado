# Recetas de desktop-control

Heredadas del skill anterior. Las coordenadas son de la pantalla de Brandon (1920x1080) y cambian si se abre la barra lateral de Chrome o se mueve una ventana: preferir siempre el nombre del control (`SKILL.md`) y, si no hay más remedio, `screenshot` antes de cada clic.

## Por nombre: detalles (v2.2)

| Paso | Herramienta | Nota |
|---|---|---|
| 1 | `ui_tree {window}` | Solo si no sabés cómo se llama el control: lista `[{role, name, rect}]` de lo visible |
| 2 | `ui_act {window, role, name, action}` | `invoke` (default), `set_value` + `value`, `select`, `toggle`, `expand`, `focus`, `click`. Usa el patrón de UIA y, si no hay, clic real verificando que nada lo tape |
| 3 | `ui_wait {window, name, gone?}` | En vez de `wait` fijo: espera a que aparezca o se vaya |
| — | `batch` con pasos `ui_*` | Flujo conocido en UNA llamada; en batch la acción de `ui_act` va en `act` |

- Medido en vivo (09-10), «abrir Google y entrar al 2.º resultado»: a la vieja (captura, mirar, desplazar, clic) 31,5 s, 9 llamadas, 5 capturas y 2 tropiezos; por nombre ~5 s, 1 llamada, 0 capturas. Cada `ui_*` cuesta 8-25 ms; una captura, ~50 ms más leerla.
- Chrome SÍ expone el contenido de la página a UIA: los resultados de Google son `Hyperlink`; los orgánicos llevan «›» en el nombre (`{role:"Hyperlink", name:"›", index:1}` = 2.º orgánico). `invoke` funciona aunque el enlace esté fuera de pantalla: no hace falta desplazar.
- Para confirmar que cambió de página: `ui_wait {role:"Document", name:"<título viejo>", gone:true}` (un `Document` a secas encuentra la página vieja al instante).
- OCR solo cuando UIA no ve (apps Java, juegos, barra de tareas auto-oculta, WhatsApp): `zoom` o `screenshot`, `ocr_screen`, `mouse_click`. La rueda (`mouse_scroll`) puede caer en otra ventana: para bajar en Chrome, `keyboard_press pagedown` con Chrome al frente.
- `ui_find` sin resultado trae `near` (nombres visibles parecidos): usarlo antes de pedir otra captura.
- Candados: `keyboard_type` y `ui_act set_value` con `window` abortan si esa ventana no está activa; mouse en la esquina superior izquierda = parada de emergencia; los bancos de `config.json` bloquean acciones (no lecturas). Detalle: `C:\Users\Usuario\mcp-desktop-control\README.md`.
- `keyboard_type`: `method` auto pega por portapapeles pasados 25 caracteres (rápido, respeta tildes); `type` fuerza tecla a tecla; `paste` fuerza pegar.

## Flujo con captura (cuando UIA no ve el control)

| Paso | Herramienta | Por qué |
|---|---|---|
| 1 | `screen_info` | Dimensiones (1920x1080 típico) |
| 2 | `mouse_position` | Saber si Brandon está activo (multi-monitor: x > 1920) |
| 3 | `screenshot` | Ver el estado antes de actuar |
| 4 | Acción | `mouse_click`, `keyboard_type`, etc. |
| 5 | `wait` | Tiempo para que la UI se actualice (3-10 s típico) |
| 6 | `screenshot` | Verificar que funcionó |
| 7 | Seguir o reportar | Si no funcionó, reintentar |

Cada 3 acciones, una captura para verificar el estado: sin lazos ciegos.

## Recetas por coordenadas

**A. Abrir una URL**: `Bash("wslview 'https://…'")`, o con Chrome abierto: `keyboard_combo(["ctrl","t"])`, `wait(500)`, `keyboard_type(url)`, `keyboard_press("enter")`.

**B. Preguntar a ChatGPT, Claude o Gemini y traer la respuesta**: abrir con `wslview`, `wait(3000)`, `screenshot`; clic en la caja de texto (ChatGPT ~980, 551), `keyboard_type(pregunta)`, `keyboard_press("enter")`, `wait(8000)`; leer con `screenshot` o, si hace falta el texto exacto, `tesseract <captura> -` (instalado, español e inglés).

**C. Formulario externo**: clic en el primer campo, `keyboard_type` + `keyboard_press("tab")` campo por campo, `keyboard_combo(["enter"])` o clic en Enviar.

**D. Subir un archivo por diálogo nativo**: clic en «Subir», `wait(1500)`, tipear la ruta (`C:\Users\Usuario\Downloads\imagen.webp`) en «Nombre de archivo» y Enter.

**E. WSL a Windows por portapapeles**: `echo "datos" | xclip -selection clipboard` (o `clipboard_set`), clic en la app, `keyboard_combo(["ctrl","v"])`.

## Limitaciones

| Limitación | Workaround |
|---|---|
| Tildes perdidas (`á` por `a`) con tecleo simple (limitación de v1, sin re-medir) | `keyboard_type` auto pega y las conserva; para WhatsApp, `tipear.sh` o `wsp.sh` (Unicode letra por letra) |
| Captchas de Cloudflare bloquean bots | Que Brandon lo pase a mano |
| Coordenadas fijas se rompen si cambia la UI | `screenshot` antes y recalcular |
| OCR de una respuesta larga | `tesseract <captura> -` |
| Multi-monitor: cursor a veces en x > 1920 | `mouse_position` antes de actuar |

## Coordenadas conocidas (confirmar siempre con una captura)

| Elemento | x, y |
|---|---|
| Caja de texto de ChatGPT (chatgpt.com) | ~980, 551 |
| Barra de direcciones de Chrome | ~600, 63 |
| Avatar de perfil de ChatGPT (abajo a la izquierda) | ~28, 1048 |
| Barra de tareas (auto-oculta; su árbol UIA casi no tiene botones) | y ≈ 1078 |

## Modo segundo plano

Subagente con `run_in_background` + `virtual_desktop create`, trabajar ahí, `notify` al terminar y `window_control activate` del resultado. Mouse y teclado se comparten: lo que se garantiza es el escritorio de Brandon intacto y el aviso al terminar. En Windows 11, `app_launch notepad` restaura pestañas sin guardar: para texto limpio, Ctrl+N antes de tipear o abrir un archivo temporal.

## Más prohibiciones

| No hacer | En su lugar |
|---|---|
| Clic ciego sin captura previa | `screenshot`, identificar, clic |
| Mover el mouse mientras Brandon usa la PC | `mouse_position`; si está activo, preguntar |
| Acciones destructivas sin confirmar (cerrar app o navegador) | Preguntar antes |
| Tipear contraseñas | Nunca: las tipea Brandon |
| Lazo sin verificación | Cada 3 acciones, una captura |

## Cuándo no usar este skill

- Hay API REST: Bash + curl.
- Es localhost: Playwright headless (más rápido, no interrumpe a Brandon).
- Automatizar a Claude Code: Bash + scripts.
- Tareas de más de 5 min sin pausa: confirmar con Brandon.

## Más scripts en `~/.claude/bin`

- `captura.sh`: imagen del portapapeles de Windows a un PNG legible desde WSL (comando `/captura`).
- `foto.sh`: última foto llegada del celular (comando `/foto`).
- `leer.sh`: documento nuevo del buzón «Para Claude» o del portapapeles (comando `/leer`).
- `chrome-claude.sh [url…]`: Chrome con perfil aparte y puerto 9222 para el MCP `chrome-sesion` (sesiones de SUNAT SOL y SNIFFS).
- La implementación de `wsp.sh` y `tipear.sh` vive en `C:\Users\Usuario\.claude-tools\` (`wsp-turno.ps1`, `tipear-humano.ps1`).
