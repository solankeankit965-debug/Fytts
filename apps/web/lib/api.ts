export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const res = await fetch("/api" + path, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
    if (refreshed.ok) return api(path, init, false);
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || "Something went wrong. Please try again.");
  }
  return res.json();
}
