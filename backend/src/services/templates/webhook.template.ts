import type { IncidentTemplateData, TestTemplateData, WebhookTemplateOutput } from "./types";

export const buildWebhookIncidentPayload = (data: IncidentTemplateData): WebhookTemplateOutput => ({
  payload: {
    event: "incident",
    status: data.status,
    kind: data.kind,
    monitor: {
      name: data.monitorName,
      type: data.monitorType,
    },
    message: data.message,
    incidentId: data.incidentId,
    sentAt: data.sentAt,
  },
});

export const buildWebhookTestPayload = (data: TestTemplateData): WebhookTemplateOutput => ({
  payload: {
    event: "test",
    channel: {
      name: data.channelName,
      type: data.channelType,
    },
    sentAt: data.sentAt,
  },
});
