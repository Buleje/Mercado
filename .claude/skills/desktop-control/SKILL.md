---
name: desktop-control
description: "Maneja el Windows de Brandon desde WSL: controles por nombre (UI Automation), WhatsApp Desktop, Chrome, admin sin UAC. Usar cuando haya que operar una app fuera del navegador, o Brandon diga «controla mi PC», «ábreme», «escribe por mí» o «ponlo en WhatsApp/Excel»."
model: sonnet
argument-hint: "[acción o app a controlar]"
allowed-tools: mcp__desktop-control, Bash, Read
---

# Desktop Control

MCP `desktop-control` (permisos en `.claude/settings.json` y modo bypass del usuario). Cargar con `ToolSearch select:mcp__desktop-control__<nombre>`.

## Orden de preferencia

1. **Por nombre (UI Automation)**: `ui_find`, `ui_act {window, role, name, action}`, `ui_wait` (no `wait` fijo), `ui_tree` si no sabés el nombre; flujo conocido en un `batch`. Medido: 31,5 s a la vieja, ~5 s por nombre.
2. **Teclado**: `keyboard_press`, `keyboard_combo`; `keyboard_type` con `window` (aborta si esa ventana no está activa).
3. **`ocr_screen`** solo si UIA no ve (apps Java, juegos, WhatsApp).
4. **Coordenadas**: último recurso, con `screenshot` antes y después.

## Scripts reales (`~/.claude/bin`)

- `wsp.sh "texto"`: turno de WhatsApp Desktop; tipea letra por letra, envía y espera la respuesta por OCR.
- `tipear.sh [--enviar] [--ventana X] "texto"`: tipea como persona en la ventana activa.
- `admin.sh 'comando'`: PowerShell como administrador, sin UAC.
- `modo-juego.sh entrar|salir`: apaga o relanza el dev y libera RAM cuando Brandon abre o cierra LoL (lo llama la tarea «Modo juego LoL»).
- `C:\Users\Usuario\.claude-tools\wsp-recorrer-fotos.ps1`: OCR de las fotos de un chat de WhatsApp.

## Sin herramientas `mcp__desktop-control__*`

El servidor cae cuando se actualiza Node de Windows: avisar a Brandon que corra `/mcp` y reconecte; mientras tanto, los scripts de arriba.

## WhatsApp: 3 reglas duras

1. **Tecla por tecla, nunca pegar de golpe**: `wsp.sh` o `tipear.sh` (`keyboard_type` pega por portapapeles pasados 25 caracteres).
2. **Avisar a Brandon que no toque teclado ni ratón** mientras se escribe (09-10: letras cruzadas, el cliente recibió basura).
3. **Foco revisado**: `wsp.sh` lo mira en cada letra y corta con `INTERRUMPIDO … Falto escribir` (retomar solo lo que falta); `tipear.sh` solo al empezar (`ABORTADO`).

## Nunca

Contraseñas (las tipea Brandon), mover el mouse si él usa la PC, acciones destructivas sin preguntar, captchas. Parada de emergencia: mouse en la esquina superior izquierda. Con API o localhost: curl o Playwright. Recetas, coordenadas y más scripts (`captura.sh`, `foto.sh`, `leer.sh`, `chrome-claude.sh`): `references/recetas.md`.
