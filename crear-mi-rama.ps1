# ═══════════════════════════════════════════════════════════════════════════
# CREAR MI RAMA — una rama personal para trabajar sin pisar a nadie
#
# Qué hace, en orden:
#   1. Comprueba que estás en el repo correcto y que git responde.
#   2. Te pide tu nombre y el tema, y arma la rama `nombre/tema`.
#   3. Se niega si esa rama ya existe (aquí o en GitHub).
#   4. Crea la rama LLEVÁNDOSE tus cambios sin commitear.
#   5. Te ofrece publicarla y dejar el seguimiento puesto (`-u`).
#
# Lo que NO hace: commitear. Los cambios llegan a la rama nueva tal como
# están, y tú decides qué entra en cada commit.
#
# Cómo se ejecuta, desde PowerShell en la carpeta del repo:
#
#     .\crear-mi-rama.ps1
#
# Si Windows se queja de la política de ejecución:
#
#     powershell -ExecutionPolicy Bypass -File .\crear-mi-rama.ps1
# ═══════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

function Escribir($texto, $color = 'Gray') { Write-Host $texto -ForegroundColor $color }

# El script se planta en su propia carpeta: así da igual desde dónde lo llames.
Set-Location -Path $PSScriptRoot

Escribir "`n=== Crear mi rama de trabajo ===`n" 'Cyan'

# ── 1. ¿Estamos donde creemos? ──────────────────────────────────────────
# Se mira $LASTEXITCODE y no un try/catch: PowerShell no lanza excepciones
# cuando un programa externo falla, así que el catch nunca se ejecutaría.
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Escribir "No parece un repositorio git: $PSScriptRoot" 'Red'; exit 1 }

$remoto = (git remote get-url origin 2>$null)
if (-not $remoto) { Escribir "Este repo no tiene un remoto 'origin'." 'Red'; exit 1 }
$ramaActual = (git rev-parse --abbrev-ref HEAD).Trim()

Escribir "Repositorio : $remoto"
Escribir "Rama actual : $ramaActual"

$sucios = @(git status --porcelain)
if ($sucios.Count -gt 0) {
  Escribir "Cambios sin commitear: $($sucios.Count) archivo(s) — se van contigo a la rama nueva." 'Yellow'
} else {
  Escribir "El árbol está limpio." 'Green'
}

# ── 2. El nombre ────────────────────────────────────────────────────────
Escribir "`nLa rama se llamará 'tu-nombre/tema' (ej. maria/recogidas)." 'Cyan'

do {
  $nombre = (Read-Host "  Tu nombre (sin espacios ni tildes)").Trim().ToLower()
} while ($nombre -notmatch '^[a-z0-9][a-z0-9-]*$')

do {
  $tema = (Read-Host "  Tema de la rama (ej. recogidas)").Trim().ToLower()
} while ($tema -notmatch '^[a-z0-9][a-z0-9-]*$')

$rama = "$nombre/$tema"

# Git tiene sus propias reglas y son más quisquillosas que un regex a ojo.
git check-ref-format --branch $rama *> $null
if ($LASTEXITCODE -ne 0) { Escribir "`n'$rama' no es un nombre de rama válido para git." 'Red'; exit 1 }

# ── 3. ¿Ya existe? ──────────────────────────────────────────────────────
git show-ref --verify --quiet "refs/heads/$rama"
if ($LASTEXITCODE -eq 0) {
  Escribir "`nYa tienes una rama '$rama'. Cámbiate a ella con:  git switch $rama" 'Red'
  exit 1
}

Escribir "`nConsultando GitHub…"
$enRemoto = (git ls-remote --heads origin $rama 2>$null)
if ($enRemoto) {
  Escribir "En GitHub ya existe '$rama'. Para trabajar sobre ella:" 'Red'
  Escribir "  git fetch origin; git switch $rama" 'Red'
  exit 1
}

# ── 4. Crearla ──────────────────────────────────────────────────────────
# `git switch` existe desde git 2.23. Si esta instalación es más vieja se
# recurre a `checkout -b`, que hace lo mismo y lleva ahí desde siempre.
git switch -c $rama
if ($LASTEXITCODE -ne 0) {
  Escribir "git switch no funcionó; probando con checkout -b…" 'Yellow'
  git checkout -b $rama
}
if ($LASTEXITCODE -ne 0) { Escribir "git no pudo crear la rama." 'Red'; exit 1 }
Escribir "`n✅ Rama '$rama' creada. Tus cambios siguen aquí, sin commitear." 'Green'

# ── 5. Publicarla ───────────────────────────────────────────────────────
Escribir "`nPublicarla ahora deja la rama visible en GitHub y el seguimiento" 'Cyan'
Escribir "puesto, así que después basta con 'git push' a secas." 'Cyan'
$sn = (Read-Host "  ¿Publicarla? (s/N)").Trim().ToLower()

if ($sn -eq 's') {
  git push -u origin $rama
  if ($LASTEXITCODE -eq 0) {
    Escribir "`n✅ Publicada. Ábrela en:" 'Green'
    Escribir "   $($remoto -replace '\.git$','')/tree/$rama" 'Green'
  } else {
    Escribir "`nNo se pudo publicar. Cuando resuelvas lo que diga git arriba:" 'Yellow'
    Escribir "   git push -u origin $rama" 'Yellow'
  }
} else {
  Escribir "`nQueda solo en tu equipo. Cuando quieras subirla:" 'Gray'
  Escribir "   git push -u origin $rama" 'Gray'
}

Escribir "`n── Para el día a día ──────────────────────────────────────" 'Cyan'
Escribir "  git switch $rama          # volver a tu rama"
Escribir "  git switch main            # volver a main"
Escribir "  git fetch origin           # traer lo que subió Henry"
Escribir "  git rebase origin/main     # ponerte al día sobre tu rama"
Escribir ""
