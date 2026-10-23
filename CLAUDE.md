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
npm run typecheck    # tsc --noEmit over src/ and netlify/functions/
npm run build        # Type check + production build to dist/ (fails on any TS error)
npm run preview      # Preview production build locally
```

## Environment Variables

Required environment variables in `.env`:

```
ANTHROPIC_API_KEY=<Claude API key>              # server-only
VITE_MICROSOFT_CLIENT_ID=<Azure AD OAuth client ID>
VITE_GOOGLE_CLIENT_ID=<Google Cloud OAuth client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>  # server-only
VITE_HOLIDAY_API_KEY=<data.go.kr holiday API key>
```

**Note**: These must also be configured in Netlify Site Settings → Environment variables for production deployment.

**Secrets are server-only**: `ANTHROPIC_API_KEY` and `GOOGLE_CLIENT_SECRET` are read by Netlify Functions (`netlify/functions/`), never by `src/` — never give them a `VITE_` prefix or reference them via `import.meta.env`, which would inline them into the public bundle. Their Netlify scope must include **Functions**. `npm run dev` runs the functions locally via `@netlify/vite-plugin` (`vite.config.ts` injects `.env` into `process.env` for them).

| Endpoint | Function | Purpose |
|---|---|---|
| `POST /api/analyze` | `analyze.mts` | Claude Haiku 5.5 analysis (prompt, zod structured output, error mapping) |
| `POST /api/google-token` | `google-token.mts` | Google OAuth code exchange / refresh (adds client_secret) |

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
2. **Claude AI Analysis** (`analyzeService.ts` → `/api/analyze`): Extracts structured tasks with Korean tag system
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

Critical rules implemented in the prompt in `netlify/functions/analyze.mts` (today's date and weekday are computed in Asia/Seoul):

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
| Claude | N/A (server key) | `analyzeService.ts` → `analyze.mts` | Structured JSON extraction via schema |

**Shared Patterns**:
- Auth services: `login()`, `loginSilently()`, `logout()`, `getAccessToken()`
- API services: `createTasksInBatch()` / `createEventsInBatch()` using sequential processing
- Error handling: Try/catch at service layer, state updates at component layer

## Claude AI Schema

The AI uses **structured output** via `client.messages.parse()` with model `claude-haiku-5-5`. Zod schema defined in `analyze.mts` (top level must be an object, so tasks are wrapped):

```typescript
output_config: { effort: "medium", format: zodOutputFormat(z.object({ tasks: z.array(TaskSchema) })) }
```

Haiku 5.5 rejects `temperature`/`top_p`/`top_k` and assistant prefill (400) — don't add them. Attachments: JPG/PNG/GIF/WEBP as `image` blocks, PDF as `document` block; other types are rejected with 400.

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
- **`netlify/functions/analyze.mts`**: AI analysis with Korean tag system and date logic (server-side)
- **`src/services/analyzeService.ts`**: Thin client for `/api/analyze`
- **`src/components/InputSection.tsx`**: Text/attachment input + analyze button (state lives in `App.tsx`)
- **`src/services/workdayService.ts`**: 정액분·달력·방학 계산. Keywords (`LEAVE_TITLES`, `휴업`, 방학 시작/종료) are defined once at the top and parsed by `buildScheduleContext()`; titles must match exactly
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
