@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0install-and-start.ps1" %*
