# Commitear y publicar el arreglo de la importacion + el trabajo del dia
#
# ORDEN DELIBERADO: el arreglo de la carga de archivos va PRIMERO y SOLO,
# porque es lo que se cayo hoy en operacion. Asi Vercel lo despliega en cuanto
# se hace push, sin esperar a que se revise nada mas, y si hubiera que
# revertirlo se revierte ese commit sin tocar el resto.
#
# ASCII puro y con BOM: Windows PowerShell 5.1 lee los .ps1 como ANSI si no
# llevan BOM, y las tildes rompen el parseo.

$ErrorActionPreference = "Stop"
$repo = "C:\dev\a-tiempo-logistica"

function Paso($n,$t){ Write-Host ""; Write-Host "[$n] $t" -ForegroundColor Cyan }
function Bien($t){ Write-Host "    OK   $t" -ForegroundColor Green }
function Malo($t){ Write-Host "    X    $t" -ForegroundColor Red }
function Ojo($t){  Write-Host "    !    $t" -ForegroundColor Yellow }

Set-Location -LiteralPath $repo

Write-Host ""
Write-Host "=== Arreglo de la importacion + trabajo del dia ===" -ForegroundColor White

# --- 0. Comprobaciones ---------------------------------------------------
Paso 0 "Comprobando el repo"

$lock = Join-Path $repo ".git\index.lock"
if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock -Force; Bien "index.lock borrado" }

$rama = git rev-parse --abbrev-ref HEAD
if ($rama -ne "main") { Malo "Estas en '$rama', no en main."; throw "rama inesperada" }
Bien "rama main"

if (@(git status --short).Count -eq 0) { Bien "no hay nada que commitear"; exit 0 }

# --- 1. Verificar ANTES de commitear -------------------------------------
Paso 1 "Verificando (un par de minutos)"

# Correr un comando externo y devolver salida + codigo de salida.
#
# El ErrorActionPreference se baja a Continue SOLO aqui dentro, y esa es la
# parte importante: con "Stop", PowerShell convierte CUALQUIER escritura a
# stderr de un programa externo en un error fatal. npm y vitest escriben avisos
# perfectamente normales por stderr -por ejemplo, el aviso de que los tests de
# base de datos se saltan- asi que el script moria con un NativeCommandError
# dando a entender que los tests habian fallado cuando habian pasado todos.
#
# Quien decide si algo fallo es el CODIGO DE SALIDA, que es para lo que existe.
function Correr($etiqueta) {
    $previo = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $salida = & npm run $etiqueta 2>&1 | Out-String
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = $previo
    return [pscustomobject]@{ Salida = $salida; Codigo = $codigo }
}

foreach ($paso in @("typecheck","lint","test:run","build")) {
    Write-Host ("    {0,-10} ..." -f $paso) -NoNewline
    $r = Correr $paso
    if ($r.Codigo -ne 0) {
        Write-Host " FALLO" -ForegroundColor Red
        Write-Host ""
        Write-Host $r.Salida
        Malo "$paso fallo. No se commiteo nada."
        throw $paso
    }
    if ($paso -eq "test:run" -and $r.Salida -match "(\d+)\s+passed") {
        Write-Host (" ok - " + $Matches[1] + " passed")
    } else {
        Write-Host " ok"
    }
}

Bien "los cuatro filtros pasan"

# --- 2. Los commits ------------------------------------------------------
Paso 2 "Commiteando"

function Commit($titulo, $rutas, $mensaje) {
    foreach ($r in $rutas) { if (Test-Path -LiteralPath $r) { git add -- $r } }
    $s = @(git diff --cached --name-only)
    if ($s.Count -eq 0) { Write-Host "    (nada en: $titulo)" -ForegroundColor DarkGray; return }
    git commit -q -m $mensaje
    Bien ("{0} - {1} archivo(s)" -f $titulo, $s.Count)
}

# 2.0 Finales de linea. La regla VA CON su aplicacion: separadas, un clon en
#     Windows reintroduce los CRLF y volvemos al punto de partida.
git add .gitattributes
git add --renormalize .
if (@(git diff --cached --name-only).Count -gt 0) {
    git commit -q -m "chore: finales de linea en LF, para que los diffs se lean"
    Bien "finales de linea"
}

# 2.1 URGENTE: el mensajero nuevo no podia subir sus documentos. Va primero
#     porque hay uno esperando para entrar a la operacion.
Commit "MENSAJEROS (hay uno esperando)" @(
    "supabase/migrations/0084_el_mensajero_nuevo_puede_subir_sus_documentos.sql",
    "src/lib/constants.ts",
    "src/lib/types.ts",
    "src/app/(plataforma)/mi-perfil/page.tsx"
) "fix: el mensajero recien registrado ya puede subir sus documentos

at_register_courier_doc exigia rol mensajero, pero quien se registra queda como
pendiente hasta que un admin lo habilita. Y para habilitarlo hay que revisarle
los documentos que no podia subir: nadie nuevo entraba a la operacion.

La pantalla hacia lo mismo: mi-perfil solo mostraba la seccion a role ===
mensajero, asi que el pendiente no veia ni el formulario.

Lo que protege estos archivos no es el rol sino la carpeta - storage y la RPC
exigen que la ruta empiece por el auth.uid() de quien sube - asi que abrirlo al
pendiente que pidio ser mensajero no baja la guardia.

Ademas se agrega el certificado de medidas correctivas (RNMC), que faltaba en
el catalogo y no es lo mismo que antecedentes judiciales."

# 2.2 EL ARREGLO DE LA IMPORTACION. Va solo para desplegarlo y revertirlo aparte.
Commit "IMPORTACION (el fallo de hoy)" @(
    "src/lib/csv.ts",
    "src/app/(plataforma)/destinatarios/page.tsx",
    "src/app/(plataforma)/productos/page.tsx",
    "src/components/useMyClient.ts",
    "tests/importacion.test.ts"
) "fix: la base de clientes y productos vuelve a subirse completa

El payload de destinatarios llevaba todas las columnas sin mapear del archivo
en un campo extra que at_recipients no tiene y at_sync_recipients nunca lee. Un
export de e-commerce trae 50-70 columnas y el mapeo usa seis: las demas viajaban
por cada fila hasta reventar la peticion, sin un error que explicara nada.

Ahora los lotes se cortan por peso del JSON y no por numero de filas, el bucle
de productos deja de tragarse los errores, y una importacion a medias dice
cuantas entraron y que volver a subir el mismo archivo no duplica."

# 2.2 El resto del dia
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
    "tests", "vitest.config.ts", "package.json", "package-lock.json", "src/lib/utils.ts"
) "test: red de seguridad sobre zonas, tarifas y hora de Medellin"

Commit "migracion del precio" @(
    "supabase/migrations/0083_el_precio_del_csv_no_se_multiplica_por_cien.sql"
) "fix: un precio con coma decimal deja de multiplicarse por cien"

Commit "CI" @(".github") "chore: verificacion automatica en cada cambio"

git add -A
if (@(git diff --cached --name-only).Count -gt 0) {
    git commit -q -m "feat: infraestructura de AWS para el dominio propio y el reloj de Shopify"
    Bien "infraestructura y documentacion"
}

# --- 3. Resultado --------------------------------------------------------
Paso 3 "Lo que quedo"
git --no-pager log --oneline -8
if (@(git status --short).Count -gt 0) { Ojo "Quedan cambios sin commitear:"; git status --short }
else { Bien "arbol limpio" }

# --- 4. Publicar ---------------------------------------------------------
Paso 4 "Publicar en GitHub"
Write-Host "    Al hacer push, Vercel despliega solo." -ForegroundColor Yellow
$r = Read-Host "    Continuar? (s/N)"
if ($r -eq "s" -or $r -eq "S") {
    git push origin main
    Bien "publicado"
    Write-Host ""
    Write-Host "    CI:      https://github.com/HenryStark866/A-tiempo-log-stica/actions"
    Write-Host "    Vercel:  https://vercel.com/dashboard"
} else {
    Write-Host "    Sin publicar. Cuando quieras: git push origin main" -ForegroundColor DarkGray
}

# --- 5. Lo que el push NO hace -------------------------------------------
Write-Host ""
Write-Host "-----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "FALTA UNA COSA QUE EL DESPLIEGUE NO HACE" -ForegroundColor Yellow
Write-Host ""
Write-Host "  La migracion 0083 hay que aplicarla a mano en Supabase:"
Write-Host ""
Write-Host "    1. supabase.com/dashboard -> tu proyecto -> SQL Editor"
Write-Host "    2. Pega el contenido de:"
Write-Host "       supabase\migrations\0083_el_precio_del_csv_no_se_multiplica_por_cien.sql"
Write-Host "    3. Run. Lleva sus propias aserciones: si alguna falla, no se aplica."
Write-Host ""
Write-Host "  Sin ella, un precio como 89900,00 se sigue guardando como 8990000."
Write-Host ""
Write-Host "  Y despues, la prueba que de verdad cierra esto:" -ForegroundColor White
Write-Host "    sube el archivo de un comercio real y confirma que entra completo."
Write-Host ""
