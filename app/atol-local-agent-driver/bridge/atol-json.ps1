param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# LIBFPTR_PARAM_JSON_DATA = 65645
$LIBFPTR_PARAM_JSON_DATA = 65645

function Write-ResultAndExit {
    param(
        [object]$Object,
        [int]$Code = 0
    )

    $json = $Object | ConvertTo-Json -Depth 100 -Compress
    [Console]::WriteLine($json)
    exit $Code
}

function Get-EnvValue {
    param(
        [string]$Name,
        [string]$DefaultValue = ""
    )

    $value = [Environment]::GetEnvironmentVariable($Name)

    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
}

function Get-BoolSafe {
    param(
        [object]$Value
    )

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [bool]) {
        return [bool]$Value
    }

    $text = [string]$Value

    if ($text.ToLower() -eq "true") {
        return $true
    }

    if ($text.ToLower() -eq "false") {
        return $false
    }

    return $null
}

function Get-MarkingValidationDecision {
    param(
        [object]$Status
    )

    if ($null -eq $Status) {
        return @{
            markingStatus = "M"
            canSell = $false
            message = "Проверка КМ не завершена: ККТ не вернула статус проверки"
        }
    }

    $ready = Get-BoolSafe $Status.ready
    $sentImcRequest = Get-BoolSafe $Status.sentImcRequest

    $onlineValidation = $Status.onlineValidation
    $itemInfo = $null
    $operatorResponse = $null
    $operatorResult = $null

    if ($null -ne $onlineValidation) {
        $itemInfo = $onlineValidation.itemInfoCheckResult
        $operatorResponse = $onlineValidation.markOperatorResponse
        $operatorResult = $onlineValidation.markOperatorResponseResult
    }

    $imcCheckFlag = $null
    $imcCheckResult = $null
    $imcEstimatedStatusCorrect = $null
    $imcStatusInfo = $null
    $responseStatus = $null
    $itemStatusCheck = $null

    if ($null -ne $itemInfo) {
        $imcCheckFlag = Get-BoolSafe $itemInfo.imcCheckFlag
        $imcCheckResult = Get-BoolSafe $itemInfo.imcCheckResult
        $imcEstimatedStatusCorrect = Get-BoolSafe $itemInfo.imcEstimatedStatusCorrect
        $imcStatusInfo = Get-BoolSafe $itemInfo.imcStatusInfo
    }

    if ($null -ne $operatorResponse) {
        $responseStatus = Get-BoolSafe $operatorResponse.responseStatus
        $itemStatusCheck = Get-BoolSafe $operatorResponse.itemStatusCheck
    }

    $positive = (
    $ready -eq $true -and
            $sentImcRequest -eq $true -and
            $imcCheckFlag -eq $true -and
            $imcCheckResult -eq $true -and
            $imcEstimatedStatusCorrect -eq $true -and
            $imcStatusInfo -eq $true -and
            $responseStatus -eq $true -and
            $itemStatusCheck -eq $true
    )

    if ($positive) {
        return @{
            markingStatus = "M+"
            canSell = $true
            message = "Код маркировки проверен успешно [M+]"
        }
    }

    $hasNegativeResult = (
    ([string]$operatorResult).ToLower() -eq "unrecognized" -or
            $imcCheckResult -eq $false -or
            $imcEstimatedStatusCorrect -eq $false -or
            $responseStatus -eq $false -or
            $itemStatusCheck -eq $false
    )

    if ($ready -eq $true -and $sentImcRequest -eq $true -and $hasNegativeResult) {
        return @{
            markingStatus = "M-"
            canSell = $false
            message = "Код маркировки не прошёл проверку [M-]. Продажа заблокирована."
        }
    }

    return @{
        markingStatus = "M"
        canSell = $false
        message = "Проверка КМ не дала положительный результат [M+]. Продажа заблокирована."
    }
}

$fptr = $null
$lastMarkingStatus = $null

try {
    $rawInput = Get-Content -Path $InputFile -Raw -Encoding UTF8
    $payload = $rawInput | ConvertFrom-Json

    $commands = @()

    if ($null -ne $payload.commands) {
        $commands = @($payload.commands)
    }
    elseif ($null -ne $payload.command) {
        $commands = @($payload.command)
    }
    else {
        $commands = @($payload)
    }

    if ($commands.Count -eq 0) {
        Write-ResultAndExit @{
            ok = $false
            message = "Не переданы JSON-команды для АТОЛ"
        } 2
    }

    $fptr = New-Object -ComObject "AddIn.Fptr10"

    $useSavedSettings = (Get-EnvValue "ATOL_DRIVER_USE_SAVED_SETTINGS" "true").ToLower()

    if ($useSavedSettings -ne "true") {
        $port = (Get-EnvValue "ATOL_DRIVER_PORT" "USB").ToUpper()

        if ($port -eq "USB") {
            $fptr.setSingleSetting([string]$fptr.LIBFPTR_SETTING_PORT, [string]$fptr.LIBFPTR_PORT_USB)
        }
        elseif ($port -eq "COM") {
            $comFile = Get-EnvValue "ATOL_DRIVER_COM_FILE" "COM3"

            $fptr.setSingleSetting([string]$fptr.LIBFPTR_SETTING_PORT, [string]$fptr.LIBFPTR_PORT_COM)
            $fptr.setSingleSetting([string]$fptr.LIBFPTR_SETTING_COM_FILE, [string]$comFile)
        }
        elseif ($port -eq "TCPIP") {
            $ipAddress = Get-EnvValue "ATOL_DRIVER_IP_ADDRESS" "127.0.0.1"
            $ipPort = Get-EnvValue "ATOL_DRIVER_IP_PORT" "5555"

            $fptr.setSingleSetting([string]$fptr.LIBFPTR_SETTING_PORT, [string]$fptr.LIBFPTR_PORT_TCPIP)
            $fptr.setSingleSetting([string]$fptr.LIBFPTR_SETTING_IPADDRESS, [string]$ipAddress)
            $fptr.setSingleSetting([string]$fptr.LIBFPTR_SETTING_IPPORT, [string]$ipPort)
        }

        $fptr.applySingleSettings()
    }

    $fptr.open()

    $openErrorCode = [int]$fptr.errorCode()

    if ($openErrorCode -ne 0) {
        Write-ResultAndExit @{
            ok = $false
            message = $fptr.errorDescription()
            errorCode = $openErrorCode
            stage = "open"
        } 3
    }

    $results = @()

    foreach ($command in $commands) {
        if ([string]$command.type -eq "__sleep") {
            $ms = 1000

            if ($null -ne $command.ms) {
                $ms = [int]$command.ms
            }

            Start-Sleep -Milliseconds $ms

            $results += @{
                ok = $true
                commandType = "__sleep"
                command = $command
                errorCode = 0
                errorDescription = "Ошибок нет"
                rawText = ""
                result = @{
                    sleptMs = $ms
                }
            }

            continue
        }

        if ([string]$command.type -eq "__assertMarkingPositive") {
            $decision = Get-MarkingValidationDecision $lastMarkingStatus
            $isOk = [bool]$decision.canSell

            $results += @{
                ok = $isOk
                commandType = "__assertMarkingPositive"
                command = $command
                errorCode = $(if ($isOk) { 0 } else { 9101 })
                errorDescription = $decision.message
                rawText = ""
                result = @{
                    markingStatus = $decision.markingStatus
                    canSell = $decision.canSell
                    message = $decision.message
                    status = $lastMarkingStatus
                }
            }

            if (-not $isOk) {
                break
            }

            continue
        }

        $commandJson = $command | ConvertTo-Json -Depth 100 -Compress

        $resultText = $null
        $resultObject = $null
        $errorCode = 0
        $errorDescription = ""

        try {
            $fptr.setParam($LIBFPTR_PARAM_JSON_DATA, [string]$commandJson)
            $fptr.processJson()

            $errorCode = [int]$fptr.errorCode()
            $errorDescription = $fptr.errorDescription()

            try {
                $resultText = $fptr.getParamString($LIBFPTR_PARAM_JSON_DATA)
            }
            catch {
                $resultText = ""
            }

            if (![string]::IsNullOrWhiteSpace($resultText)) {
                try {
                    $resultObject = $resultText | ConvertFrom-Json
                }
                catch {
                    $resultObject = $null
                }
            }

            if ([string]$command.type -eq "getMarkingCodeValidationStatus" -and $null -ne $resultObject) {
                $lastMarkingStatus = $resultObject
            }

            $results += @{
                ok = ($errorCode -eq 0)
                commandType = $command.type
                command = $command
                errorCode = $errorCode
                errorDescription = $errorDescription
                rawText = $resultText
                result = $resultObject
            }
        }
        catch {
            $errorCode = [int]$fptr.errorCode()
            $errorDescription = $fptr.errorDescription()

            $results += @{
                ok = $false
                commandType = $command.type
                command = $command
                errorCode = $errorCode
                errorDescription = $errorDescription
                message = $_.Exception.Message
                rawText = $resultText
            }
        }
    }

    $fptr.close()

    Write-ResultAndExit @{
        ok = $true
        transport = "AddIn.Fptr10"
        jsonParam = $LIBFPTR_PARAM_JSON_DATA
        results = $results
    } 0
}
catch {
    Write-ResultAndExit @{
        ok = $false
        message = $_.Exception.Message
        stage = "fatal"
    } 1
}
finally {
    if ($null -ne $fptr) {
        try { $fptr.close() | Out-Null } catch {}
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($fptr) | Out-Null } catch {}
    }
}
