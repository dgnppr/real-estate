# 내집마련 계산기 — 서버 관리
#   make start     빌드 후 백그라운드 실행 (PORT=3000)
#   make stop      종료
#   make restart   최신 코드로 다시 빌드·실행
#   make status    실행 여부
#   make logs      로그 보기 (Ctrl+C 로 나옴)
#   make dev       개발 모드 (수정 즉시 반영, 이 터미널에서 실행)
#   make batch     감시 배치 1회 실행
#   make open      브라우저 열기

PORT ?= 3000
PID  := data/server.pid
LOG  := data/server.log

.PHONY: help start stop restart status logs dev build batch open install

help:
	@sed -n '2,10p' Makefile | sed 's/^# //'

install:
	@[ -d node_modules ] || npm install

build: install
	@mkdir -p data; echo "▶ 빌드 중…"
	@npx next build > data/build.log 2>&1 || (tail -30 data/build.log; exit 1)
	@echo "✓ 빌드 완료"

start: stop build
	@mkdir -p data
	@nohup npx next start -p $(PORT) > $(LOG) 2>&1 & echo $$! > $(PID)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do \
		curl -s -o /dev/null http://localhost:$(PORT)/api/profile && break; sleep 1; done
	@curl -s -o /dev/null http://localhost:$(PORT)/api/profile \
		&& echo "✓ 실행 중 → http://localhost:$(PORT)  (로그: make logs)" \
		|| (echo "✗ 시작 실패. 로그:"; tail -20 $(LOG); exit 1)

stop:
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		pkill -P $$(cat $(PID)) 2>/dev/null; kill $$(cat $(PID)) 2>/dev/null; echo "■ 종료 (pid $$(cat $(PID)))"; fi
	@rm -f $(PID)
	@# 다른 방법으로 띄운 서버가 같은 포트를 쓰고 있으면 함께 종료
	@P=$$(lsof -ti tcp:$(PORT) -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$P" ]; then kill $$P 2>/dev/null; echo "■ 포트 $(PORT) 사용 중이던 프로세스 종료 ($$P)"; fi; true
	@sleep 1

restart: start

status:
	@P=$$(lsof -ti tcp:$(PORT) -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$P" ]; then echo "● 실행 중 → http://localhost:$(PORT) (pid $$P)"; else echo "○ 꺼져 있음  (make start)"; fi

logs:
	@touch $(LOG); tail -f $(LOG)

dev: stop install
	npx next dev -p $(PORT)

batch: install
	@npm run --silent batch

open:
	@open http://localhost:$(PORT)
