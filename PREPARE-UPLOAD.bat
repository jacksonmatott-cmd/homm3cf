@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13+ or 24 LTS on this HOME computer, then reopen this file.
  goto end
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<13)){console.error('Use Node.js 22.13 or newer. Current version: '+process.version);process.exit(1)}"
if errorlevel 1 goto end
call npm install
if errorlevel 1 goto end
node scripts\prepare-pages-upload.mjs
if errorlevel 1 goto end
echo.
echo Your COMPLETE upload is UPLOAD-TO-CLOUDFLARE.zip in this folder.
echo In Cloudflare, use Pages - Direct Upload. Add the free D1 binding DB.
echo Read CLOUDFLARE-UPLOAD.md for the short dashboard steps.
:end
pause
