import prisma from "../lib/prisma";
import { decryptCredentialSecret, encryptCredentialSecret, isEncryptedCredentialSecret } from "../lib/credentialSecret";

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
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  sessionDays: number;
  maxLoginAttempts: number;
};

export type EmailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
};

export type SystemConfig = {
  general: GeneralConfig;
  alerting: AlertingConfig;
  monitorDefaults: MonitorDefaultsConfig;
  security: SecurityConfig;
  email: EmailConfig;
};

export const SYSTEM_CONFIG_DEFAULTS: SystemConfig = {
  general: { systemName: "Monitoring Hub", tagline: "Lightweight Monitor", logoText: "MH", logoUrl: null },
  alerting: { incidentReminderIntervalHours: 24 },
  monitorDefaults: { intervalSeconds: 60, timeoutMs: 10000 },
  security: {
    passwordMinLength: 8,
    requireLowercase: false,
    requireUppercase: false,
    requireNumber: false,
    requireSpecial: false,
    sessionDays: 30,
    maxLoginAttempts: 10,
  },
  email: { enabled: true, host: "", port: 587, secure: false, username: "", password: "", from: "" },
};

const KEYS = {
  general: "config.general",
  alerting: "config.alerting",
  monitorDefaults: "config.monitor_defaults",
  security: "config.security",
  email: "config.email",
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
  const email = safeParse(map[KEYS.email], SYSTEM_CONFIG_DEFAULTS.email);

  return {
    general: safeParse(map[KEYS.general], SYSTEM_CONFIG_DEFAULTS.general),
    alerting: safeParse(map[KEYS.alerting], SYSTEM_CONFIG_DEFAULTS.alerting),
    monitorDefaults: safeParse(map[KEYS.monitorDefaults], SYSTEM_CONFIG_DEFAULTS.monitorDefaults),
    security: safeParse(map[KEYS.security], SYSTEM_CONFIG_DEFAULTS.security),
    email: {
      ...email,
      password: email.password ? "••••••••" : "",
    },
  };
};

export const getResolvedEmailConfig = async (): Promise<EmailConfig> => {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEYS.email } });
  const email = safeParse(row?.value, SYSTEM_CONFIG_DEFAULTS.email);

  return {
    ...email,
    password: email.password ? decryptCredentialSecret(email.password) : "",
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
  if (patch.email) {
    const current = await getResolvedEmailConfig();
    const next = { ...current, ...patch.email };
    const password =
      patch.email.password && patch.email.password !== "••••••••"
        ? encryptCredentialSecret(patch.email.password)
        : current.password && isEncryptedCredentialSecret(current.password)
          ? current.password
          : current.password
            ? encryptCredentialSecret(current.password)
            : "";

    upserts.push(upsert(KEYS.email, { ...next, password }));
  }

  await Promise.all(upserts);
};
