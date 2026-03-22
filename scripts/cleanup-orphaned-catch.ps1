$adminDir = "components\admin"
$files = Get-ChildItem -Path $adminDir -Filter "*.tsx" -Recurse
$totalFixed = 0

foreach ($file in $files) {
    if ($file.Name -eq 'CashRegisterTab.tsx') { continue } # we intentionally left fmtDateShort here which has a catch { return iso; }
    if ($file.Name -eq 'DashboardTab.tsx') { continue } # we intentionally left fmtDateShort here too

    $original = Get-Content $file.FullName -Raw -Encoding UTF8
    $content = $original

    # regex to remove `); } catch { return iso; } }` or similar variations
    # The previous cleanup left things like:
    # ); }
    #   catch { return iso; }
    # }
    
    $content = $content -replace '(\r?\n\s*\); \}\r?\n\s*catch \{ return iso; \}\r?\n\})', ''
    $content = $content -replace '(\); \} catch \{ return iso; \}\r?\n\})', ''
    $content = $content -replace '(\r?\n\s*\} catch \{ return iso; \}\r?\n\})', ''

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
        $totalFixed++
        Write-Host "Fixed $($file.Name)"
    }
}
Write-Host "Total fixed: $totalFixed"
