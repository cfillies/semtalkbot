import { BaseMessage, MessageStructure, MessageToolSet, MessageType } from "@langchain/core/messages";
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
  inputModerator?: boolean;
  inputredflags?: string[];
  outputModerator?: boolean;
  outputredflags?: string[];
  userQuery?: string;
  sessionId?: string;
  env?: Record<string, any>;
  messages?: BaseMessage<MessageStructure<MessageToolSet>, MessageType>[]
  database?: string;
  collection?: string;
  diagramId?: string;
  modelName?: string;
  language?: string;
  connectToken?: string;
   m365AccessToken?: string;
};

export type ProcessStepRequest = {
  resume?: any;
  userQuery?: string;
  messages?: BaseMessage<MessageStructure<MessageToolSet>, MessageType>[]
  env?: Record<string, any>;
   m365AccessToken?: string;
};

export type ProcessStopRequest = {
  connectToken?: string;
};

export type OboExchangeResponse =
  | string
  | {
    connectToken?: string;
    token?: string;
    accessToken?: string;
    ssoToken?: string;
    ssotoken?: string;
    teamsToken?: string;
    data?: unknown;
    result?: unknown;
    payload?: unknown;
  }
  | null
  | undefined;

// const DEFAULT_PROCESS_MANAGER_URL = "https://semaiservice26.azurewebsites.net";
const DEFAULT_PROCESS_MANAGER_URL = "http://localhost:7073";
const DEFAULT_PROCESS_MANAGER_API_PREFIX = "/api";

function getProcessManagerBaseUrl() {
  const fromEnv =
    process.env.PROCESS_MANAGER_URL;

  return (fromEnv ?? DEFAULT_PROCESS_MANAGER_URL).replace(/\/+$/, "");
}

function buildApiUrl(path: string) {
  const prefix = (process.env.PROCESS_MANAGER_API_PREFIX ?? DEFAULT_PROCESS_MANAGER_API_PREFIX)
    .replace(/^\/*/, "/")
    .replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${getProcessManagerBaseUrl()}${prefix}/${cleanPath}`;
}

function readTokenFromExchangeResponse(response: OboExchangeResponse): string | null {
  if (!response) {
    return null;
  }

  if (typeof response === "string") {
    const trimmed = response.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return readTokenFromExchangeResponse(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  const candidates = [
    response.connectToken,
    response.token,
    response.accessToken,
    response.ssoToken,
    response.ssotoken,
    response.teamsToken,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const nestedValues = [response.data, response.result, response.payload];
  for (const nested of nestedValues) {
    const token = readTokenFromExchangeResponse(nested as OboExchangeResponse);
    if (token) {
      return token;
    }
  }

  return null;
}

function toError(err: unknown, method: Method, path: string) {
  const axiosErr = err as AxiosError<any>;
  const status = axiosErr?.response?.status;
  const remoteMessage = axiosErr?.response?.data?.error;

  if (status) {
    return new Error(
      `[PROCESS API] ${method.toUpperCase()} ${path} failed (${status})${remoteMessage ? `: ${remoteMessage}` : ""
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
      // timeout: Number(process.env.PROCESS_MANAGER_TIMEOUT_MS ?? 15000),
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

export async function stopProcess(id: string, request?: ProcessStopRequest) {
  try {
    return await requestProcessApi<any>(
      "post",
      `processes/${encodeURIComponent(id)}/stop`,
      request ?? {}
    );
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

export async function exchangeOboConnectToken(
  ssoToken: string,
  scopes: string[] = ["https://graph.microsoft.com/.default"]
) {
  const token = String(ssoToken ?? "").trim();
  if (!token) {
    return null;
  }

  const response = await requestProcessApi<OboExchangeResponse>("post", "m365/obo/exchange", {
    ssoToken: token,
    ssotoken: token,
    teamsToken: token,
    token,
    scopes,
  });

  return readTokenFromExchangeResponse(response);
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