param(
    [switch]$IncludeArchive,
    [ValidateSet('text', 'json')]
    [string]$Output = 'text'
)

$ErrorActionPreference = 'Stop'

function Get-RelativePath {
    param(
        [string]$Root,
        [string]$Path
    )

    $normalizedRoot = [System.IO.Path]::GetFullPath($Root)
    $normalizedPath = [System.IO.Path]::GetFullPath($Path)
    $relative = $normalizedPath.Substring($normalizedRoot.Length).TrimStart('\', '/')
    return $relative.Replace('\', '/')
}

function New-Issue {
    param(
        [string]$Type,
        [string]$File,
        [int]$Line,
        [string]$Message,
        [string]$Target = ''
    )

    return [pscustomobject]@{
        type = $Type
        file = $File
        line = $Line
        message = $Message
        target = $Target
    }
}

function Test-ExcludedExtensionPath {
    param([string]$Path)
    return $Path -match '\\(node_modules|\.vscode-test|dist|out)\\'
}

function Test-ArchivePath {
    param([string]$Path)
    return $Path -match '\\Архив\\'
}

function Resolve-LinkTarget {
    param(
        [string]$RepoRoot,
        [string]$SourceFile,
        [string]$RawTarget
    )

    $target = $RawTarget.Trim()
    if ($target.StartsWith('<') -and $target.EndsWith('>')) {
        $target = $target.Trim('<', '>')
    }

    if ([string]::IsNullOrWhiteSpace($target)) { return $null }
    if ($target -match '^(https?:|mailto:|#)') { return $null }
    if ($target -match '^[a-zA-Z][a-zA-Z0-9+\-.]*:') { return $null }

    $pathPart = $target.Split('#')[0].Split('?')[0].Trim()
    if ([string]::IsNullOrWhiteSpace($pathPart)) { return $null }

    if ($pathPart.StartsWith('/')) {
        return Join-Path $RepoRoot ($pathPart.TrimStart('/', '\'))
    }

    $sourceDir = Split-Path -Parent $SourceFile
    return Join-Path $sourceDir ($pathPart.Replace('/', '\'))
}

function Find-DocumentVersion {
    param(
        [string]$Content,
        [string[]]$Patterns
    )

    foreach ($pattern in $Patterns) {
        $match = [regex]::Match($Content, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($match.Success) {
            return $match.Groups[1].Value
        }
    }

    return $null
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$issues = New-Object System.Collections.Generic.List[object]

$rootDocs = Get-ChildItem -Path $repoRoot -File -Filter *.md
$docsDocs = if (Test-Path (Join-Path $repoRoot 'Документы')) {
    Get-ChildItem -Path (Join-Path $repoRoot 'Документы') -Recurse -File -Filter *.md
} else {
    @()
}

$extensionDocs = if (Test-Path (Join-Path $repoRoot 'vscode-extension')) {
    Get-ChildItem -Path (Join-Path $repoRoot 'vscode-extension') -Recurse -File -Filter *.md |
        Where-Object { -not (Test-ExcludedExtensionPath $_.FullName) }
} else {
    @()
}

$allFiles = @($rootDocs + $docsDocs + $extensionDocs) |
    Sort-Object FullName -Unique |
    Where-Object { $IncludeArchive -or -not (Test-ArchivePath $_.FullName) }

foreach ($file in $allFiles) {
    $relativeFile = Get-RelativePath -Root $repoRoot -Path $file.FullName
    $content = Get-Content -LiteralPath $file.FullName
    $inCodeFence = $false
    $headingLines = @{}

    for ($index = 0; $index -lt $content.Count; $index++) {
        $line = $content[$index]

        if ($line -match '^\s*```') {
            $inCodeFence = -not $inCodeFence
            continue
        }

        if ($inCodeFence) { continue }

        if ($line -match '^#{1,6}\s+(.+?)\s*$') {
            $heading = ($Matches[1] -replace '\s+', ' ').Trim()
            if (-not $headingLines.ContainsKey($heading)) {
                $headingLines[$heading] = New-Object System.Collections.Generic.List[int]
            }
            $headingLines[$heading].Add($index + 1)
        }

        $matches = [regex]::Matches($line, '!?\[[^\]]+\]\(([^)]+)\)')
        foreach ($match in $matches) {
            $rawTarget = $match.Groups[1].Value
            $resolvedTarget = Resolve-LinkTarget -RepoRoot $repoRoot -SourceFile $file.FullName -RawTarget $rawTarget
            if ($null -eq $resolvedTarget) { continue }

            try {
                if (-not (Test-Path -LiteralPath $resolvedTarget)) {
                    $issues.Add((New-Issue -Type 'broken_link' -File $relativeFile -Line ($index + 1) -Message 'Broken local link' -Target $rawTarget))
                }
            } catch {
                $issues.Add((New-Issue -Type 'invalid_link' -File $relativeFile -Line ($index + 1) -Message 'Invalid link path' -Target $rawTarget))
            }
        }
    }

    foreach ($heading in $headingLines.Keys) {
        $lines = $headingLines[$heading]
        if ($lines.Count -gt 1) {
            $lineText = ($lines | ForEach-Object { $_.ToString() }) -join ', '
            $issues.Add((New-Issue -Type 'duplicate_heading' -File $relativeFile -Line $lines[0] -Message "Duplicate heading '$heading' (lines: $lineText)"))
        }
    }
}

$packageJsonPath = Join-Path $repoRoot 'vscode-extension/package.json'
if (Test-Path -LiteralPath $packageJsonPath) {
    $packageVersion = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version

    $rootReadmePath = Join-Path $repoRoot 'README.md'
    $rootReadmeContent = if (Test-Path -LiteralPath $rootReadmePath) { Get-Content -LiteralPath $rootReadmePath -Raw } else { '' }
    $rootVersion = Find-DocumentVersion -Content $rootReadmeContent -Patterns @(
        'version-([0-9]+\.[0-9]+\.[0-9]+)-',
        '`([0-9]+\.[0-9]+\.[0-9]+)`'
    )

    if ($null -eq $rootVersion) {
        $issues.Add((New-Issue -Type 'version_missing' -File 'README.md' -Line 0 -Message 'Unable to detect release version in README.md'))
    } elseif ($rootVersion -ne $packageVersion) {
        $issues.Add((New-Issue -Type 'version_mismatch' -File 'README.md' -Line 0 -Message "README version ($rootVersion) does not match package.json ($packageVersion)"))
    }

    $extensionReadmePath = Join-Path $repoRoot 'vscode-extension/README.md'
    $extensionReadmeContent = if (Test-Path -LiteralPath $extensionReadmePath) { Get-Content -LiteralPath $extensionReadmePath -Raw } else { '' }
    $extensionVersion = Find-DocumentVersion -Content $extensionReadmeContent -Patterns @(
        '\([^\)]*?([0-9]+\.[0-9]+\.[0-9]+)\)',
        'multicode-visual-programming-([0-9]+\.[0-9]+\.[0-9]+)\.vsix'
    )

    if ($null -eq $extensionVersion) {
        $issues.Add((New-Issue -Type 'version_missing' -File 'vscode-extension/README.md' -Line 0 -Message 'Unable to detect release version in vscode-extension/README.md'))
    } elseif ($extensionVersion -ne $packageVersion) {
        $issues.Add((New-Issue -Type 'version_mismatch' -File 'vscode-extension/README.md' -Line 0 -Message "Extension README version ($extensionVersion) does not match package.json ($packageVersion)"))
    }
}

$result = [pscustomobject]@{
    success = ($issues.Count -eq 0)
    checkedFiles = $allFiles.Count
    includeArchive = [bool]$IncludeArchive
    issues = $issues
}

if ($Output -eq 'json') {
    $result | ConvertTo-Json -Depth 8
} else {
    if ($issues.Count -eq 0) {
        Write-Output "OK: documentation check passed for $($allFiles.Count) files."
    } else {
        Write-Output "ERROR: found $($issues.Count) documentation issues."
        foreach ($issue in $issues | Sort-Object type, file, line) {
            $lineSuffix = if ($issue.line -gt 0) { ":$($issue.line)" } else { '' }
            $targetSuffix = if ([string]::IsNullOrWhiteSpace($issue.target)) { '' } else { " -> $($issue.target)" }
            Write-Output ("[{0}] {1}{2} - {3}{4}" -f $issue.type, $issue.file, $lineSuffix, $issue.message, $targetSuffix)
        }
    }
}

if ($issues.Count -gt 0) {
    exit 1
}

exit 0
