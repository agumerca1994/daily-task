@echo off
rem Instalador del Asistente de tareas (Windows): doble clic para instalar o actualizar.
chcp 65001 >nul
title Instalador - Asistente de tareas

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js 20 o mas nuevo. Instalalo desde https://nodejs.org y volve a ejecutar este instalador.
  pause
  exit /b 1
)

node "%~dp0bin\asistente.mjs" instalar
if errorlevel 1 pause
