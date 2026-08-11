#!/bin/bash
# ============================================================
# Meeting Agent — NAS 배포 스크립트
# 사용법: bash deploy.sh
# 실행 위치: NAS SSH 접속 후 어디서든 실행 가능
# ============================================================

set -e

REPO_URL="https://github.com/pyhgoshift/meeting-agent.git"
DEPLOY_DIR="/volume1/docker/meeting-agent"
RECORDING_DIR="/volume1/homes/freudpark/recording/Voice Recorder"

echo "🚀 Meeting Agent 배포 시작"
echo "────────────────────────────────────"

# 1. 배포 디렉토리 생성
echo "[1/5] 디렉토리 준비..."
mkdir -p "$DEPLOY_DIR"
mkdir -p "$RECORDING_DIR"

# 2. 코드 가져오기
echo "[2/5] 코드 다운로드..."
if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "      기존 레포 업데이트 (git fetch & reset)"
  cd "$DEPLOY_DIR" && git fetch --all && git reset --hard origin/master
else
  echo "      신규 클론"
  git clone "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

# 3. .env 파일 확인 및 마이그레이션
echo "[3/5] 환경변수 확인 및 마이그레이션..."
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "⚠️  .env 파일이 없습니다!"
  echo "   아래 명령어로 생성하세요:"
  echo "   cp $DEPLOY_DIR/.env.example $DEPLOY_DIR/.env"
  echo "   vi $DEPLOY_DIR/.env  (API 키 입력)"
  exit 1
fi

# 구형 모델명 자동 마이그레이션
if grep -q "deepseek-ai/deepseek-v4-pro" "$DEPLOY_DIR/.env"; then
  echo "⚠️  구형 모델(deepseek-v4-pro) 감지됨. meta/llama-3.3-70b-instruct로 자동 마이그레이션합니다."
  sed -i 's/deepseek-ai\/deepseek-v4-pro/meta\/llama-3.3-70b-instruct/g' "$DEPLOY_DIR/.env"
fi
echo "      .env 확인 및 마이그레이션 완료"

# 4. Docker 이미지 빌드
echo "[4/5] Docker 이미지 빌드 (3~5분 소요)..."
cd "$DEPLOY_DIR"
docker build -t meeting-agent:latest .
echo "      빌드 완료"

# 5. 컨테이너 실행
echo "[5/5] 컨테이너 시작..."
# 전용 네트워크 준비 (meeting-agent와 cloudflared가 내부 통신)
docker network create meeting-net 2>/dev/null || true

# 기존 컨테이너 정리
docker stop meeting-agent meeting-agent-tunnel 2>/dev/null || true
docker rm meeting-agent meeting-agent-tunnel 2>/dev/null || true

# 새 컨테이너 실행 (포트 미공개 — 외부 접근은 Cloudflare Tunnel 경유만 허용)
docker run -d \
  --name meeting-agent \
  --restart always \
  --network meeting-net \
  -v "$RECORDING_DIR":/recordings \
  --env-file "$DEPLOY_DIR/.env" \
  meeting-agent:latest

# Cloudflare Tunnel 커넥터 실행 (meeting.pyhgoshift.com → meeting-agent:3000)
# sed를 쓰는 이유: grep은 매치 실패 시 exit 1을 내고, set -e 환경에서 대입문의
# 명령치환 실패는 스크립트를 그 자리에서 죽인다(아래 경고문이 영영 안 찍힘).
# tr은 윈도우에서 .env를 편집했을 때 붙는 CR과 따옴표/공백을 제거한다.
TUNNEL_TOKEN="$(sed -n 's/^CLOUDFLARE_TUNNEL_TOKEN=//p' "$DEPLOY_DIR/.env" | tail -n1 | tr -d "\r\"' ")"
if [ -n "$TUNNEL_TOKEN" ]; then
  docker run -d \
    --name meeting-agent-tunnel \
    --restart always \
    --network meeting-net \
    cloudflare/cloudflared:latest tunnel --no-autoupdate run --token "$TUNNEL_TOKEN"
  echo "      Cloudflare Tunnel 커넥터 시작됨"
else
  echo "⚠️  CLOUDFLARE_TUNNEL_TOKEN이 .env에 없습니다. 대시보드 외부 접속 불가."
  echo "   Cloudflare Zero Trust → 네트워크 → 커넥터 → meeting-agent 터널에서 토큰을 복사해"
  echo "   .env에 CLOUDFLARE_TUNNEL_TOKEN=<토큰> 을 추가한 뒤 재배포하세요."
fi

echo ""
echo "✅ 배포 완료!"
echo "────────────────────────────────────"
echo "🌐 대시보드:  https://meeting.pyhgoshift.com (Cloudflare Access 이메일 인증)"
echo "📋 로그 확인: docker logs -f meeting-agent"
echo "📋 터널 로그: docker logs -f meeting-agent-tunnel"
echo "⏹️  중지:     docker stop meeting-agent meeting-agent-tunnel"
echo "🔄 업데이트:  bash $DEPLOY_DIR/deploy.sh"
