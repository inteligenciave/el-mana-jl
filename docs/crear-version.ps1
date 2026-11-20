<#
  Crea el commit y la etiqueta de una versión de El Maná JL. NUNCA sube a GitHub (no hace push).
  Por defecto solo MUESTRA lo que haría. Para hacerlo de verdad hay que agregar -Ejecutar.

  Uso (desde C:\Users\Aleja\El mana-puestos):
    .\docs\crear-version.ps1 -Version v2.0 -CloudflareId 1a2b3c4d -Migraciones "0027-0038" -Resumen "Producción rehecha, nómina en USD, bonos"
    .\docs\crear-version.ps1 -Version v2.0 -CloudflareId 1a2b3c4d -Migraciones "0027-0038" -Resumen "..." -Ejecutar
#>
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^v\d+\.\d+$')][string]$Version,
  [Parameter(Mandatory=$true)][string]$CloudflareId,
  [string]$Migraciones = "ninguna",
  [Parameter(Mandatory=$true)][string]$Resumen,
  [switch]$Ejecutar
)
$ErrorActionPreference = 'Stop'
$fecha = Get-Date -Format 'yyyy-MM-dd'

$rama = (git branch --show-current).Trim()
if ($rama -ne 'puestos-6') { throw "Rama actual: $rama. Las versiones se crean en puestos-6." }
if (git tag --list $Version) { throw "La etiqueta $Version ya existe." }

# Candado: nada de respaldos ni claves en lo que se va a guardar
git add -A -n | Out-Null
$prohibidos = git status --short | Where-Object { $_ -match 'respaldo|\.dev\.vars|\.pem|\.key' }
if ($prohibidos) { Write-Host "ARCHIVOS PROHIBIDOS:"; $prohibidos; throw "Se detuvo: hay respaldos o claves en el cambio." }

$mensajeCommit = "$Version · $Resumen"
$mensajeTag = "$Version · $fecha · Cloudflare $CloudflareId · migraciones $Migraciones"

Write-Host "Rama: $rama"
Write-Host "Commit:   $mensajeCommit"
Write-Host "Etiqueta: $Version  ->  $mensajeTag"
git status --short

if (-not $Ejecutar) {
  Write-Host "`n(Modo vista previa: no se hizo nada. Agrega -Ejecutar para crear el commit y la etiqueta en local.)"
  exit 0
}

git add -A
git commit -m $mensajeCommit
git tag -a $Version -m $mensajeTag
Write-Host "`nListo en local. NO se subió nada. Avisa al dueño y, solo con su permiso expreso:"
Write-Host "  git push origin puestos-6:main"
Write-Host "  git push origin $Version"
