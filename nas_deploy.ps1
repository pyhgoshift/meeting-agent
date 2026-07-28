# NAS DSM API를 통해 배포 스크립트 실행
# 1. QuickConnect 실제 주소 조회
# 2. API 로그인 (sid 획득)
# 3. Task Scheduler 작업 실행

# SSL 인증서 무시
Add-Type -TypeDefinition @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) {
        return true;
    }
}
"@
[System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$QC_ID = "freudpark"
$USER = "freudpark"
$PASS = "!!0i0i0iYH"

Write-Host "🔍 NAS 주소 조회 중..."

# QuickConnect 서버 정보 조회
$body = @{
    version = 1
    command = "get_server_info"
    stop_when_error = $false
    stop_when_success = $false
    id = $QC_ID
    serverID = $QC_ID
    additional = @("is_connected","is_online","external","internal")
} | ConvertTo-Json

try {
    $qcResp = Invoke-RestMethod -Uri "https://global.quickconnect.to/Serv.php" -Method Post -Body $body -ContentType "application/json"
    Write-Host "QuickConnect 응답:" ($qcResp | ConvertTo-Json -Depth 3)
    
    # 외부 IP 추출 시도
    if ($qcResp.server -and $qcResp.server.external) {
        $extIP = $qcResp.server.external.ip
        $extPort = $qcResp.server.external.port
        $DSM_URL = "https://${extIP}:${extPort}"
        Write-Host "✅ 외부 접속 주소: $DSM_URL"
    }
} catch {
    Write-Host "QuickConnect 조회 실패: $_"
    # QuickConnect URL 직접 사용
    $DSM_URL = "https://freudpark.tw5.quickconnect.to"
    Write-Host "QuickConnect URL 직접 사용: $DSM_URL"
}

Write-Host ""
Write-Host "🔑 DSM 로그인 시도: $DSM_URL"

# DSM API 로그인
$loginUrl = "$DSM_URL/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=login&account=$USER&passwd=$([uri]::EscapeDataString($PASS))&session=meeting&format=sid&enable_device_token=yes"

try {
    $loginResp = Invoke-RestMethod -Uri $loginUrl -Method Get
    Write-Host "로그인 응답:" ($loginResp | ConvertTo-Json -Depth 3)
    
    if ($loginResp.success -eq $true) {
        $SID = $loginResp.data.sid
        Write-Host "✅ 로그인 성공! SID: $SID"
    } else {
        $errCode = $loginResp.error.code
        Write-Host "❌ 로그인 실패. 오류 코드: $errCode"
        if ($errCode -eq 403) { Write-Host "   → 2FA 필요" }
    }
} catch {
    Write-Host "❌ API 호출 실패: $_"
}
