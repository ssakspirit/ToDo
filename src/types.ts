export interface TaskDetails {
  title: string;
  body: string;
  dueDateTime?: string; // ISO 8601
  importance: 'low' | 'normal' | 'high';
  reminderDateTime?: string; // ISO 8601
  categories?: string[];
}

export type ServiceKey = 'microsoft' | 'google';

export interface AnalyzedTask extends TaskDetails {
  id: string;
  createdAt: number;
  // 서비스별 전송 완료 여부 — 부분 실패 후 재전송 시 이미 보낸 쪽은 건너뜀 (중복 생성 방지)
  sentTo?: Partial<Record<ServiceKey, boolean>>;
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
