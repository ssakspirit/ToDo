# Claude Code Project Setup

## Version Control
* Whenever code changes are made, you must record a one-line description with emoji in korean of the change in `.commit_message.txt` with Edit Tool.
   - Read `.commit_message.txt` first, and then Edit.
   - Overwrite regardless of existing content.
   - If it was a git revert related operation, make the .commit_message.txt file empty.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server at http://localhost:5173

# Build
npm run build        # Production build to dist/
npm run preview      # Preview production build locally
```

## Environment Variables

Required environment variables in `.env`:

```
VITE_GEMINI_API_KEY=<Google Gemini API key>
VITE_MICROSOFT_CLIENT_ID=<Azure AD OAuth client ID>
VITE_GOOGLE_CLIENT_ID=<Google Cloud OAuth client ID>
```

**Note**: These must also be configured in Netlify Site Settings → Environment variables for production deployment.

## Architecture Overview

### Dual-Service Integration Pattern

This app integrates with **both Microsoft To Do and Google Calendar** simultaneously. The architecture uses parallel authentication and parallel task sending:

**Authentication Flow**:
- `authService.ts` handles Microsoft OAuth via MSAL (scopes: `User.Read`, `Tasks.ReadWrite`)
- `googleAuthService.ts` handles Google OAuth with implicit flow (scope: `https://www.googleapis.com/auth/calendar`)
- Both services attempt silent login on mount via `loginSilently()` / `loginGoogleSilently()`
- Tokens stored in `localStorage` for persistence across sessions
- `App.tsx` maintains dual auth state: `isMicrosoftAuthenticated` and `isGoogleAuthenticated`

**Task Flow**:
1. User inputs text/images
2. **Gemini AI Analysis** (`geminiService.ts`): Extracts structured tasks with Korean tag system
3. **Dual Send** (`handleSendToBoth` in `App.tsx`): Uses `Promise.allSettled()` to send to both services in parallel
4. **Microsoft To Do** (`todoService.ts`): Creates tasks via Microsoft Graph API
5. **Google Calendar** (`calendarService.ts`): Creates all-day events with 7:30 AM reminders

### Korean Tag System

All tasks **must** have a title in this format: `#RequiredTag #AdditionalTag content`

**Required Tags** (one of):
- `#일정` - Appointments/events at specific times
- `#기한` - Deadlines (complete by date)
- `#작업` - General tasks (no deadline)

**Additional Tag**: Content-specific tag (e.g., `#회의`, `#보고서`, `#기프티콘`)

**Special Case - Gifticons**: Auto-detected from images, tagged as `#기한 #기프티콘`, expiration date becomes due date.

### Date Handling Logic

Critical rules implemented in `geminiService.ts`:

1. **Due DateTime**: Always 23:59:00 on due date
2. **No Due Date Specified**: Default to today
3. **Year Inference**: If year omitted, use current year BUT must be future date
   - Example: On 2025-12-18, "1월 2일" → `2026-01-02T23:59:00` (rolls to next year)
4. **Reminder DateTime**: Always 7:30 AM on due date
   - Example: Due `2025-12-25T23:59:00` → Reminder `2025-12-25T07:30:00`

### Google Calendar All-Day Events

`calendarService.ts` converts tasks to all-day events:

```typescript
{
  start: { date: "YYYY-MM-DD", timeZone: "Asia/Seoul" },
  end: { date: "YYYY-MM-DD", timeZone: "Asia/Seoul" },
  reminders: {
    useDefault: false,
    overrides: [{ method: "popup", minutes: 450 }]  // 7:30 AM = 450 min from midnight
  }
}
```

**Reminder Calculation**: For all-day events, `minutes: 450` means 7.5 hours after midnight (7:30 AM).

### Service Layer Architecture

**Pattern**: Each external service has dedicated auth + API service files

| Service | Auth | API | Purpose |
|---------|------|-----|---------|
| Microsoft | `authService.ts` | `todoService.ts` | MSAL singleton, Graph API tasks |
| Google | `googleAuthService.ts` | `calendarService.ts` | OAuth popup flow, Calendar API events |
| Gemini | N/A | `geminiService.ts` | Structured JSON extraction via schema |

**Shared Patterns**:
- Auth services: `login()`, `loginSilently()`, `logout()`, `getAccessToken()`
- API services: `createTasksInBatch()` / `createEventsInBatch()` using sequential processing
- Error handling: Try/catch at service layer, state updates at component layer

## Gemini AI Schema

The AI uses **structured output** (not conversational prompts). Schema defined in `geminiService.ts`:

```typescript
responseMimeType: "application/json"
responseSchema: { type: Type.ARRAY, items: taskItemSchema }
```

**Critical Instructions in Prompt**:
- Title must include tags: `#필수태그 #추가태그 내용`
- Body preserves original content verbatim (no summarization)
- Due date defaults to today if unspecified
- Year-rollover logic for future dates
- Gifticon detection with expiration date extraction
- Multi-image handling: Group consecutive chats, separate unrelated content

## UI State Management

`App.tsx` uses React state for orchestration:

```typescript
authState: {
  isAuthenticated: boolean          // True if either service authenticated
  isMicrosoftAuthenticated: boolean
  isGoogleAuthenticated: boolean
  userName/googleUserName
}
```

**Send Button Logic**:
- Shows only if `isAuthenticated === true` (either service)
- Validates: Both services need list selection (MS) and auth (both)
- Sends to authenticated services only (skips if one not logged in)

**Login Buttons**:
- Header: Shows separate buttons for each unauthenticated service
- Task list: Shows login buttons if no auth, else shows send button

## Version Control Convention

**Critical**: After code changes, record a one-line Korean description with emoji in `.commit_message.txt`:

```bash
# Read first, then Edit (overwrite)
✨ 구글 캘린더 자동 전송 기능 추가
🐛 날짜 계산 버그 수정
```

**Exception**: For git revert operations, leave `.commit_message.txt` empty.

## Key Files

- **`src/App.tsx`**: Main orchestrator, dual auth state, parallel send logic
- **`src/services/geminiService.ts`**: AI analysis with Korean tag system and date logic
- **`src/services/authService.ts`**: Microsoft MSAL auth singleton
- **`src/services/googleAuthService.ts`**: Google OAuth popup flow with localStorage tokens
- **`src/services/todoService.ts`**: Microsoft Graph API tasks creation
- **`src/services/calendarService.ts`**: Google Calendar API all-day events
- **`src/types.ts`**: Shared TypeScript interfaces (`TaskDetails`, `AuthState`)

## Critical Implementation Details

1. **Timezone**: Hardcoded to `"Asia/Seoul"` in all date/time operations
2. **Token Storage**: `localStorage` for both MSAL and Google tokens
3. **Popup Windows**: Google auth uses popup flow (not redirect)
4. **Batch Operations**: Sequential processing (for-loop), not `Promise.all()`
5. **Dark Mode**: Default enabled (`useState(true)`)
6. **Auto-login**: Both services attempt silent login on mount
7. **Partial Success**: App shows per-service success counts, keeps tasks on any failure
