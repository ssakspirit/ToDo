export interface TaskDetails {
  title: string;
  body: string;
  dueDateTime?: string; // ISO 8601
  importance: 'low' | 'normal' | 'high';
  reminderDateTime?: string; // ISO 8601
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
  userName?: string;
  userEmail?: string;
}
