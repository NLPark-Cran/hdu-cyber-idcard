export type Submission = {
  id: string;
  name: string;
  dept: string;
  hasPhoto: boolean;
  photoFile: string | null;
  createdAt: string;
  updatedAt: string | null;
};

const TOKEN_KEY = "idcard.admin.token";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function request(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && options.auth) {
    setToken(null);
    throw new ApiError("登录已过期，请重新登录", 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error || `请求失败（${res.status}）`,
      res.status
    );
  }
  return data;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function submitRecord(payload: {
  name: string;
  dept: string;
  photo: string | null;
}) {
  return (await request("/api/submit", { method: "POST", body: payload })) as {
    ok: boolean;
    updated?: boolean;
  };
}

export async function adminLogin(username: string, password: string) {
  const data = (await request("/api/admin/login", {
    method: "POST",
    body: { username, password },
  })) as { ok: boolean; token: string };
  setToken(data.token);
  return data;
}

export async function adminList(): Promise<Submission[]> {
  const data = (await request("/api/admin/submissions", { auth: true })) as {
    records: Submission[];
  };
  return data.records;
}

export async function deleteSubmission(id: string) {
  return (await request(`/api/admin/submissions/${id}`, {
    method: "DELETE",
    auth: true,
  })) as { ok: boolean };
}

export async function bulkImport(items: { name: string; dept: string; photo: string | null }[]) {
  return (await request("/api/admin/import", {
    method: "POST",
    body: { items },
    auth: true,
  })) as { ok: boolean; imported: number; updated: number; skipped: number; errors: string[] };
}

/** 拉取证件照，返回 blob URL（调用方负责 revoke） */
export async function fetchPhotoUrl(photoFile: string): Promise<string> {
  const res = await fetch(`/api/admin/photos/${encodeURIComponent(photoFile)}`, {
    headers: { Authorization: `Bearer ${getToken() || ""}` },
  });
  if (!res.ok) throw new ApiError("照片加载失败", res.status);
  return URL.createObjectURL(await res.blob());
}

export async function fetchRosterCsv(): Promise<Blob> {
  const res = await fetch("/api/admin/roster.csv", {
    headers: { Authorization: `Bearer ${getToken() || ""}` },
  });
  if (!res.ok) throw new ApiError("名单导出失败", res.status);
  return res.blob();
}
