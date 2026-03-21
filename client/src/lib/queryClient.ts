import { QueryClient, QueryFunction } from "@tanstack/react-query";

// In dev, the backend runs on :8000. In production (served by FastAPI), same-origin.
const API_BASE = import.meta.env.VITE_API_BASE || "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// For local dev against the Python backend, set VITE_API_BASE=http://localhost:8000
const BACKEND_URL = import.meta.env.VITE_API_BASE || API_BASE;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (data instanceof FormData) {
    // Don't set Content-Type for FormData — browser sets multipart boundary
    body = data;
  } else if (data) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }

  const res = await fetch(`${BACKEND_URL}${url}`, {
    method,
    headers,
    body,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${BACKEND_URL}${queryKey.join("/")}`);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000, // 30s — fresh enough for hackathon
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
