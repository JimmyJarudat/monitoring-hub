import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { toast } from "react-toastify";

type TokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
};

type RefreshResponse = Partial<TokenRefreshResult> & {
  token?: string;
  data?: Partial<TokenRefreshResult> & {
    token?: string;
  };
};

type RetriableRequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
};

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const REFRESH_ENDPOINT = "/auth/refresh";

let refreshPromise: Promise<TokenRefreshResult | null> | null = null;

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
  headers: {
    "Content-Type": "application/json",
  },
});

const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

const saveTokens = (tokens: TokenRefreshResult) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);

  if (tokens.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  window.dispatchEvent(new Event("session:changed"));
};

const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new Event("session:changed"));
};

const isTokenExpiring = (token: string) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    const expiresAt = Number(payload.exp) * 1000;

    return !expiresAt || expiresAt <= Date.now() + 30_000;
  } catch {
    return true;
  }
};

const normalizeRefreshResponse = (response: RefreshResponse): TokenRefreshResult | null => {
  const accessToken =
    response.accessToken ?? response.token ?? response.data?.accessToken ?? response.data?.token;
  const refreshToken = response.refreshToken ?? response.data?.refreshToken;

  if (!accessToken) {
    return null;
  }

  return { accessToken, refreshToken };
};

const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      return null;
    }

    try {
      const response = await axios.post<RefreshResponse>(
        `${API_BASE_URL}${REFRESH_ENDPOINT}`,
        { refreshToken },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 60_000,
        },
      );

      const tokens = normalizeRefreshResponse(response.data);

      if (tokens) {
        saveTokens(tokens);
      }

      return tokens;
    } catch {
      clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  let token = getAccessToken();

  if (token && isTokenExpiring(token)) {
    const refreshed = await refreshAccessToken();
    token = refreshed?.accessToken ?? null;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;
    const isRefreshRequest = originalRequest?.url?.includes(REFRESH_ENDPOINT);

    if (status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;

      const refreshed = await refreshAccessToken();

      if (refreshed?.accessToken) {
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${refreshed.accessToken}`,
        };

        return api(originalRequest);
      }

      toast.error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
      window.location.replace("/login");
    }

    if (status === 403) {
      toast.error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
    } else if (status && status >= 500) {
      toast.error("เกิดข้อผิดพลาดจากฝั่งเซิร์ฟเวอร์");
    } else if (!error.response) {
      toast.error("ไม่สามารถเชื่อมต่อกับระบบได้");
    }

    return Promise.reject(error);
  },
);

export const useApi = () => {
  const get = <T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> => api.get<T>(url, config);

  const post = <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> => api.post<T>(url, data, config);

  const put = <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> => api.put<T>(url, data, config);

  const patch = <T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> => api.patch<T>(url, data, config);

  const del = <T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> => api.delete<T>(url, config);

  const fetchWithToken = async (url: string, options: RequestInit = {}) => {
    const response = await api.request({
      url,
      method: options.method ?? "GET",
      data: options.body,
      headers: options.headers as AxiosRequestConfig["headers"],
    });

    return new Response(JSON.stringify(response.data), {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    api,
    get,
    post,
    put,
    patch,
    del,
    fetchWithToken,
    refreshAccessToken,
    clearTokens,
    saveTokens,
  };
};

export default api;
