// src/types.ts

export type Attachment = {
  name: string;
  type: string;
  dataUrl: string;
};

export type FallbackEvent = {
  from: { provider: string; model: string };
  to: { provider: string; model: string };
  reason: string;
  attempt: number;
};

export type RouterMeta = {
  actualModel?: string;
  strategy?: string;
  complexityScore?: number;
  complexityTier?: string;
  attempts?: number;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  parentPrompt?: string;
  attachments?: Attachment[];
  fallbacks?: FallbackEvent[];
  strategy?: string;
  routerMeta?: RouterMeta;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ProjectSummary = {
  text: string;
  uptoMessageId: number;
  createdAt: number;
  messageCount: number;
};

export type Project = {
  id: string;
  title: string;
  files: Record<string, string>;
  messages: ChatMessage[];
  activeFile: string;
  createdAt: number;
  updatedAt: number;
  color: string;
  isSample?: boolean;
  summary?: ProjectSummary;
};

export type Store = {
  projects: Project[];
  currentProjectId: string;
};

export type AppSettings = {
  theme: "light" | "dark";
  defaultProvider: string;
  showAvatar: boolean;
};

export type Snapshot = {
  id: string;
  projectId: string;
  timestamp: number;
  files: Record<string, string>;
  activeFile: string;
};