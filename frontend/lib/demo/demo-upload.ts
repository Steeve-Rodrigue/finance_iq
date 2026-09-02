import type { BillUploadResult } from "@/lib/api";
import type {
  DemoBill,
  DemoElicitation,
  DemoLineItem,
} from "@/lib/demo/demo-data";
import { getStore } from "@/lib/demo/demo-store";
import { startProgressSimulation } from "@/lib/progress-simulation";

// Same env var lib/api.ts's real request()/uploadBills use - the /demo endpoints live on the
// same FastAPI backend, just at a different (unauthenticated) path.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// backend/app/schemas/demo.py's DemoBillUploadResult - the public POST /demo/bills/upload
// response. Deliberately its own type rather than reusing lib/api.ts's trimmed BillRead/
// BillFullRead: this needs every field DemoBill/DemoLineItem/DemoElicitation actually carry,
// which those UI-trimmed types don't. Numeric fields arrive as strings (the backend serializes
// Decimal columns as strings, same as every other real endpoint) and get converted below.
type DemoUploadApiBill = {
  id: string;
  category_id: string | null;
  vendor_id: string | null;
  name: string;
  invoice_number: string | null;
  vendor_name_raw: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount: string | null;
  subtotal: string | null;
  tax_amount: string | null;
  currency: string | null;
  status: string;
  current_stage: string;
  payment_status: string;
  document_type: string | null;
  confidence: string | null;
  extraction_strategy: string | null;
  reasoning: string | null;
  verified_by_user: boolean;
};

type DemoUploadApiLineItem = {
  id: string;
  bill_id: string;
  description: string;
  common_name: string | null;
  quantity: string | null;
  unit_price: string | null;
  line_total: string;
};

type DemoUploadApiElicitation = {
  id: string;
  bill_id: string;
  stage: string;
  status: "pending" | "answered" | "expired";
  question: string;
  context: Record<string, unknown> | null;
  answer: { text: string } | null;
  answered_at: string | null;
};

type DemoUploadApiResult = {
  filename: string;
  bill: DemoUploadApiBill | null;
  line_items: DemoUploadApiLineItem[];
  elicitations: DemoUploadApiElicitation[];
  error: string | null;
};

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function insertRealResult(result: DemoUploadApiResult): BillUploadResult {
  if (result.error || !result.bill) {
    return {
      filename: result.filename,
      bill: null,
      error: result.error ?? "Parsing failed.",
    };
  }

  const store = getStore();
  const apiBill = result.bill;

  const bill: DemoBill = {
    id: apiBill.id,
    category_id: apiBill.category_id,
    vendor_id: apiBill.vendor_id,
    name: apiBill.name,
    invoice_number: apiBill.invoice_number,
    vendor_name_raw: apiBill.vendor_name_raw,
    issue_date: apiBill.issue_date,
    due_date: apiBill.due_date,
    total_amount: toNumber(apiBill.total_amount),
    subtotal: toNumber(apiBill.subtotal),
    tax_amount: toNumber(apiBill.tax_amount),
    currency: apiBill.currency,
    status: apiBill.status,
    current_stage: apiBill.current_stage,
    payment_status: apiBill.payment_status,
    document_type: apiBill.document_type,
    confidence: toNumber(apiBill.confidence),
    extraction_strategy: apiBill.extraction_strategy,
    reasoning: apiBill.reasoning,
    verified_by_user: apiBill.verified_by_user,
  };
  store.bills.push(bill);

  for (const apiItem of result.line_items) {
    const lineItem: DemoLineItem = {
      id: apiItem.id,
      bill_id: apiItem.bill_id,
      description: apiItem.description,
      common_name: apiItem.common_name,
      quantity: toNumber(apiItem.quantity),
      unit_price: toNumber(apiItem.unit_price),
      line_total: Number(apiItem.line_total),
      category_id: null,
      subcategory_id: null,
      subcategory_name: null,
    };
    store.lineItems.push(lineItem);
  }

  for (const apiElicitation of result.elicitations) {
    const elicitation: DemoElicitation = {
      id: apiElicitation.id,
      bill_id: apiElicitation.bill_id,
      stage: apiElicitation.stage,
      status: apiElicitation.status,
      question: apiElicitation.question,
      context: apiElicitation.context ?? {},
      answer: apiElicitation.answer,
      answered_at: apiElicitation.answered_at,
    };
    store.elicitations.push(elicitation);
  }

  return { filename: result.filename, bill: { id: bill.id }, error: null };
}

// Real counterpart to the old client-side fabrication: POSTs to the public, unauthenticated
// backend/app/routers/demo.py::demo_upload_bills - the actual vision parser
// (bill_parser_service.py) runs on the real file, through the real confidence/retry/
// elicitation decision loop, scoped to one shared backend demo account. The result gets
// inserted into this session's local store exactly like the old fabrication did, so the rest
// of the demo dashboard (Bills Explorer, Elicitations, ...) keeps working unchanged - only the
// data backing a freshly-uploaded bill is now genuine instead of Math.random().
//
// The backend only accepts one file per request (bounds cost/latency per call, see
// app/routers/demo.py) and rate-limits to 2 requests/10min per client - only the first
// selected file is actually uploaded; any others are reported as a clear per-file error
// rather than silently dropped or burning through the rate limit.
export async function demoUploadBills(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<BillUploadResult[]> {
  const [first, ...rest] = files;
  const results: BillUploadResult[] = [];

  if (first) {
    const stopProgress = onProgress
      ? startProgressSimulation(onProgress)
      : () => {};
    try {
      const formData = new FormData();
      formData.append("files", first);

      const response = await fetch(`${API_BASE_URL}/demo/bills/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "The live demo upload failed. Please try again.";
        try {
          const body = (await response.json()) as { detail?: unknown };
          if (typeof body.detail === "string") message = body.detail;
        } catch {
          // Keep the generic message - response body wasn't JSON.
        }
        results.push({ filename: first.name, bill: null, error: message });
      } else {
        const [result] = (await response.json()) as DemoUploadApiResult[];
        results.push(insertRealResult(result));
      }
    } catch {
      results.push({
        filename: first.name,
        bill: null,
        error: "Could not reach the live demo backend. Please try again.",
      });
    } finally {
      stopProgress();
      onProgress?.(100);
    }
  }

  for (const file of rest) {
    results.push({
      filename: file.name,
      bill: null,
      error:
        "The live demo only parses one bill at a time - upload this one separately.",
    });
  }

  return results;
}
