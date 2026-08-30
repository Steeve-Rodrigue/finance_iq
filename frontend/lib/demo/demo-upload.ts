import type { BillUploadResult } from "@/lib/api";
import {
  DEMO_CURRENCY,
  type DemoBill,
  type DemoLineItem,
} from "@/lib/demo/demo-data";
import { getStore, nextId } from "@/lib/demo/demo-store";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function displayNameFrom(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

// Standalone demo counterpart to lib/api.ts's real uploadBills (raw XHR, doesn't go through
// request()) - fabricates one plausible, deliberately under-confident bill per uploaded file
// (plus a single line item) and inserts it into the store, so a demo visitor uploading a file
// sees it land in Bills Explorer looking freshly parsed rather than a no-op. The first uploaded
// bill also gets a fresh pending elicitation, keeping the "ambiguous bill triggers elicitation"
// story visible for files uploaded live in the session, not just the 5 pre-seeded ones.
export async function demoUploadBills(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<BillUploadResult[]> {
  onProgress?.(0);
  await delay(250);
  onProgress?.(45);
  await delay(250);
  onProgress?.(80);

  const store = getStore();
  const today = new Date().toISOString().slice(0, 10);
  const results: BillUploadResult[] = [];

  files.forEach((file, index) => {
    const total = Math.round((20 + Math.random() * 260) * 100) / 100;
    const subtotal = Math.round((total / 1.2) * 100) / 100;
    const tax = Math.round((total - subtotal) * 100) / 100;
    const displayName = displayNameFrom(file.name);

    const bill: DemoBill = {
      id: nextId("b", store.bills),
      category_id: null,
      vendor_id: null,
      name: file.name,
      invoice_number: null,
      vendor_name_raw: displayName,
      issue_date: today,
      due_date: null,
      total_amount: total,
      subtotal,
      tax_amount: tax,
      currency: DEMO_CURRENCY,
      status: "in_review",
      current_stage: "categorizing",
      payment_status: "unpaid",
      document_type: null,
      confidence: Math.round((0.4 + Math.random() * 0.35) * 100) / 100,
      extraction_strategy: "structured_extraction",
      reasoning:
        "Freshly uploaded in this demo session - vendor and category not yet confirmed.",
      verified_by_user: false,
    };
    store.bills.push(bill);

    const lineItem: DemoLineItem = {
      id: nextId("li", store.lineItems),
      bill_id: bill.id,
      description: displayName || file.name,
      common_name: null,
      quantity: 1,
      unit_price: total,
      line_total: total,
      category_id: null,
      subcategory_id: null,
      subcategory_name: null,
    };
    store.lineItems.push(lineItem);

    if (index === 0) {
      store.elicitations.push({
        id: nextId("e", store.elicitations),
        bill_id: bill.id,
        stage: "categorizing",
        status: "pending",
        question: `I couldn't confidently identify the vendor or category for "${file.name}". What company issued this bill, and what category fits best?`,
        context: { vendor_name_raw: displayName, total_amount: total },
        answer: null,
        answered_at: null,
      });
    }

    results.push({ filename: file.name, bill: { id: bill.id }, error: null });
  });

  await delay(150);
  onProgress?.(100);

  return results;
}
