# Commitear el trabajo del 2026-08-16 y publicarlo
#
# Cinco commits, en orden, con verificacion entre medias. Se para al primer
# fallo: mas vale quedarse a medias con lo commiteado limpio que empujar algo
# que no compila.
#
# ASCII puro y con BOM: Windows PowerShell 5.1 lee los .ps1 como ANSI si no
# llevan BOM, y las tildes rompen el parseo.

$ErrorActionPreference = "Stop"
$repo = "C:\dev\a-tiempo-logistica"

function Paso($n,$t){ Write-Host ""; Write-Host "[$n] $t" -ForegroundColor Cyan }
function Bien($t){ Write-Host "    OK   $t" -ForegroundColor Green }
function Malo($t){ Write-Host "    X    $t" -ForegroundColor Red }

Set-Location -LiteralPath $repo

Write-Host ""
Write-Host "=== Commitear el trabajo de hoy ===" -ForegroundColor White

# --- 0. Que no haya candados ni sorpresas --------------------------------
Paso 0 "Comprobando el repo"

$lock = Join-Path $repo ".git\index.lock"
if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock -Force; Bien "index.lock borrado" }

$rama = git rev-parse --abbrev-ref HEAD
if ($rama -ne "main") { Malo "Estas en la rama '$rama', no en main."; throw "rama inesperada" }
Bien "rama main"

$pendientes = @(git status --short).Count
if ($pendientes -eq 0) { Bien "no hay nada que commitear"; exit 0 }
Bien "$pendientes archivos por commitear"

# --- 1. Verificar ANTES de commitear -------------------------------------
Paso 1 "Verificando (esto tarda un par de minutos)"

Write-Host "    typecheck ..." -NoNewline
npm run typecheck --silent 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host ""; npm run typecheck; Malo "typecheck fallo"; throw "typecheck" }
Write-Host " ok"

Write-Host "    lint ......." -NoNewline
npm run lint --silent 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host ""; npm run lint; Malo "lint fallo"; throw "lint" }
Write-Host " ok"

Write-Host "    tests ......" -NoNewline
$salidaTests = npm run test:run 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Write-Host ""; Write-Host $salidaTests; Malo "tests fallaron"; throw "tests" }
if ($salidaTests -match "(\d+)\s+passed") { Write-Host (" ok - " + $Matches[1] + " passed") }
else { Write-Host " ok" }

Write-Host "    build ......" -NoNewline
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host ""; npm run build; Malo "build fallo"; throw "build" }
Write-Host " ok"

Bien "los cuatro filtros pasan"

# --- 2. Los commits ------------------------------------------------------
# Se agrupan por EFECTO, no por tipo de archivo: asi cada commit se puede
# revertir solo sin llevarse por delante nada mas.

function Commit($titulo, $rutas, $mensaje) {
    $hay = $false
    foreach ($r in $rutas) { if (Test-Path -LiteralPath $r) { git add -- $r; $hay = $true } }
    $staged = @(git diff --cached --name-only)
    if ($staged.Count -eq 0) { Write-Host "    (nada que commitear en: $titulo)" -ForegroundColor DarkGray; return }
    git commit -q -m $mensaje
    Bien ("{0} - {1} archivo(s)" -f $titulo, $staged.Count)
}

Paso 2 "Commiteando"

# 2.1 La regla de finales de linea VA CON su aplicacion. Si se separan, un
#     clon en Windows reintroduce los CRLF y volvemos al punto de partida.
git add .gitattributes
git add --renormalize .
$staged = @(git diff --cached --name-only)
if ($staged.Count -gt 0) {
    git commit -q -m "chore: finales de linea en LF, para que los diffs se lean"
    Bien ("finales de linea - {0} archivo(s)" -f $staged.Count)
}

Commit "observabilidad" @(
    "src/lib/observabilidad.ts",
    "src/app/api/telemetria",
    "src/components/CapturaDeErrores.tsx",
    "src/middleware.ts",
    "src/app/layout.tsx",
    "src/app/global-error.tsx",
    "src/components/PantallaError.tsx"
) "feat: la app avisa cuando algo se rompe, en vez de esperar el reclamo"

Commit "tests" @(
    "tests",
    "vitest.config.ts",
    "package.json",
    "package-lock.json",
    "src/lib/utils.ts"
) "test: red de seguridad sobre zonas, tarifas y hora de Medellin"

Commit "CI" @(".github") "chore: verificacion automatica en cada cambio"

# Lo que quede: infra, docs, .env.example, CLAUDE.md y el PDF movido a docs/
git add -A
$staged = @(git diff --cached --name-only)
if ($staged.Count -gt 0) {
    git commit -q -m "feat: infraestructura de AWS para el dominio propio y el reloj de Shopify"
    Bien ("infraestructura y documentacion - {0} archivo(s)" -f $staged.Count)
}

# --- 3. Resultado --------------------------------------------------------
Paso 3 "Lo que quedo"

git --no-pager log --oneline -6
$restan = @(git status --short).Count
if ($restan -gt 0) {
    Write-Host ""
    Write-Host "    Quedan $restan sin commitear:" -ForegroundColor Yellow
    git status --short
} else {
    Bien "arbol limpio"
}

# --- 4. Publicar ---------------------------------------------------------
Paso 4 "Publicando en GitHub"

Write-Host "    Se van a subir los commits de arriba a origin/main." -ForegroundColor Yellow
$r = Read-Host "    Continuar? (s/N)"
if ($r -eq "s" -or $r -eq "S") {
    git push origin main
    Bien "publicado"
    Write-Host ""
    Write-Host "    El CI arranca solo. Miralo aqui:" -ForegroundColor White
    Write-Host "    https://github.com/HenryStark866/A-tiempo-log-stica/actions"
} else {
    Write-Host "    Sin publicar. Cuando quieras: git push origin main" -ForegroundColor DarkGray
}

Write-Host ""
