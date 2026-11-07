@echo off
rem Espejo del celular: abre scrcpy con un titulo fijo para que el panel lo muestre
rem (Camaras > Espejo del celular > "Mostrar mi celular aqui"). Doble clic para abrirlo.
rem Sin cable: con el cable puesto, abrelo una vez como  espejo-celular.cmd --tcpip
rem y desconecta el cable. Apagar la pantalla del celular y seguir viendolo: Alt+O.
setlocal EnableExtensions
title Espejo del celular
set "SCRCPY="
if exist "%~dp0scrcpy.exe" set "SCRCPY=%~dp0scrcpy.exe"
if not defined SCRCPY if exist "%USERPROFILE%\scrcpy\scrcpy.exe" set "SCRCPY=%USERPROFILE%\scrcpy\scrcpy.exe"
if not defined SCRCPY for /d %%D in ("%USERPROFILE%\scrcpy*" "%USERPROFILE%\Downloads\scrcpy*" "%USERPROFILE%\Desktop\scrcpy*" "C:\scrcpy*") do (
  if exist "%%~D\scrcpy.exe" set "SCRCPY=%%~D\scrcpy.exe"
  for /d %%E in ("%%~D\scrcpy*") do if exist "%%~E\scrcpy.exe" set "SCRCPY=%%~E\scrcpy.exe"
)
if not defined SCRCPY for /f "delims=" %%P in ('where scrcpy 2^>nul') do if not defined SCRCPY set "SCRCPY=%%P"
if not defined SCRCPY goto :falta
echo Abriendo el celular con "%SCRCPY%"
echo Deja esta ventana abierta. En el panel toca "Mostrar mi celular aqui" y elige "Celular de Brandon".
"%SCRCPY%" --window-title "Celular de Brandon" --stay-awake %*
if errorlevel 1 goto :fallo
exit /b 0
:fallo
echo.
echo No se pudo abrir el celular. Revisa: cable conectado, "Depuracion USB" activada
echo y que aceptaste "Permitir depuracion USB" en la pantalla del celular.
pause
exit /b 1
:falta
echo No encontre scrcpy.exe.
echo Bajalo de la pagina que se abre (el zip scrcpy-win64), descomprimelo en
echo %USERPROFILE%\scrcpy  y vuelve a abrir este archivo.
start "" "https://github.com/Genymobile/scrcpy/releases/latest"
pause
exit /b 1
