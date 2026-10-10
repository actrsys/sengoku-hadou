@echo off
cd /d %~dp0
node tests\run_visual_tests.js
if errorlevel 1 pause
