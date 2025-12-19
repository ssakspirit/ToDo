# AI To-Do 생성기

사진이나 텍스트를 업로드하면 AI가 자동으로 할 일(To-Do)을 추출하여 Microsoft To Do 앱과 Google Calendar에 자동으로 추가해주는 웹 애플리케이션입니다.

## 주요 기능

- **AI 기반 텍스트/이미지 분석**: Google Gemini AI를 사용하여 카카오톡 캡처, 메모, 이미지에서 할 일을 자동으로 추출
- **다중 이미지 처리**: 여러 장의 이미지를 한 번에 업로드하여 일괄 분석
- **이중 서비스 연동**: 추출된 할 일을 Microsoft To Do 앱과 Google Calendar에 동시 자동 추가
- **Google Calendar 종일 이벤트**: 기한 날짜에 종일 이벤트로 생성, 오전 7:30 자동 알림
- **다크 모드 지원**: 라이트/다크 테마 자동 전환
- **반응형 디자인**: 모바일, 태블릿, 데스크톱 모든 환경 지원

## 시작하기

### 사전 요구사항

- Node.js 18 이상
- Google Gemini API 키
- Microsoft Azure AD 앱 등록 (Client ID)
- Google Cloud OAuth 클라이언트 ID

### 1. Google Gemini API 키 발급

1. [Google AI Studio](https://makersuite.google.com/app/apikey)에 접속
2. "Create API Key" 클릭하여 API 키 발급
3. 발급받은 API 키를 메모

### 2. Microsoft Azure AD 앱 등록

1. [Azure Portal](https://portal.azure.com)에 접속
2. "Azure Active Directory" → "앱 등록" → "새 등록" 클릭
3. 앱 이름 입력 (예: "AI To-Do Generator")
4. "지원되는 계정 유형"에서 "모든 조직 디렉터리의 계정 및 개인 Microsoft 계정" 선택
5. "리디렉션 URI"에 `http://localhost:5173` 입력 (개발 환경)
6. "등록" 클릭
7. "개요" 페이지에서 **애플리케이션(클라이언트) ID** 복사

#### API 권한 설정

1. 좌측 메뉴에서 "API 권한" 클릭
2. "권한 추가" → "Microsoft Graph" → "위임된 권한" 선택
3. 다음 권한 추가:
   - `User.Read`
   - `Tasks.ReadWrite`
4. "관리자 동의 허용" 클릭 (선택사항)

### 3. Google Cloud OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com)에 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
   - 프로젝트 이름: `todo-ai-app` (원하는 이름)
3. **API 및 서비스** → **라이브러리**
   - "Google Calendar API" 검색
   - **사용 설정** 클릭
4. **API 및 서비스** → **OAuth 동의 화면**
   - 사용자 유형: **외부** 선택
   - 앱 이름: `To-Do AI App`
   - 사용자 지원 이메일: 본인 이메일 선택
   - 개발자 연락처 정보: 본인 이메일 입력
   - **저장 후 계속** 클릭
5. **범위 추가**
   - **범위 추가 또는 삭제** 클릭
   - `https://www.googleapis.com/auth/calendar` 선택
   - **업데이트** → **저장 후 계속**
6. **테스트 사용자** (선택사항)
   - **+ ADD USERS** 클릭하여 본인 Gmail 주소 추가
7. **API 및 서비스** → **사용자 인증 정보**
   - **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID** 선택
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: `To-Do Web Client`
   - **승인된 JavaScript 원본**:
     - `http://localhost:5173` (개발 환경)
     - `https://your-domain.com` (배포 도메인)
   - **승인된 리디렉션 URI**:
     - `http://localhost:5173`
     - `https://your-domain.com`
   - **만들기** 클릭
8. **클라이언트 ID** 복사 (형식: `xxxxx.apps.googleusercontent.com`)

### 4. 설치 및 실행

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
```

`.env` 파일을 열어 다음 값을 입력:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

```bash
# 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### 5. 빌드 및 배포

#### 로컬 빌드

```bash
# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

#### Netlify 배포

##### 1️⃣ GitHub 연동 (최초 1회)

1. [Netlify](https://app.netlify.com)에 로그인
2. **Add new site** → **Import an existing project**
3. **Deploy with GitHub** 선택
4. 리포지토리 선택 (예: `ssakspirit/ToDo`)
5. 빌드 설정 확인:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. **Deploy site** 클릭

##### 2️⃣ 환경 변수 설정 (필수)

GitHub 연동 후 또는 기존 사이트에서:

1. Netlify 사이트 선택
2. **Site configuration** 클릭
3. 좌측 **Environment variables** 클릭
4. **Add a variable** 버튼 클릭하여 다음 3개 추가:

**변수 1:**
```
Key: VITE_GEMINI_API_KEY
Value: (Google Gemini API 키)
Scopes: Production
```

**변수 2:**
```
Key: VITE_MICROSOFT_CLIENT_ID
Value: (Azure AD 클라이언트 ID)
Scopes: Production
```

**변수 3:**
```
Key: VITE_GOOGLE_CLIENT_ID
Value: (Google OAuth 클라이언트 ID)
Scopes: Production
```

5. 각 변수 추가 후 **Create variable** 클릭
6. 환경 변수 추가 시 **자동 재배포** 시작

##### 3️⃣ 배포 상태 확인

1. **Deploys** 탭으로 이동
2. 배포 상태 확인:
   - **Building** → 빌드 중
   - **Published** → 배포 완료 ✅
   - **Failed** → 실패 (로그 확인)

##### 4️⃣ 수동 재배포 (필요시)

**방법 A: Netlify 웹**
1. **Deploys** 탭
2. **Trigger deploy** → **Deploy site**

**방법 B: Git Push**
```bash
# 빈 커밋으로 재배포 트리거
git commit --allow-empty -m "chore: trigger Netlify redeploy"
git push
```

**방법 C: Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

##### 5️⃣ OAuth 리디렉션 URI 업데이트

배포된 도메인 (예: `https://todo.stevecoding.kr`)을 OAuth 설정에 추가:

**Microsoft Azure AD:**
1. [Azure Portal](https://portal.azure.com) → 앱 등록
2. **인증** → **플랫폼 구성** → **웹**
3. 리디렉션 URI에 추가:
   ```
   https://your-domain.com
   ```
4. **저장**

**Google Cloud Console:**
1. [Google Cloud Console](https://console.cloud.google.com)
2. **API 및 서비스** → **사용자 인증 정보**
3. OAuth 클라이언트 ID 클릭
4. **승인된 JavaScript 원본**에 추가:
   ```
   https://your-domain.com
   ```
5. **승인된 리디렉션 URI**에 추가:
   ```
   https://your-domain.com
   ```
6. **저장**

##### 6️⃣ 배포 완료 확인

1. 배포된 사이트 접속 (예: `https://todo.stevecoding.kr`)
2. 로그인 아이콘 2개 확인 (Microsoft, Google)
3. 각 서비스 로그인 테스트
4. 할 일 전송 테스트 (To Do + Calendar)

## 📖 상세 사용 방법

### 1️⃣ 계정 로그인

#### Microsoft 계정 로그인 (To Do 앱 연동)
1. 우측 상단의 **파란색 로그인 아이콘** 클릭
2. Microsoft 계정 선택 또는 로그인
3. 권한 요청 화면에서 **"동의"** 클릭
   - User.Read: 기본 프로필 정보
   - Tasks.ReadWrite: To Do 읽기/쓰기

#### Google 계정 로그인 (Calendar 연동)
1. 우측 상단의 **빨간색 로그인 아이콘** 클릭
2. Google 계정 선택 또는 로그인
3. 권한 요청 화면에서 **"허용"** 클릭
   - Google Calendar 접근: 이벤트 생성 및 관리

#### 자동 로그인
- 한 번 로그인하면 다음 방문 시 자동으로 로그인됩니다 (두 서비스 모두)
- 로그아웃하려면 우측 상단 **📤 아이콘** 클릭 (두 서비스 모두 로그아웃)

**참고**: 두 서비스 모두 로그인하면 할 일이 Microsoft To Do와 Google Calendar에 **동시에 자동 추가**됩니다.

---

### 2️⃣ 할 일 입력하기

#### 방법 1: 텍스트 직접 입력
왼쪽 입력창에 할 일을 입력하세요.

**예시:**
```
금요일까지 보고서 제출
내일 오후 3시 팀 미팅
```

#### 방법 2: 이미지 업로드
오른쪽 영역에 이미지를 업로드하세요.

**업로드 방법:**
- 📷 **카메라 아이콘 클릭**: 직접 사진 촬영
- **영역 클릭**: 파일 선택 (여러 장 가능)
- **Ctrl + V**: 클립보드 이미지 붙여넣기
- **드래그 앤 드롭**: 이미지 파일 끌어다 놓기

**인식 가능한 이미지:**
- 📱 카카오톡 캡처
- 💬 문자 메시지 스크린샷
- 📝 손글씨 메모
- 🎁 기프티콘 이미지
- 📄 문서 사진

#### 방법 3: 다중 이미지
- 여러 장의 이미지를 한 번에 업로드 가능
- 연속된 대화는 자동으로 하나로 인식
- 각 이미지마다 **X** 버튼으로 개별 삭제 가능

---

### 3️⃣ AI 분석하기

1. 텍스트나 이미지 입력 후
2. 우측 하단의 **✨ 아이콘** 클릭
3. AI가 자동으로 분석 (2-5초 소요)
4. 추출된 할 일 목록 확인

**AI가 자동으로 인식하는 정보:**
- 📅 **기한**: "금요일까지", "12월 25일" 등
- ⏰ **시간**: "오후 3시", "저녁 7시 30분" 등
- 📍 **장소**: "강남역", "회의실 A" 등
- 👥 **참석자**: "김대리", "팀원들" 등
- 🏷️ **태그**: 자동으로 적절한 태그 생성

---

### 4️⃣ 태그 시스템 이해하기

모든 할 일은 **2개의 태그**가 자동으로 붙습니다.

#### 필수 태그 (3종류 중 1개)

- **#일정**: 특정 시간에 꼭 해야 하는 것
  - 예: `#일정 #회의 오후 3시 팀 미팅`
  - 용도: 약속, 회의, 이벤트

- **#기한**: 그 날짜까지만 하면 되는 것
  - 예: `#기한 #보고서 금요일까지 월말 보고서 제출`
  - 용도: 마감이 있는 과제, 제출물

- **#작업**: 언제든 할 수 있는 것
  - 예: `#작업 #청소 방 정리하기`
  - 용도: 루틴, 일상 업무

#### 추가 태그 (1개 자동 생성)
내용에 맞는 태그를 AI가 자동으로 만듭니다.
- 예: #회의, #보고서, #쇼핑, #운동, #공부 등

---

### 5️⃣ 기프티콘 자동 인식 🎁

기프티콘을 촬영하거나 캡처해서 올리면:

**자동으로 인식:**
- ✅ 상품명: "스타벅스 아메리카노 Tall"
- ✅ 유효기간: 2025.12.31
- ✅ 교환처: "전국 스타벅스 매장"
- ✅ 바코드 번호

**자동 설정:**
- 📌 태그: `#기한 #기프티콘`
- 📅 기한: 유효기간
- ⏰ 알림: 유효기간 당일 오전 7:30

---

### 6️⃣ To Do 앱 및 Calendar에 추가하기

#### 추출된 할 일 확인
- 할 일 목록 하단에 **개수** 표시
- 각 할 일 카드 확인:
  - 제목 (태그 포함)
  - 내용 미리보기
  - 기한 및 알림 시간

#### To Do 목록 선택 (Microsoft만 해당)
1. 우측 **드롭다운 메뉴**에서 목록 선택
   - 기본: "작업"
   - 또는 직접 만든 목록

#### 전송하기
1. **📤 전송 아이콘** 클릭
2. 자동으로 두 서비스에 동시 전송:
   - **Microsoft To Do**: 선택한 목록에 작업으로 추가
   - **Google Calendar**: 기본 캘린더에 종일 이벤트로 추가 (오전 7:30 알림)

#### 전송 완료
- ✅ 성공 시: 할 일이 사라지고 두 앱에 추가됨
- ⚠️ 부분 성공 시: 성공/실패 개수 표시 (예: "Microsoft: 3/3, Google: 2/3 성공")
- ❌ 실패 시: 에러 메시지 표시

---

### 7️⃣ 기한 및 알림 규칙

#### 기한 설정
- **명시된 경우**: 해당 날짜 23:59
- **명시 안 된 경우**: 오늘 23:59
- **년도 없는 경우**: 현재 년도 기준, 과거면 다음 년도
  - 예: 2025년 12월에 "1월 2일" → 2026년 1월 2일

#### 알림 설정
- **모든 할 일**: 기한 당일 오전 7:30 자동 알림
- 예: 기한이 12월 25일이면 → 12/25 07:30 알림

---

### 8️⃣ 유용한 팁

#### 💡 효율적인 사용법
- **여러 이미지 한번에**: 카톡 캡처 10장을 한 번에 올리세요
- **붙여넣기 활용**: 캡처 후 바로 Ctrl+V
- **기프티콘 관리**: 받은 기프티콘 바로 촬영해서 올리기

#### 🎯 정확한 인식을 위한 팁
- 이미지는 **선명하게** 촬영
- 텍스트가 **잘 보이도록** 확대
- **여러 각도**보다는 정면에서

#### ⚡ 빠른 작업
1. 할 일 입력
2. ✨ 클릭 (분석)
3. 📤 클릭 (전송)
4. 끝!

#### 🔄 자동 로그인 유지
- 브라우저를 닫아도 로그인 유지
- 로그아웃하지 않는 한 계속 사용 가능

---

### 9️⃣ 문제 해결

#### "로그인이 필요합니다" 오류
→ 우측 상단 로그인 아이콘 클릭

#### "분석 실패" 오류
→ 이미지가 너무 흐릿하거나 텍스트가 없는 경우
→ 다시 촬영하거나 텍스트로 입력

#### To Do에 추가되지 않음
→ Microsoft 계정 권한 확인
→ 로그아웃 후 다시 로그인

## 기술 스택

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **AI**: Google Gemini 2.5 Flash
- **Authentication**: Microsoft Authentication Library (MSAL)
- **API**: Microsoft Graph API
- **Icons**: Lucide React
- **Date Handling**: date-fns

## 프로젝트 구조

```
todo-ai-app/
├── src/
│   ├── components/       # React 컴포넌트
│   │   └── TaskCard.tsx  # 할 일 카드 컴포넌트
│   ├── services/         # 서비스 레이어
│   │   ├── geminiService.ts    # Gemini AI 분석
│   │   ├── authService.ts      # Microsoft 인증
│   │   └── todoService.ts      # To Do API
│   ├── types.ts          # TypeScript 타입 정의
│   ├── App.tsx           # 메인 앱 컴포넌트
│   ├── main.tsx          # 엔트리 포인트
│   └── index.css         # 전역 스타일
├── public/               # 정적 파일
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 라이선스

MIT

## 기여

이슈 및 풀 리퀘스트는 언제나 환영합니다!

## 문의

문제가 있거나 제안사항이 있으시면 GitHub Issues를 통해 알려주세요.
