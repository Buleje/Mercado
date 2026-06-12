#!/usr/bin/env node
// Stop hook — DESACTIVADO 2026-04-28.
// Antes lanzaba explorer.exe (YouTube) + powershell.exe (beeps) en cada Stop.
// En WSL/Windows eso robaba foco al terminal y simulaba reinicios.
// Mantenido como no-op para no romper la config de hooks.
process.exit(0);
