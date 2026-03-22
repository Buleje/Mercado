$adminDir = "components\admin"
$files = Get-ChildItem -Path $adminDir -Filter "*.tsx" -Recurse
$totalModified = 0

foreach ($file in $files) {
    $original = Get-Content $file.FullName -Raw -Encoding UTF8
    $content = $original

    $hasFmt     = $content -match 'function fmt\(n:'
    $hasFmtDate = $content -match 'function fmtDate\(iso:'

    if (-not $hasFmt -and -not $hasFmtDate) { continue }

    # Remove single-line fmt definitions
    if ($hasFmt) {
        $content = $content -replace 'function fmt\(n: number\) \{[^\r\n]+\r?\n', ''
        $content = $content -replace 'const fmt = \(n: number\) => [^\r\n]+\r?\n', ''
    }

    # Remove single-line fmtDate definitions
    if ($hasFmtDate) {
        $content = $content -replace 'function fmtDate\(iso: string\) \{[^\r\n]+\r?\n', ''
        $content = $content -replace 'const fmtDate = \(iso: string\) => [^\r\n]+\r?\n', ''
    }

    # Rename usages
    if ($hasFmt)     { $content = $content -replace '\bfmt\(', 'formatCurrency(' }
    if ($hasFmtDate) { $content = $content -replace '\bfmtDate\(', 'formatDate(' }

    # Build list of new imports needed
    $toAdd = @()
    if ($hasFmt)     { $toAdd += 'formatCurrency' }
    if ($hasFmtDate) { $toAdd += 'formatDate' }

    # Check if @/lib/utils import already exists
    if ($content -match 'import \{([^}]+)\} from "@/lib/utils"') {
        $existingBlock = $Matches[0]
        $existingInner = $Matches[1]
        $newNames = $toAdd | Where-Object { $existingInner -notmatch [regex]::Escape($_) }
        if ($newNames.Count -gt 0) {
            $append = ", " + ($newNames -join ', ')
            $replacement = $existingBlock -replace '(\} from "@/lib/utils")', "$append}"  + ' from "@/lib/utils"'
            # simpler and safer:
            $newInner = $existingInner.TrimEnd() + $append
            $newImport = "import {" + $newInner + '} from "@/lib/utils"'
            $content = $content -replace [regex]::Escape($existingBlock), $newImport
        }
    } else {
        # Add a new import line: insert after the LAST existing import line
        $addStr = $toAdd -join ', '
        $newImport = "import { $addStr } from `"@/lib/utils`";"
        # find last import line boundary and insert after it
        $content = [regex]::Replace(
            $content,
            '(?m)(^import [^\r\n]+;\r?\n)(?!import )',
            { param($m) $m.Value + $newImport + "`n" },
            [System.Text.RegularExpressions.RegexOptions]::Multiline
        )
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
        $totalModified++
        Write-Host "  ok $($file.Name)"
    }
}

Write-Host ""
Write-Host "Done: $totalModified files updated"
