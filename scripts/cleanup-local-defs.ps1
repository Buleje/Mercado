# Remove duplicate local function definitions that now conflict with @/lib/utils imports
# Targets any remaining: function formatCurrency(...) { ... } and function formatDate(...) { ... }
# Only removes them if the file already imports from @/lib/utils

$adminDir = "components\admin"
$files = Get-ChildItem -Path $adminDir -Filter "*.tsx" -Recurse
$totalFixed = 0

foreach ($file in $files) {
    $original = Get-Content $file.FullName -Raw -Encoding UTF8
    $content = $original

    # Only process files that already import from @/lib/utils
    if ($content -notmatch 'from "@/lib/utils"') { continue }

    # Check if there's a local formatCurrency or formatDate definition that would conflict
    $hasLocalFmtCurrency = $content -match 'function formatCurrency\('
    $hasLocalFmtDate = $content -match 'function formatDate\('

    if (-not $hasLocalFmtCurrency -and -not $hasLocalFmtDate) { continue }

    # Remove local formatCurrency function (single-line body style)
    # Matches: function formatCurrency(n: number) { return `...`; }
    if ($hasLocalFmtCurrency) {
        $content = $content -replace '(\r?\n)function formatCurrency\([^)]*\) \{[^\r\n]+\}', ''
        $content = $content -replace '(\r?\n)function formatCurrency\([^)]*\) \{(\r?\n)[^\r\n]+(\r?\n)\}', ''
    }

    # Remove local formatDate function (single-line or multi-line)
    if ($hasLocalFmtDate) {
        $content = $content -replace '(\r?\n)function formatDate\([^)]*\) \{[^\r\n]+\}', ''
        # Multi-line version with try/catch
        $content = [regex]::Replace($content, '\r?\nfunction formatDate\([^)]*\) \{[^}]+\}', '')
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
        $totalFixed++
        Write-Host "  cleaned $($file.Name)"
    }
}

Write-Host ""
Write-Host "Cleanup done: $totalFixed files cleaned"
