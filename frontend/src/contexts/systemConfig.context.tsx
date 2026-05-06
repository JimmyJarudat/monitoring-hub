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
export type SecurityConfig = { passwordMinLength: number; sessionDays: number; maxLoginAttempts: number };

export type SystemConfig = {
  general: GeneralConfig;
  alerting: AlertingConfig;
  monitorDefaults: MonitorDefaultsConfig;
  security: SecurityConfig;
};

const DEFAULTS: SystemConfig = {
  general: { systemName: "Monitoring Hub", tagline: "Lightweight Monitor", logoText: "MH", logoUrl: null },
  alerting: { incidentReminderIntervalHours: 24 },
  monitorDefaults: { intervalSeconds: 60, timeoutMs: 10000 },
  security: { passwordMinLength: 8, sessionDays: 30, maxLoginAttempts: 10 },
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
