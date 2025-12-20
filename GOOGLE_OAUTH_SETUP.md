# Google OAuth 2.0 설정 가이드

구글 캘린더 연동을 위해서는 **Google Cloud Console**에서 OAuth 2.0 클라이언트 ID를 생성하고 설정해야 합니다.

---

## 1. Google Cloud Console 프로젝트 생성

1. **Google Cloud Console** 접속: https://console.cloud.google.com/
2. 상단의 프로젝트 선택 드롭다운 클릭
3. **"새 프로젝트"** 클릭
4. 프로젝트 이름 입력 (예: "AI To-Do Generator")
5. **"만들기"** 클릭

---

## 2. Google Calendar API 활성화

1. 왼쪽 메뉴에서 **"API 및 서비스" → "라이브러리"** 선택
2. 검색창에 **"Google Calendar API"** 입력
3. **Google Calendar API** 선택
4. **"사용 설정"** 버튼 클릭

---

## 3. OAuth 동의 화면 구성

1. 왼쪽 메뉴에서 **"API 및 서비스" → "OAuth 동의 화면"** 선택
2. **사용자 유형** 선택:
   - **외부**: 모든 Google 계정 사용자 허용 (권장)
   - **내부**: Google Workspace 조직 내부만 (조직이 있는 경우)
3. **"만들기"** 클릭

### 앱 정보 입력:
- **앱 이름**: `AI To-Do Generator` (또는 원하는 이름)
- **사용자 지원 이메일**: 본인 이메일
- **앱 로고**: (선택 사항)
- **앱 도메인**:
  - 애플리케이션 홈페이지: `http://localhost:5173` (개발), Netlify URL (배포)
  - 개인정보처리방침: (선택 사항, 배포 시 필요)
  - 서비스 약관: (선택 사항, 배포 시 필요)
- **승인된 도메인**:
  - 개발: `localhost`
  - 배포: Netlify 도메인 (예: `your-app.netlify.app`)
- **개발자 연락처 정보**: 본인 이메일

4. **"저장 후 계속"** 클릭

### 범위(Scope) 추가:
1. **"범위 추가 또는 삭제"** 클릭
2. 다음 범위들을 검색하여 추가:
   - `https://www.googleapis.com/auth/calendar` (캘린더 전체 접근)
   - `https://www.googleapis.com/auth/userinfo.email` (이메일 조회)
   - `https://www.googleapis.com/auth/userinfo.profile` (프로필 조회)
3. **"업데이트"** 클릭
4. **"저장 후 계속"** 클릭

### 테스트 사용자 추가 (외부 선택 시):
- 앱이 "테스트" 모드일 때는 추가한 사용자만 로그인 가능
- **"+ ADD USERS"** 클릭
- 테스트할 Google 계정 이메일 추가
- **"저장 후 계속"** 클릭
- **"대시보드로 돌아가기"** 클릭

---

## 4. OAuth 2.0 클라이언트 ID 생성

1. 왼쪽 메뉴에서 **"API 및 서비스" → "사용자 인증 정보"** 선택
2. 상단의 **"+ 사용자 인증 정보 만들기"** 클릭
3. **"OAuth 클라이언트 ID"** 선택

### 애플리케이션 유형 설정:
- **애플리케이션 유형**: **웹 애플리케이션** 선택
- **이름**: `AI To-Do Web Client` (또는 원하는 이름)

### 승인된 자바스크립트 원본:
**개발 환경**:
```
http://localhost:5173
http://localhost:5174
http://127.0.0.1:5173
```

**배포 환경** (Netlify 예시):
```
https://your-app.netlify.app
https://your-custom-domain.com
```

### 승인된 리디렉션 URI:
**개발 환경**:
```
http://localhost:5173
http://localhost:5174
http://127.0.0.1:5173
```

**배포 환경**:
```
https://your-app.netlify.app
https://your-custom-domain.com
```

4. **"만들기"** 클릭

### 클라이언트 ID 복사:
- 생성 완료 후 팝업에서 **클라이언트 ID** 표시됨
- **클라이언트 ID** 복사 (예: `123456789-abcdefg.apps.googleusercontent.com`)
- (클라이언트 보안 비밀번호는 사용하지 않음 - 암묵적 흐름 사용)

---

## 5. .env 파일에 클라이언트 ID 추가

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_MICROSOFT_CLIENT_ID=your_microsoft_client_id
VITE_GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
```

---

## 6. Netlify 배포 시 추가 설정

### Netlify 사이트 설정:
1. Netlify 대시보드 → 사이트 선택
2. **Site settings → Environment variables** 이동
3. `VITE_GOOGLE_CLIENT_ID` 변수 추가

### Google Cloud Console에서 프로덕션 URL 추가:
1. **"사용자 인증 정보"** → 생성한 OAuth 클라이언트 클릭
2. **"승인된 자바스크립트 원본"**에 Netlify URL 추가:
   ```
   https://your-app.netlify.app
   ```
3. **"승인된 리디렉션 URI"**에도 동일하게 추가:
   ```
   https://your-app.netlify.app
   ```
4. **"저장"** 클릭

---

## 7. 앱 게시 (선택 사항, 테스트 사용자 제한 해제)

기본적으로 앱은 **"테스트"** 모드이며, 추가한 테스트 사용자만 로그인할 수 있습니다.

**모든 Google 사용자가 사용하려면**:
1. **"OAuth 동의 화면"** 메뉴 이동
2. **"앱 게시"** 버튼 클릭
3. 확인 후 **"확인"** 클릭

⚠️ **주의**:
- 민감한 범위(Calendar 포함) 사용 시 Google의 검토가 필요할 수 있음
- 개인 사용 또는 소규모 테스트는 "테스트" 모드로 충분

---

## 8. 테스트

1. 앱 실행: `npm run dev`
2. 브라우저에서 `http://localhost:5173` 접속
3. **Google 로그인** 버튼 클릭
4. Google 계정 선택
5. 권한 승인 화면에서 **"계속"** 클릭
6. 로그인 성공 확인

---

## 문제 해결

### 1. "팝업이 차단되었습니다" 오류
- 브라우저의 팝업 차단 해제
- Chrome: 주소창 오른쪽 팝업 차단 아이콘 클릭 → 허용

### 2. "redirect_uri_mismatch" 오류
```
Error: redirect_uri_mismatch
```
**원인**: 리디렉션 URI가 Google Cloud Console에 등록되지 않음

**해결**:
1. Google Cloud Console → OAuth 클라이언트 편집
2. 오류 메시지에 표시된 URI를 **"승인된 리디렉션 URI"**에 추가
3. 저장 후 재시도

### 3. "access_denied" 오류
- OAuth 동의 화면에서 범위(scope)가 제대로 추가되었는지 확인
- 테스트 사용자에 로그인하려는 계정이 추가되었는지 확인

### 4. 캘린더 이벤트 생성 안 됨
- Google Calendar API가 활성화되었는지 확인
- 콘솔에서 네트워크 오류 확인 (F12 → Network 탭)
- 액세스 토큰 만료 여부 확인 (1시간 후 자동 만료)

### 5. CORS 오류
```
Access to fetch at 'https://www.googleapis.com/calendar/v3/...' has been blocked by CORS policy
```
**원인**: Google API는 CORS를 지원하지만, 잘못된 요청이거나 토큰 문제

**해결**:
- 브라우저 콘솔에서 실제 오류 메시지 확인
- `Authorization: Bearer <token>` 헤더가 올바른지 확인
- 토큰이 유효한지 확인 (localStorage에서 `google_auth_token` 확인)

---

## 참고 링크

- [Google Cloud Console](https://console.cloud.google.com/)
- [Google Calendar API 문서](https://developers.google.com/calendar/api/v3/reference)
- [OAuth 2.0 가이드](https://developers.google.com/identity/protocols/oauth2)
- [OAuth 동의 화면 설정](https://support.google.com/cloud/answer/10311615)

---

## 요약 체크리스트

- [ ] Google Cloud 프로젝트 생성
- [ ] Google Calendar API 활성화
- [ ] OAuth 동의 화면 구성
  - [ ] 앱 정보 입력
  - [ ] 범위(scope) 추가: calendar, userinfo.email, userinfo.profile
  - [ ] 테스트 사용자 추가 (필요 시)
- [ ] OAuth 2.0 클라이언트 ID 생성
  - [ ] 승인된 자바스크립트 원본 추가
  - [ ] 승인된 리디렉션 URI 추가
- [ ] `.env` 파일에 클라이언트 ID 추가
- [ ] Netlify 환경 변수 설정 (배포 시)
- [ ] Google Cloud Console에 프로덕션 URL 추가 (배포 시)
- [ ] 로그인 테스트
- [ ] 캘린더 이벤트 생성 테스트
