import prisma from "../lib/prisma";

export type GeneralConfig = {
  systemName: string;
  tagline: string;
  logoText: string;
  logoUrl: string | null;
};

export type AlertingConfig = {
  incidentReminderIntervalHours: number;
};

export type MonitorDefaultsConfig = {
  intervalSeconds: number;
  timeoutMs: number;
};

export type SecurityConfig = {
  passwordMinLength: number;
  sessionDays: number;
  maxLoginAttempts: number;
};

export type SystemConfig = {
  general: GeneralConfig;
  alerting: AlertingConfig;
  monitorDefaults: MonitorDefaultsConfig;
  security: SecurityConfig;
};

export const SYSTEM_CONFIG_DEFAULTS: SystemConfig = {
  general: { systemName: "Monitoring Hub", tagline: "Lightweight Monitor", logoText: "MH", logoUrl: null },
  alerting: { incidentReminderIntervalHours: 24 },
  monitorDefaults: { intervalSeconds: 60, timeoutMs: 10000 },
  security: { passwordMinLength: 8, sessionDays: 30, maxLoginAttempts: 10 },
};

const KEYS = {
  general: "config.general",
  alerting: "config.alerting",
  monitorDefaults: "config.monitor_defaults",
  security: "config.security",
} as const;

const safeParse = <T>(raw: string | null | undefined, defaults: T): T => {
  if (!raw) return { ...defaults };
  try {
    return { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return { ...defaults };
  }
};

export const getSystemConfig = async (): Promise<SystemConfig> => {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    general: safeParse(map[KEYS.general], SYSTEM_CONFIG_DEFAULTS.general),
    alerting: safeParse(map[KEYS.alerting], SYSTEM_CONFIG_DEFAULTS.alerting),
    monitorDefaults: safeParse(map[KEYS.monitorDefaults], SYSTEM_CONFIG_DEFAULTS.monitorDefaults),
    security: safeParse(map[KEYS.security], SYSTEM_CONFIG_DEFAULTS.security),
  };
};

export const saveSystemConfig = async (patch: Partial<SystemConfig>): Promise<void> => {
  const upserts: Array<Promise<unknown>> = [];
  const upsert = (key: string, value: object) =>
    prisma.systemSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(value) },
      create: { key, value: JSON.stringify(value) },
    });

  if (patch.general) upserts.push(upsert(KEYS.general, patch.general));
  if (patch.alerting) upserts.push(upsert(KEYS.alerting, patch.alerting));
  if (patch.monitorDefaults) upserts.push(upsert(KEYS.monitorDefaults, patch.monitorDefaults));
  if (patch.security) upserts.push(upsert(KEYS.security, patch.security));

  await Promise.all(upserts);
};
