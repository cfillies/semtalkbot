import axios, { AxiosError, Method } from "axios";

export type ProcessStatus = "running" | "stopped" | "completed" | "failed";

export type ProcessSession = {
  id: string;
  name: string;
  threadId: string;
  status: ProcessStatus;
  createdAt: string;
  updatedAt: string;
  debugStepper: boolean;
  definition: any;
};

export type ProcessStartRequest = {
  name?: string;
  definition?: any;
  definitionFile?: string;
  debugStepper?: boolean;
  userQuery?: string;
  sessionId?: string;
  env?: Record<string, any>;
  database?: string;
  collection?: string;
  diagramId?: string;
  modelName?: string;
  language?: string;
  connectToken?: string;
};

export type ProcessStepRequest = {
  resume?: any;
  env?: Record<string, any>;
};

const DEFAULT_PROCESS_MANAGER_URL = "https://semaiservice26.azurewebsites.net";
const DEFAULT_PROCESS_MANAGER_API_PREFIX = "/api";

function getProcessManagerBaseUrl() {
  const fromEnv =
    process.env.PROCESS_MANAGER_URL ??
    process.env.PROCESS_MANAGER_BASE_URL ??
    process.env.SERVICE_URL;

  return (fromEnv ?? DEFAULT_PROCESS_MANAGER_URL).replace(/\/+$/, "");
}

function buildApiUrl(path: string) {
  const prefix = (process.env.PROCESS_MANAGER_API_PREFIX ?? DEFAULT_PROCESS_MANAGER_API_PREFIX)
    .replace(/^\/*/, "/")
    .replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${getProcessManagerBaseUrl()}${prefix}/${cleanPath}`;
}

function toError(err: unknown, method: Method, path: string) {
  const axiosErr = err as AxiosError<any>;
  const status = axiosErr?.response?.status;
  const remoteMessage = axiosErr?.response?.data?.error;

  if (status) {
    return new Error(
      `[PROCESS API] ${method.toUpperCase()} ${path} failed (${status})${
        remoteMessage ? `: ${remoteMessage}` : ""
      }`
    );
  }

  return err as Error;
}

function isNotFoundError(err: unknown) {
  const axiosErr = err as AxiosError;
  return axiosErr?.response?.status === 404;
}

async function requestProcessApi<T>(method: Method, path: string, data?: unknown): Promise<T> {
  try {
    const response = await axios.request<T>({
      method,
      url: buildApiUrl(path),
      data,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: Number(process.env.PROCESS_MANAGER_TIMEOUT_MS ?? 15000),
    });

    return response.data;
  } catch (err) {
    throw toError(err, method, path);
  }
}

export async function listRunningProcesses() {
  const result = await requestProcessApi<{ processes?: any[] }>("get", "processes");
  if (Array.isArray(result?.processes)) {
    return result.processes;
  }
  return Array.isArray(result as any) ? (result as any) : [];
}

export async function getProcessSession(id: string) {
  const details = await getProcessDetails(id);
  return details?.session ?? null;
}

export async function stopProcess(id: string) {
  try {
    return await requestProcessApi<any>("post", `processes/${encodeURIComponent(id)}/stop`, {});
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

export async function getProcessDetails(id: string) {
  try {
    return await requestProcessApi<any>("get", `processes/${encodeURIComponent(id)}`);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

export async function getProcessHistory(id: string) {
  try {
    return await requestProcessApi<any>("get", `processes/${encodeURIComponent(id)}/history`);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

export async function visualizeProcess(id: string) {
  try {
    return await requestProcessApi<any>("get", `processes/${encodeURIComponent(id)}/visualize`);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

export async function startProcess(request: ProcessStartRequest) {
  return requestProcessApi<any>("post", "processes/start", request ?? {});
}

export async function stepProcess(id: string, request: ProcessStepRequest) {
  try {
    return await requestProcessApi<any>(
      "post",
      `processes/${encodeURIComponent(id)}/step`,
      request ?? {}
    );
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}