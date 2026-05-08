import axios from "axios";
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

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  roleId?: string;
  role?: string | { name: string };
  createdAt?: string;
};

type AuthPayload = {
  accessToken: string;
  refreshToken: string;
  user?: SessionUser;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type LoginInput = {
  identifier: string;
  password: string;
};

type RegisterInput = {
  username: string;
  email: string;
  password: string;
};

type RefreshResult = {
  success: boolean;
  token: string | null;
};

type SessionContextValue = {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<ApiResponse<AuthPayload>>;
  register: (input: RegisterInput) => Promise<ApiResponse<AuthPayload>>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<RefreshResult>;
  loadUser: () => Promise<SessionUser | null>;
  setSession: (payload: AuthPayload) => void;
  clearSession: () => void;
};

type StoredSession = {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
};

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "sessionUser";
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
  headers: {
    "Content-Type": "application/json",
  },
});

const SessionContext = createContext<SessionContextValue | null>(null);

const emptySession: StoredSession = {
  accessToken: null,
  refreshToken: null,
  user: null,
};

const readStoredSession = (): StoredSession => {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const userJson = localStorage.getItem(USER_KEY);

  if (!userJson) {
    return { accessToken, refreshToken, user: null };
  }

  try {
    return {
      accessToken,
      refreshToken,
      user: JSON.parse(userJson) as SessionUser,
    };
  } catch {
    localStorage.removeItem(USER_KEY);
    return { accessToken, refreshToken, user: null };
  }
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<ApiFailure>(error)) {
    return error.response?.data?.message ?? error.message;
  }

  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSessionState] = useState<StoredSession>(() => readStoredSession());
  const [isLoading, setIsLoading] = useState(true);

  const setSession = useCallback((payload: AuthPayload) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);

    if (payload.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    }

    setSessionState((current) => ({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      user: payload.user ?? current.user,
    }));

    window.dispatchEvent(new Event("session:changed"));
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setSessionState(emptySession);
    window.dispatchEvent(new Event("session:changed"));
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<RefreshResult> => {
    const currentRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (!currentRefreshToken) {
      clearSession();
      return { success: false, token: null };
    }

    try {
      const response = await api.post<ApiResponse<AuthPayload>>("/auth/refresh", {
        refreshToken: currentRefreshToken,
      });

      if (!response.data.success) {
        clearSession();
        return { success: false, token: null };
      }

      const authData = response.data.data;
      setSession(authData);
      return { success: true, token: authData.accessToken };
    } catch {
      clearSession();
      return { success: false, token: null };
    }
  }, [clearSession, setSession]);

  const loadUser = useCallback(async () => {
    let token = localStorage.getItem(ACCESS_TOKEN_KEY);

    if (!token && localStorage.getItem(REFRESH_TOKEN_KEY)) {
      const refreshed = await refreshAccessToken();
      token = refreshed.token;
    }

    if (!token) {
      return null;
    }

    try {
      const response = await api.get<ApiResponse<SessionUser>>("/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.data.success || !response.data.data) {
        return null;
      }

      const user = response.data.data;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      setSessionState((current) => ({
        ...current,
        user,
      }));

      return user;
    } catch {
      const refreshed = await refreshAccessToken();

      if (!refreshed.token) {
        return null;
      }

      try {
        const response = await api.get<ApiResponse<SessionUser>>("/auth/me", {
          headers: {
            Authorization: `Bearer ${refreshed.token}`,
          },
        });

        if (!response.data.success || !response.data.data) {
          return null;
        }

        const user = response.data.data;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        setSessionState((current) => ({ ...current, user }));

        return user;
      } catch {
        clearSession();
        return null;
      }
    }
  }, [clearSession, refreshAccessToken]);

  const login = useCallback(async (input: LoginInput): Promise<ApiResponse<AuthPayload>> => {
    try {
      const response = await api.post<ApiResponse<AuthPayload>>("/auth/login", input);

      if (response.data.success) {
        setSession(response.data.data);
      }

      return response.data;
    } catch (error) {
      return { success: false, message: getErrorMessage(error) };
    }
  }, [setSession]);

  const register = useCallback(
    async (input: RegisterInput): Promise<ApiResponse<AuthPayload>> => {
      try {
        const response = await api.post<ApiResponse<AuthPayload>>("/auth/register", input);

        if (response.data.success) {
          setSession(response.data.data);
        }

        return response.data;
      } catch (error) {
        return { success: false, message: getErrorMessage(error) };
      }
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    const currentRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    try {
      if (currentRefreshToken) {
        await api.post("/auth/logout", { refreshToken: currentRefreshToken });
      }
    } finally {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    const syncSession = () => {
      setSessionState(readStoredSession());
    };

    window.addEventListener("storage", syncSession);
    window.addEventListener("session:changed", syncSession);

    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("session:changed", syncSession);
    };
  }, []);

  useEffect(() => {
    const initSession = async () => {
      setIsLoading(true);
      const stored = readStoredSession();
      setSessionState(stored);

      if (stored.accessToken || stored.refreshToken) {
        await loadUser();
      }

      setIsLoading(false);
    };

    void initSession();
  }, [loadUser]);

  const value = useMemo<SessionContextValue>(
    () => ({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
      isAuthenticated: Boolean(session.accessToken),
      isLoading,
      login,
      register,
      logout,
      refreshAccessToken,
      loadUser,
      setSession,
      clearSession,
    }),
    [
      session.accessToken,
      session.refreshToken,
      session.user,
      isLoading,
      login,
      register,
      logout,
      refreshAccessToken,
      loadUser,
      setSession,
      clearSession,
    ],
  );

  return createElement(SessionContext.Provider, { value }, children);
};

export const useSession = () => {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return context;
};
