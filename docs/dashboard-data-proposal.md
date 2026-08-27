# Dashboard data proposal v2

## Framing

The dashboard surfaces two things: where money goes, and how the agent performed getting there. The confidence → retry → elicitation funnel is first-class content, not buried in a detail view.

## Sidebar sections

### 🏠 Overview

**4 KPI tiles:**

- Total spent: mois courant (nom + montant) + mois précédent complet + delta mois précédent vs celui d'avant. Example: "February 2026 — €1,420 | January — €2,650 | ↑12% vs December"
- Bills processed: COUNT(bills) mois courant
- Pending elicitations: COUNT(elicitations WHERE status = 'pending')
- Auto-resolved rate: COUNT(bills sans elicitation) / COUNT(bills) en %

**3 charts:**

- Spending trend: line chart, 6 derniers mois fixe. Granularité configurable: jour / semaine / mois / année, nombre de points configurable
  use pyecharts
- Top vendors: bar chart horizontal, top 5 par spend
- Spending by category: pie/donut chart

**2 sections:**

- Recent uploads: 5-10 derniers bills par created_at (name, vendor, total_amount, confidence, current_stage)
- Pending questions: 3-5 elicitations pending (bill name, vendor, amount, question text)

### 📈 Spend Analytics

**Filtres globaux (top of page):**

- Date range (du / au)
- Granularité: jour / semaine / mois / année
- Vendor (dropdown)
- Category (dropdown)

**Section 1 — KPI tiles (4, reactive to filters):**

- Total spent (filtered period)
- Bills count (filtered period)
- Average bill amount
- Highest single bill (amount + vendor name)

**Section 2 — Trends:**

- Spending trend: line chart, filtrable, granularité configurable
- Category evolution: stacked area chart by month (how categories shift over time)
- Vendor spending evolution: multi-line chart, top 5 vendors each with its own curve

**Section 3 — Patterns:**

- Spending heatmap: day of week × week of month (when you spend the most)
- Bill size distribution: histogram of total_amount values (many small bills? few large ones?)
- Spending velocity: cumulative spend current month vs previous month (overlay curve — "am I ahead or behind last month?")

**Section 4 — Breakdowns:**

- Spending by category: pie/donut (filtrable)
- Top vendors: bar chart horizontal (filtrable)
- Payment status breakdown: stacked bar (unpaid/partial/paid/overdue/disputed) — note: today's agent only ever infers unpaid/partial/paid, so overdue/disputed will show empty until Phase 4 (auditor)
- Spend by document type: bar chart (invoice/receipt/statement/subscription/other) — note: today's parser prompt only ever emits invoice/receipt, so the other 3 types will show empty until the prompt is broadened

**Section 5 — Detections:**

- Recurring bills: vendors appearing every month with similar amount (±10%) → subscription candidates. Columns: vendor, avg amount, frequency, last bill
- Outliers: top 5 bills with largest deviation vs same vendor's average (e.g. "EDF €450 vs avg €150 → 3x")
- Month over month comparison: table per category/vendor with current month, previous month, delta %

### 🥧 Categories

**Filters:**

- Date range (du / au)

**KPI tiles (4):**

- Total categories (COUNT)
- Most expensive category (name + total)
- Uncategorized bills count
- "Other" rate (% of bills in catch-all category)

**Charts:**

- Spend by category: bar chart sorted desc
- Bill count by category: bar chart
- Category evolution: stacked area chart by month
- Uncategorized trend: line chart over time (should trend down)
- "Other" rate over time: line chart (rising = taxonomy gap or model problem)

**Category table:**

- Columns: name, bill count, total spent, avg bill amount, % of total spend
- Sortable by any column
- Click → filtered Bills Explorer for that category
- Actions: edit (name, slug), delete (with confirmation, blocked if bills linked)
- Create new category button (top of table)

### 🏪 Vendors

**Filters:**

- Date range (du / au)
- Category (dropdown)

**KPI tiles (4):**

- Total vendors (COUNT)
- Top vendor (name + total spent)
- New vendors this month (COUNT WHERE created_at in current month)
- Vendor concentration (top 3 vendors as % of total spend)

**Charts:**

- Top vendors by spend: bar chart horizontal, top 10
- Top vendors by frequency: bar chart horizontal, top 10 (by bill count)
- New vendors over time: line chart (first created_at per vendor, by month)
- Recurring vendors: table of vendors appearing every month with similar amount (±10%). Columns: name, avg amount, frequency, last bill

**Vendor table:**

- Columns: name, key, bill count, total spent, avg bill amount, last bill date, category (most frequent)
- Sortable by any column
- Click → Vendor detail
- Actions: edit (name, address, key), delete (with confirmation, blocked if bills linked)

**Vendor detail (drill-down):**

- Vendor name + address, total spent lifetime, bill count, avg bill amount
- Edit vendor button (name, address, key)
- Spending trend: line chart for this vendor only (amount over time)
- Bills history: table of all bills for this vendor (name, amount, date, status, confidence)
- Click bill → Bill Detail page

### ✨ Agent Insights

**KPI tiles (4):**

- Avg confidence (across all bills)
- Auto-resolved rate (% bills without elicitation)
- OCR rate (% bills using ocr vs direct)
- Bills in backlog (COUNT WHERE current_stage != 'complete')

**Charts:**

- Confidence trend over time: line chart, AVG(confidence) by month
- Confidence by category: bar chart, AVG(confidence) per category
- Extraction strategy effectiveness: grouped bar, AVG(confidence) per strategy

**Deferred (schema gap — not buildable today):**

- Resolution funnel → no retry-attempt tracking exists; only the final confidence/reasoning is stored, so first-attempt-vs-retry-vs-escalated can't be reconstructed
- Field confidence breakdown → when field_confidences populated
- Verification rate → when verified_by_user has meaningful data

**Deferred (scope cut only — data already exists, just not in v1):**

- Confidence distribution histogram
- Current stage funnel

### ❓ Elicitations (analytics + answering)

**KPI tiles (4):**

- Pending count
- Answered count
- Expired count
- Expiration rate (% expired / total)

**Charts:**

- Elicitation rate over time: line chart by month (should trend down)
- Elicitations by stage: bar chart (parsing vs categorizing vs auditing)

**Also displayed here (from Overview):**

- Avg confidence (across all bills)
- Uncategorized bills count

**Pending questions (bottom section):**

- List of pending elicitations with bill name, vendor, amount, question text
- Textarea + submit button to answer
- Absorbs the former Clarify page — no separate page

### 📄 Bill Detail

**Header:**

- Bill name, vendor name + address, status badge
- Actions: edit bill, delete bill (with confirmation)

**Metadata section:**

- Invoice number, issue date, due date, document type
- Total amount, subtotal, tax amount, currency
- Payment status, current stage
- Confidence (global) + reasoning
- Extraction strategy
- Editable fields: name, invoice_number, issue_date, due_date, total_amount, category, vendor, payment_status, status

**Line items section:**

- Table: description, common_name, quantity, unit_price, line_total, category
- Actions per row: edit, delete
- Add new line item button

**Elicitations section (if any):**

- List of elicitations for this bill (question, status, answer)
- If pending: textarea + submit button to answer

### 📋 Bills Explorer

**Filters:**

- Date range (du / au)
- Vendor (dropdown)
- Category (dropdown)
- Status (dropdown)
- Search (by name or invoice_number)

**Table columns:**

- Name (clickable → Bill Detail)
- Vendor
- Amount (+ currency)
- Issue date
- Status
- Confidence (badge color-coded)
- Category

**Features:**

- Sortable by any column
- Pagination
- Click → Bill Detail
- Actions per row: delete (with confirmation)
- Upload new bill button (top of page)

### 🧾 Line Items

**KPI tiles (3):**

- Total line items (COUNT)
- Most purchased item (common_name + count)
- Categorization gap (% line items without category_id)

**Charts:**

- Most frequent items: bar chart by common_name
- Top items by total spend: bar chart by SUM(line_total)
- Unit price trend: line chart per item over time ("personal price index")

**Table:**

- Columns: description, common_name, quantity, unit_price, line_total, vendor, bill name
- Filterable by vendor, category
- Sortable
- Actions per row: edit (description, common_name, quantity, unit_price, category), delete (with confirmation)
