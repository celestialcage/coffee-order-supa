# 단체 주문 취합 — 프론트 (Supabase 버전, Phase 1)

```
npm install
cp .env.example .env.local   # Supabase URL / publishable key 입력
npm run dev
```

## 구조
- `src/lib/api.ts` — Supabase 호출은 전부 여기만 (받은 파일 그대로)
- `src/lib/supabase.ts` — 클라이언트 생성
- `src/pages/Home.tsx` — `/` 로그인 / 내 이벤트 목록
- `src/pages/CreateEvent.tsx` — `/events/new` 이벤트 생성 (동명이인 감지·구분값 입력 포함)
- `src/pages/Dashboard.tsx` — `/dashboard/:eventId` 대시보드 (요약 카드 필터, 대리 수정 모달, 마감, PIN 초기화, 미응답 복사, 메뉴별 집계)
- `src/pages/participant/ParticipantFlow.tsx` — `/e/:eventId` 이름 → PIN → 메뉴 → 완료/읽기전용
- `src/components/` — PinInput, OrderFields(참여자 메뉴 화면과 대리 수정 모달이 공유), Modal, RequireAuth

## 메모
- 로그인 후 `/dashboard`로 돌아오면 `/`(내 이벤트 목록)로 다시 보냄. Supabase Redirect URLs에 `{배포주소}/dashboard` 등록 필요
- 배포 시 SPA 라우팅을 위해 모든 경로를 `index.html`로 보내는 설정 필요 (Vercel/Netlify rewrite)
- Phase 2·3 요소(개인 UUID 링크, 전체 대안 전환, 프리셋·저장 슬롯, CSV)는 아직 화면에 없음
