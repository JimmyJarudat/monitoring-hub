import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useApi } from "@/hooks/useApi";

export type GeneralConfig = { systemName: string; tagline: string; logoText: string; logoUrl: string | null };
export type AlertingConfig = { incidentReminderIntervalHours: number };
export type MonitorDefaultsConfig = { intervalSeconds: number; timeoutMs: number };
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
export type ScheduledReportConfig = {
  enabled: boolean;
  time: string;
  channelIds: string[];
};

export type SystemConfig = {
  general: GeneralConfig;
  alerting: AlertingConfig;
  monitorDefaults: MonitorDefaultsConfig;
  security: SecurityConfig;
  email: EmailConfig;
  scheduledReport: ScheduledReportConfig;
};

const DEFAULTS: SystemConfig = {
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
  scheduledReport: { enabled: false, time: "08:00", channelIds: [] },
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type SystemConfigContextValue = {
  config: SystemConfig;
  reload: () => Promise<void>;
};

const SystemConfigContext = createContext<SystemConfigContextValue>({
  config: DEFAULTS,
  reload: async () => {},
});

export const SystemConfigProvider = ({ children }: { children: ReactNode }) => {
  const { api } = useApi();
  const [config, setConfig] = useState<SystemConfig>(DEFAULTS);

  const reload = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<SystemConfig>>("/system-config");
      if (res.data.success) setConfig(res.data.data);
    } catch {}
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ config, reload }), [config, reload]);

  return createElement(SystemConfigContext.Provider, { value }, children);
};

export const useSystemConfig = () => useContext(SystemConfigContext);
