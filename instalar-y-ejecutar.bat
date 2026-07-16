@echo off
rem ============================================================
rem  A TIEMPO LOGISTICA - Instalador y arranque local
rem  Doble clic y listo: clona/actualiza el repo, instala
rem  dependencias, configura el entorno y levanta el servidor.
rem ============================================================
title A Tiempo Logistica - Setup local
setlocal

set "REPO_URL=https://github.com/HenryStark866/A-tiempo-log-stica.git"
set "CARPETA=A-tiempo-logistica"
set "SUPABASE_URL=https://uhbtivaepyhwfdvtpfjq.supabase.co"
set "SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYnRpdmFlcHlod2ZkdnRwZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODU0MTMsImV4cCI6MjA4OTg2MTQxM30.YaJzau2pASUSLmL7OVwqqTnp5M9Q6s3lQsXCbGw_W5M"

echo.
echo  =====================================================
echo   A TIEMPO LOGISTICA - Preparando entorno local
echo  =====================================================
echo.

rem --- 1. Verificar Git ---------------------------------------
where git >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Git no esta instalado.
    echo  Descargalo de: https://git-scm.com/download/win
    echo  Instalalo con las opciones por defecto y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)
echo  [OK] Git detectado

rem --- 2. Verificar Node.js (18 o superior) -------------------
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js no esta instalado.
    echo  Descarga la version LTS de: https://nodejs.org
    echo  Instalala con las opciones por defecto y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% LSS 18 (
    echo  [ERROR] Tu Node.js es muy viejo ^(v%NODE_MAJOR%^). Se necesita v18 o superior.
    echo  Descarga la version LTS de: https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo  [OK] Node.js detectado v%NODE_MAJOR%.x

rem --- 3. Ubicar o clonar el proyecto -------------------------
if exist "%~dp0package.json" (
    rem El .bat esta dentro de la carpeta del proyecto
    cd /d "%~dp0"
    echo  [OK] Proyecto detectado en esta carpeta. Actualizando...
    git pull --ff-only
) else if exist "%~dp0%CARPETA%\package.json" (
    cd /d "%~dp0%CARPETA%"
    echo  [OK] Proyecto ya clonado. Actualizando...
    git pull --ff-only
) else (
    echo  [...] Clonando el repositorio...
    cd /d "%~dp0"
    git clone "%REPO_URL%" "%CARPETA%"
    if errorlevel 1 (
        echo  [ERROR] No se pudo clonar el repositorio. Revisa tu conexion a internet.
        pause
        exit /b 1
    )
    cd /d "%~dp0%CARPETA%"
)

rem --- 4. Instalar dependencias -------------------------------
echo.
echo  [...] Instalando dependencias (puede tardar unos minutos la primera vez)...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo  [ERROR] Fallo npm install. Revisa tu conexion e intenta de nuevo.
    pause
    exit /b 1
)
echo  [OK] Dependencias instaladas

rem --- 5. Crear .env.local con las credenciales ---------------
if not exist ".env.local" (
    > .env.local echo NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%
    >> .env.local echo NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%
    echo  [OK] Archivo .env.local creado con la configuracion de Supabase
) else (
    echo  [OK] .env.local ya existe, no se modifica
)

rem --- 6. Arrancar el servidor y abrir el navegador -----------
echo.
echo  =====================================================
echo   Todo listo. Iniciando servidor de desarrollo...
echo.
echo   URL:      http://localhost:3000
echo   Usuario:  admin@atiempo.co
echo   Password: Atiempo2026!
echo.
echo   (Deja esta ventana abierta. Para detener: Ctrl+C
echo    o simplemente cierra la ventana)
echo  =====================================================
echo.

start "" /min cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:3000"
call npm run dev

pause
