#!/bin/bash
# ============================================================
# Meeting Agent — NAS 배포 스크립트
# 사용법: bash deploy.sh
# 실행 위치: NAS SSH 접속 후 어디서든 실행 가능
# ============================================================

set -e

REPO_URL="https://github.com/pyhgoshift/meeting-agent.git"
DEPLOY_DIR="/volume1/docker/meeting-agent"
RECORDING_DIR="/volume1/homes/freudpark/recording"

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
# 기존 컨테이너 정리
docker stop meeting-agent 2>/dev/null || true
docker rm meeting-agent 2>/dev/null || true

# 새 컨테이너 실행
docker run -d \
  --name meeting-agent \
  --restart always \
  --network host \
  -v "$RECORDING_DIR":/recordings \
  --env-file "$DEPLOY_DIR/.env" \
  meeting-agent:latest

echo ""
echo "✅ 배포 완료!"
echo "────────────────────────────────────"
echo "📋 로그 확인: docker logs -f meeting-agent"
echo "⏹️  중지:     docker stop meeting-agent"
echo "🔄 업데이트:  bash $DEPLOY_DIR/deploy.sh"
