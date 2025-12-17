# AI To-Do 생성기

사진이나 텍스트를 업로드하면 AI가 자동으로 할 일(To-Do)을 추출하여 Microsoft To Do 앱에 추가해주는 웹 애플리케이션입니다.

## 주요 기능

- **AI 기반 텍스트/이미지 분석**: Google Gemini AI를 사용하여 카카오톡 캡처, 메모, 이미지에서 할 일을 자동으로 추출
- **다중 이미지 처리**: 여러 장의 이미지를 한 번에 업로드하여 일괄 분석
- **Microsoft To Do 연동**: 추출된 할 일을 Microsoft To Do 앱에 자동으로 추가
- **다크 모드 지원**: 라이트/다크 테마 자동 전환
- **반응형 디자인**: 모바일, 태블릿, 데스크톱 모든 환경 지원

## 시작하기

### 사전 요구사항

- Node.js 18 이상
- Google Gemini API 키
- Microsoft Azure AD 앱 등록 (Client ID)

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

### 3. 설치 및 실행

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
```

```bash
# 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### 4. 빌드 및 배포

```bash
# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

**배포 시 주의사항:**
- Azure AD 앱 등록의 "리디렉션 URI"에 배포된 도메인 추가 (예: `https://yourdomain.com`)
- 환경 변수 설정 확인

## 사용 방법

1. **Microsoft 계정 로그인**
   - 우측 상단의 "Microsoft 로그인" 버튼 클릭
   - Microsoft 계정으로 로그인

2. **할 일 추출**
   - 텍스트 직접 입력 또는 이미지/파일 업로드
   - "분석하기" 버튼 클릭
   - AI가 자동으로 할 일 추출

3. **To Do에 추가**
   - 추출된 할 일 확인
   - To Do 목록 선택
   - "To Do에 추가" 버튼 클릭

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
