#!/bin/bash
cd /workspace/bot
set -a
source /workspace/bot/.env
set +a
while true; do
  echo "gateway start $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /tmp/tybot-gateway.log
  node src/gateway.js >> /tmp/tybot-gateway.log 2>&1
  echo "gateway exit $? $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /tmp/tybot-gateway.log
  sleep 5
done
