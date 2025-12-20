# AI To-Do 생성기 앱 제작 프롬프트 (구글 AI 스튜디오용)

## 📋 프로젝트 개요
텍스트와 이미지를 AI가 분석하여 자동으로 Microsoft To-Do와 Google Calendar에 작업을 생성하는 웹 애플리케이션을 만들어주세요.

---

## 🛠️ 기술 스택
- **프론트엔드**: React 19 + TypeScript + Vite
- **스타일링**: Tailwind CSS
- **AI 분석**: Google Gemini 2.5 Flash API
- **인증**:
  - Microsoft: MSAL (Microsoft Authentication Library)
  - Google: OAuth 2.0 (Implicit Flow)
- **API 통신**:
  - Microsoft Graph API (To-Do)
  - Google Calendar API
- **아이콘**: Lucide React

---

## 📦 프로젝트 구조

```
todo-ai-app/
├── src/
│   ├── App.tsx                        # 메인 컴포넌트
│   ├── main.tsx                       # 엔트리 포인트
│   ├── types.ts                       # TypeScript 타입 정의
│   ├── components/
│   │   └── TaskCard.tsx              # 개별 작업 카드 컴포넌트
│   └── services/
│       ├── geminiService.ts          # Gemini AI 분석 서비스
│       ├── authService.ts            # Microsoft 인증
│       ├── googleAuthService.ts      # Google 인증
│       ├── todoService.ts            # Microsoft To-Do API
│       └── calendarService.ts        # Google Calendar API
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── .env                              # 환경 변수
```

---

## 🔑 환경 변수 (.env)

```env
VITE_GEMINI_API_KEY=여러개_키를_쉼표로_구분_가능
VITE_MICROSOFT_CLIENT_ID=Azure_AD_클라이언트_ID
VITE_GOOGLE_CLIENT_ID=Google_OAuth_클라이언트_ID
```

---

## 🎯 핵심 기능 요구사항

### 1. AI 분석 시스템 (geminiService.ts)

**Gemini API 설정**:
- 모델: `gemini-2.5-flash`
- 출력 형식: JSON (Structured Output 사용)
- 시스템 지시: Microsoft To-Do 전문 비서

**한국어 태그 시스템** (필수):
모든 작업 제목은 `#필수태그 #추가태그 내용` 형식이어야 함

- **필수 태그** (하나 선택):
  - `#일정`: 특정 시간에 해야 하는 약속/이벤트
  - `#기한`: 마감일이 있는 작업
  - `#작업`: 일반 작업 (마감일 없음)

- **추가 태그**: 내용별 분류 (예: `#회의`, `#보고서`, `#기프티콘`)

**날짜/시간 처리 로직** (중요):
1. **기한(dueDateTime)**:
   - `#일정` + 시간 명시 → 해당 시간으로 설정 (예: "오후 3시" → `15:00:00`)
   - `#기한` 또는 시간 없음 → `23:59:00`으로 설정
   - 기한 미명시 → 오늘 날짜
   - 연도 생략 시 → 현재 연도 기준, **반드시 미래 날짜**
   - 과거 날짜 → 자동으로 다음 해로 조정
   - 예: 2025년 12월에 "1월 2일" 입력 → `2026-01-02T23:59:00`

2. **알림(reminderDateTime)**:
   - 기한 날짜의 오전 7시 30분 고정
   - 예: 기한 `2025-12-25T23:59:00` → 알림 `2025-12-25T07:30:00`

3. **기간이 있는 일정** (매우 중요):
   - "1월 21~23일", "12월 25일~27일" 같은 기간 입력 시
   - **각 날짜별로 개별 항목 생성** (3일이면 3개 항목)
   - 제목은 동일, dueDateTime만 다르게 설정

**기프티콘 자동 인식**:
- 이미지에서 기프티콘/쿠폰 감지
- 제목: `#기한 #기프티콘 [상품명]`
- 기한: 이미지의 유효기간 추출
- 노트: 상품명, 유효기간, 교환처, 바코드 등 모든 정보 기록

**노트(body) 작성 규칙**:
- 원본 내용 그대로 보존 (요약 금지)
- 가독성을 위한 줄바꿈만 추가
- 기프티콘은 모든 텍스트 정보 상세 기록

**API 키 로테이션**:
- 쉼표로 구분된 여러 API 키 지원
- 429 오류(할당량 초과) 시 자동으로 다음 키로 전환
- 라운드 로빈 방식으로 키 순환 사용
- 모든 키 실패 시 적절한 오류 메시지

**재시도 로직**:
- 503 오류(과부하) 시 exponential backoff (1초, 2초, 4초)
- 최대 재시도 횟수: Math.max(API키개수, 3)

### 2. Microsoft To-Do 연동

**인증 (authService.ts)**:
- MSAL PublicClientApplication 싱글톤 패턴
- 스코프: `User.Read`, `Tasks.ReadWrite`
- 리다이렉트 URI: `http://localhost:5173` (개발), Netlify URL (배포)
- 자동 로그인: `loginSilently()` (토큰 캐싱)

**작업 생성 (todoService.ts)**:
- Microsoft Graph API 사용: `/me/todo/lists/{listId}/tasks`
- 순차적 배치 처리 (for-loop, Promise.all 사용 금지)
- 필드 매핑:
  - `title`: 작업 제목
  - `body.content`: HTML 형식으로 변환 (`\n` → `<br>`)
  - `dueDateTime`: timezone `Asia/Seoul`
  - `importance`: low/normal/high
  - `reminderDateTime`: timezone `Asia/Seoul`
  - `categories`: 태그 배열

### 3. Google Calendar 연동

**인증 (googleAuthService.ts)**:
- OAuth 2.0 팝업 방식 (redirect 아님)
- 스코프: `https://www.googleapis.com/auth/calendar`
- 토큰을 localStorage에 저장 (키: `google_access_token`, `google_user_info`)
- 자동 로그인: `loginGoogleSilently()`

**이벤트 생성 (calendarService.ts)**:
- Google Calendar API v3 사용
- **종일 이벤트** 형식:
  ```json
  {
    "summary": "작업 제목",
    "description": "작업 내용",
    "start": { "date": "YYYY-MM-DD", "timeZone": "Asia/Seoul" },
    "end": { "date": "YYYY-MM-DD", "timeZone": "Asia/Seoul" },
    "reminders": {
      "useDefault": false,
      "overrides": [{ "method": "popup", "minutes": 450 }]
    }
  }
  ```
  - `minutes: 450` = 오전 7시 30분 (자정으로부터 7.5시간)
  - `date` 필드 사용 (dateTime 아님)

**태그별 캘린더 자동 선택**:
- `#기프티콘` → "기프티콘" 또는 "gift" 포함 캘린더
- `#일정` → "Ssak" 또는 "일정" 포함 캘린더
- `#기한`, `#작업` → "Tasks" 또는 "작업" 포함 캘린더
- 매칭 실패 시 → "primary" 캘린더 사용

### 4. UI/UX 디자인

**다크모드**:
- 기본값: 활성화 (`useState(true)`)
- Tailwind의 `dark:` 클래스 활용
- 색상 팔레트:
  - 라이트: `bg-slate-50`, `text-slate-900`
  - 다크: `bg-slate-950`, `text-slate-100`

**레이아웃**:
1. **헤더** (sticky):
   - 로고 + 앱 이름
   - 로그인/로그아웃 버튼 (Microsoft, Google 각각)
   - 다크모드 토글

2. **입력 섹션**:
   - 그리드 레이아웃 (텍스트 | 이미지)
   - 텍스트: textarea (min-h-12rem)
   - 이미지: 드래그앤드롭 + 카메라 캡처 + 붙여넣기
   - 이미지 프리뷰 (그리드, 삭제 버튼)
   - 분석 버튼 (Sparkles 아이콘, 로딩 중 Loader2 애니메이션)

3. **작업 목록**:
   - TaskCard 컴포넌트로 표시
   - To-Do 목록 선택 드롭다운 (Microsoft)
   - 캘린더 선택 드롭다운 (Google)
   - 전송 버튼 (Send 아이콘, 로딩 상태)

**TaskCard 컴포넌트**:
- 태그 배지 (색상 구분)
- 제목 (태그 제외한 순수 내용)
- 날짜/시간 표시 (format: "M월 d일 (E) a h:mm")
- 중요도 아이콘 (high일 때만)
- 삭제 버튼 (X 아이콘)

### 5. 듀얼 서비스 통합 (App.tsx)

**인증 상태 관리**:
```typescript
interface AuthState {
  isAuthenticated: boolean;           // 하나라도 인증되면 true
  isMicrosoftAuthenticated: boolean;
  isGoogleAuthenticated: boolean;
  userName?: string;
  userEmail?: string;
  googleUserName?: string;
  googleUserEmail?: string;
}
```

**병렬 전송 로직** (`handleSendToBoth`):
1. 검증:
   - 최소 하나의 서비스 인증 필요
   - Microsoft 인증 시 목록 선택 필수
   - 작업 개수 > 0

2. Microsoft와 Google에 동시 전송:
   ```typescript
   const promises: Promise<any[]>[] = [];

   if (isMicrosoftAuthenticated && selectedListId) {
     promises.push(createTasksInBatch(selectedListId, taskDetails));
   }

   if (isGoogleAuthenticated) {
     // 태그별로 작업 그룹화
     const tasksByCalendar = groupByTag(taskDetails);
     const calendarPromises = tasksByCalendar.map(
       ([calendarId, tasks]) => createEventsInBatch(tasks, calendarId)
     );
     promises.push(Promise.all(calendarPromises).then(results => results.flat()));
   }

   const results = await Promise.allSettled(promises);
   ```

3. 결과 처리:
   - 서비스별 성공/실패 카운트
   - 사용자 피드백: "Microsoft: 3/3, Google: 3/3 성공"
   - 모두 성공 시 작업 목록 비우기
   - 부분 실패 시 실패한 작업만 유지

**자동 로그인** (useEffect):
- 앱 마운트 시 두 서비스 동시 시도
- `loginSilently()`, `loginGoogleSilently()` 병렬 실행
- 하나라도 성공하면 `isAuthenticated = true`

---

## 📝 TypeScript 타입 정의 (types.ts)

```typescript
export interface TaskDetails {
  title: string;
  body: string;
  dueDateTime?: string;        // ISO 8601
  importance: 'low' | 'normal' | 'high';
  reminderDateTime?: string;   // ISO 8601
  categories?: string[];
}

export interface AnalyzedTask extends TaskDetails {
  id: string;
  createdAt: number;
  extractedInfo: {
    sender?: string;
    receivedDateTime?: string;
    location?: string;
    attendees?: string[];
    attachmentNames?: string[];
  };
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface AuthState {
  isAuthenticated: boolean;
  isMicrosoftAuthenticated: boolean;
  isGoogleAuthenticated: boolean;
  userName?: string;
  userEmail?: string;
  googleUserName?: string;
  googleUserEmail?: string;
}
```

---

## 🎨 디자인 원칙

1. **미니멀리즘**: 불필요한 요소 제거, 깔끔한 인터페이스
2. **일관성**: 모든 버튼, 입력 필드에 동일한 스타일 적용
3. **반응형**: 모바일/데스크톱 모두 지원 (grid 자동 조정)
4. **애니메이션**: 로딩, 호버, 전환 효과 부드럽게
5. **접근성**: aria-label, title 속성 활용

**색상 테마**:
- 주요 액션: `slate-900` (라이트) / `slate-100` (다크)
- 보조 액션: `slate-400` / `slate-600`
- 경고/오류: `red-500` / `red-400`
- Microsoft: `blue-600` / `blue-500`
- Google: `red-600` / `red-500`

**간격/크기**:
- 여백: `p-3`, `gap-3` (기본)
- 아이콘: `w-4 h-4` (버튼), `w-5 h-5` (헤더)
- 텍스트: `text-sm` (기본), `text-xs` (라벨)
- 둥근 모서리: `rounded-lg`

---

## 🚀 개발 명령어

```bash
# 개발 서버 시작
npm run dev          # http://localhost:5173

# 프로덕션 빌드
npm run build        # dist/ 폴더 생성

# 빌드 미리보기
npm run preview
```

---

## 🔧 주요 구현 사항

### Gemini Service 스키마

```typescript
const taskItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "..." },
    body: { type: Type.STRING, description: "..." },
    dueDateTime: { type: Type.STRING, description: "..." },
    importance: { type: Type.STRING, enum: ["low", "normal", "high"] },
    reminderDateTime: { type: Type.STRING, description: "..." },
    categories: { type: Type.ARRAY, items: { type: Type.STRING } },
    // 추가 필드들...
  },
  required: ["title", "body", "importance"]
};
```

### Gemini API 호출 구조

```typescript
const response = await aiInstance.models.generateContent({
  model: "gemini-2.5-flash",
  contents: { parts: [이미지들, 텍스트프롬프트] },
  config: {
    responseMimeType: "application/json",
    responseSchema: { type: Type.ARRAY, items: taskItemSchema },
    systemInstruction: "당신은 Microsoft To-Do 전문 비서입니다..."
  }
});
```

### MSAL 설정

```typescript
const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID,
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin
  },
  cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false }
};
```

### Google OAuth 팝업

```typescript
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?
  client_id=${clientId}
  &redirect_uri=${redirectUri}
  &response_type=token
  &scope=${encodeURIComponent(scope)}
  &include_granted_scopes=true
  &state=...`;

const popup = window.open(authUrl, "Google Login", "width=500,height=600");
// 팝업에서 리다이렉트 URL 감지 → 토큰 추출
```

---

## ⚠️ 중요 주의사항

1. **날짜 계산**:
   - 항상 `Asia/Seoul` 타임존 사용
   - 미래 날짜 보장 로직 필수
   - 연도 롤오버 처리 (12월에 1월 입력 시)

2. **배치 처리**:
   - Microsoft/Google 모두 순차 처리 (for-loop)
   - `Promise.all()` 사용하지 말 것
   - API 속도 제한 고려

3. **오류 처리**:
   - 429, 503 오류에 대한 특별 처리
   - 사용자에게 명확한 오류 메시지
   - 재시도 로직 구현

4. **보안**:
   - API 키는 환경 변수로 관리
   - 토큰은 localStorage에 안전하게 저장
   - CORS 설정 확인

5. **성능**:
   - 이미지는 base64로 변환 후 전송
   - API 응답 캐싱 고려
   - 불필요한 re-render 방지

---

## 📚 참고 문서

- [Google Gemini API](https://ai.google.dev/docs)
- [Microsoft Graph API - To-Do](https://learn.microsoft.com/graph/api/resources/todo-overview)
- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [MSAL.js](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/)

---

## 🎯 최종 체크리스트

- [ ] 텍스트/이미지 분석 정상 작동
- [ ] 한국어 태그 시스템 완벽 구현 (#필수태그 #추가태그)
- [ ] 날짜/시간 계산 정확성 (미래 날짜, 연도 롤오버)
- [ ] 기프티콘 자동 인식 및 유효기간 추출
- [ ] 기간 일정 개별 항목 생성 (예: 3일 → 3개 항목)
- [ ] Microsoft To-Do 전송 성공
- [ ] Google Calendar 전송 성공 (종일 이벤트, 7:30 알림)
- [ ] 태그별 캘린더 자동 선택
- [ ] 듀얼 인증 (Microsoft + Google 동시 지원)
- [ ] 자동 로그인 (토큰 캐싱)
- [ ] API 키 로테이션 (429 오류 처리)
- [ ] 다크모드 정상 작동
- [ ] 반응형 디자인 (모바일/데스크톱)
- [ ] 오류 처리 및 사용자 피드백
- [ ] 성능 최적화 (로딩 상태, 애니메이션)

---

## 💡 추가 기능 아이디어 (선택)

- 작업 편집 기능
- 로컬 저장소에 분석 기록 보관
- 음성 입력 지원
- PDF 파일 분석
- 다국어 지원 (영어, 일본어 등)
- 통계 대시보드 (일일/주간 작업 현황)
- 캘린더 뷰 (월간, 주간)
- 작업 우선순위 자동 분류

---

이 프롬프트를 구글 AI 스튜디오에 입력하면, 위 요구사항을 모두 충족하는 완전한 AI To-Do 생성기 앱을 만들 수 있습니다. 각 섹션은 독립적으로 구현 가능하도록 모듈화되어 있으며, 모든 핵심 로직과 예외 처리가 포함되어 있습니다.
