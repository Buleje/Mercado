@echo off
rem Puente de camaras Hik-Connect a panel (ADR-466). Doble clic para arrancarlo.
rem Lee camaras-puente-pc.json de esta misma carpeta (boton "Descargar configuracion" del panel).
title Puente de camaras
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0camaras-puente-pc.ps1" %*
if errorlevel 1 pause
