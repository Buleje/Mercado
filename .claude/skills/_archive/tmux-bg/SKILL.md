---
name: tmux-bg
description: Sesión tmux persistente para mantener estado entre comandos Bash. Útil para REPLs (node, python, psql), procesos largos en background, o reanudar una sesión interrumpida. Usar cuando necesite estado sostenido o trabajar en background.
user-invocable: true
model: sonnet
allowed-tools: Read, Bash, Grep, Glob
---

# /tmux-bg — Sesión bash persistente

## Cuándo usarla

- Mantener un REPL abierto (node, python, psql) entre comandos.
- Correr procesos largos sin bloquear la conversación.
- Reanudar trabajo si la conexión se corta.

## Comandos

```bash
# Crear / reusar sesión llamada "bsm-bg"
tmux new-session -d -s bsm-bg 2>/dev/null || true

# Mandar comando a la sesión sin bloquear
tmux send-keys -t bsm-bg "npm run test:e2e" C-m

# Capturar últimas 50 líneas de output
tmux capture-pane -t bsm-bg -p | tail -50

# Listar sesiones
tmux list-sessions

# Cerrar sesión cuando terminé
tmux kill-session -t bsm-bg
```

## Pattern recomendado

```bash
# 1. Asegurar sesión
tmux new-session -d -s bsm-bg 2>/dev/null || true

# 2. Disparar comando largo
tmux send-keys -t bsm-bg "npm run build 2>&1 | tee /tmp/build.log" C-m

# 3. Hacer otro trabajo en paralelo (responder al usuario, editar archivos…)

# 4. Volver a chequear progreso
tmux capture-pane -t bsm-bg -p | tail -20
# o leer /tmp/build.log
```

## Uso con /notify

Combinar con notify para que avise cuando termine:

```bash
tmux send-keys -t bsm-bg \
  "npm run test && node .claude/skills/notify/send.mjs 'Tests OK'" C-m
```
