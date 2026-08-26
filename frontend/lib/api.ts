const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type FastApiValidationError = { msg?: string };

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return (detail as FastApiValidationError[])
        .map((error) => error.msg)
        .filter(Boolean)
        .join(", ");
    }
  } catch {
    // response body wasn't JSON — fall through to the generic message
  }
  return "Something went wrong. Please try again.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData bodies (file uploads) must NOT get a manual Content-Type - the browser sets its
  // own with the multipart boundary parameter, which a fixed "application/json" would clobber.
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type UserRead = {
  id: string;
  email: string;
  username: string;
  is_demo: boolean;
  created_at: string;
};

export function login(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signup(
  email: string,
  username: string,
  password: string,
): Promise<UserRead> {
  return request<UserRead>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export function getCurrentUser(token: string): Promise<UserRead> {
  return request<UserRead>("/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type OverviewKPIs = {
  total_spent_current_month: string;
  total_spent_previous_month: string;
  spend_delta_pct: string | null;
  bills_processed_current_month: number;
  pending_elicitations: number;
  auto_resolved_rate: string;
};

export type TrendPoint = { period: string; total: string };
export type VendorSpend = { vendor_name: string; total: string };
export type CategorySpend = { category_name: string; total: string };

export type RecentUpload = {
  bill_id: string;
  name: string;
  vendor_name: string | null;
  total_amount: string | null;
  confidence: string | null;
  current_stage: string;
};

export type PendingQuestion = {
  elicitation_id: string;
  bill_id: string;
  bill_name: string;
  vendor_name: string | null;
  amount: string | null;
  question: string;
};

export type OverviewResponse = {
  kpis: OverviewKPIs;
  spending_trend: TrendPoint[];
  top_vendors: VendorSpend[];
  spending_by_category: CategorySpend[];
  recent_uploads: RecentUpload[];
  pending_questions: PendingQuestion[];
};

export type Granularity = "day" | "week" | "month" | "year";

export function getOverview(
  token: string,
  params?: { granularity?: Granularity; months?: number },
): Promise<OverviewResponse> {
  const query = new URLSearchParams();
  if (params?.granularity) query.set("granularity", params.granularity);
  if (params?.months) query.set("months", String(params.months));
  const qs = query.toString();
  return request<OverviewResponse>(`/analytics/overview${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type BillUploadResult = {
  filename: string;
  // Full BillRead shape isn't needed yet - Bill Detail (which would use it) isn't built. Kept
  // loose rather than duplicating the backend schema for fields nothing here reads.
  bill: { id: string } | null;
  error: string | null;
};

// XMLHttpRequest, not fetch: `onProgress` needs real upload-progress events (bytes sent vs.
// total), which fetch has no API for on the request body side - only XHR's xhr.upload
// exposes that. Mirrors request()'s error-parsing shape (FastAPI's `detail` field) so callers
// get the same ApiError either way.
export function uploadBills(
  token: string,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<BillUploadResult[]> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/bills/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BillUploadResult[]);
        } catch {
          reject(
            new ApiError(
              "Received an invalid response from the server.",
              xhr.status,
            ),
          );
        }
        return;
      }

      let message = "Something went wrong. Please try again.";
      try {
        const body = JSON.parse(xhr.responseText);
        const detail = body?.detail;
        if (typeof detail === "string") {
          message = detail;
        } else if (Array.isArray(detail)) {
          message = (detail as FastApiValidationError[])
            .map((error) => error.msg)
            .filter(Boolean)
            .join(", ");
        }
      } catch {
        // response body wasn't JSON — fall through to the generic message
      }
      reject(new ApiError(message, xhr.status));
    };

    xhr.onerror = () => {
      reject(new ApiError("Network error - please check your connection.", 0));
    };

    xhr.send(formData);
  });
}
