export type IncidentKind = "transition" | "reminder";

export type IncidentTemplateData = {
  monitorName: string;
  monitorType: string;
  status: "OPEN" | "RESOLVED";
  message: string | null;
  kind: IncidentKind;
  incidentId: string;
  sentAt: string;
};

export type TestTemplateData = {
  channelName: string;
  channelType: string;
  sentAt: string;
};

export type LineTemplateOutput = {
  altText: string;
  flexContents: object;
};

export type TelegramTemplateOutput = {
  text: string;
  parseMode: "HTML";
};

export type EmailTemplateOutput = {
  subject: string;
  text: string;
  html: string;
};

export type WebhookTemplateOutput = {
  payload: Record<string, unknown>;
};

export type SlackTemplateOutput = {
  text: string;
  blocks: Record<string, unknown>[];
};

export type DiscordTemplateOutput = {
  embeds: Record<string, unknown>[];
};
