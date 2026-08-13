#!/bin/bash
# 슬랙 정리 단축 실행기.
#
# cleanup-slack.mjs 는 컨테이너 안에서 돌려야 한다(시놀로지에는 node 가 없고,
# 스크립트도 이미지에 들어있지 않아 /app/config 마운트를 통해 닿는다).
# 그 긴 명령을 매번 치지 않도록 감싼 것이다.
#
# 사용법:
#   sudo /volume1/docker/meeting-agent/scripts/slack-clean.sh "통화 녹음"
#   sudo /volume1/docker/meeting-agent/scripts/slack-clean.sh "통화 녹음" --delete
#
# ~/.profile 에 아래를 넣어두면 어디서든 slack-clean 으로 부를 수 있다:
#   alias slack-clean='sudo /volume1/docker/meeting-agent/scripts/slack-clean.sh'

set -euo pipefail

CONTAINER=meeting-agent
SCRIPT=/app/config/scripts/cleanup-slack.mjs

if [ $# -eq 0 ]; then
  echo "사용법: $(basename "$0") \"찾을문구\" [--delete]"
  echo ""
  echo "예시:"
  echo "  $(basename "$0") \"통화 녹음\"              ← 목록만 확인 (안 지움)"
  echo "  $(basename "$0") \"통화 녹음\" --delete     ← 실제 삭제"
  echo "  $(basename "$0") \"회의록\"                 ← 봇이 올린 회의록 전체"
  exit 1
fi

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
  echo "❌ '$CONTAINER' 컨테이너가 실행 중이 아닙니다."
  echo "   작업 스케줄러에서 배포를 먼저 실행하세요."
  exit 1
fi

exec docker exec "$CONTAINER" node "$SCRIPT" "$@"
