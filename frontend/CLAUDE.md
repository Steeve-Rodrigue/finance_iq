# Dashboard

## Identity

The dashboard surfaces where money goes and how the agent performed getting there. The confidence → retry → elicitation funnel is first-class content, not buried in a detail view.

## Tech stack

Next.js, ECharts (`echarts-for-react`), Tailwind CSS. Backend endpoints live in FastAPI under `/analytics`.

## Responsive breakpoints

All pages responsive. Three breakpoints:

- `<850px` — mobile: single column, stacked charts, sidebar collapses to icon bar
- `850px–1280px` — tablet: 2-column grids, compact sidebar
- `>1280px` — desktop: full sidebar, multi-column grids

Tailwind config:

```
screens: { md: '850px', xl: '1280px' }
```

## Sidebar

Icon-labeled, no profile/settings. Pages:

- 🏠 Overview
- 📈 Spend Analytics
- 🥧 Categories
- 🏪 Vendors
- ✨ Agent Insights
- ❓ Elicitations
- 📋 Bills Explorer
- 🧾 Line Items

## Pages

### 🏠 Overview

4 KPI tiles:

- Total spent: current month (name + amount) + previous month complete + delta previous vs the one before. Format: "February 2026 — €1,420 | January — €2,650 | ↑12% vs December"
- Bills processed: COUNT(bills) current month
- Pending elicitations: COUNT(elicitations WHERE status = 'pending')
- Auto-resolved rate: COUNT(bills without elicitation) / COUNT(bills) as %

3 charts:

- Spending trend: line chart, last 6 months fixed, granularity selector (day/week/month/year), configurable point count
- Top vendors: horizontal bar, top 5 by spend
- Spending by category: pie/donut

2 sections:

- Recent uploads: last 5-10 bills by created_at (name, vendor, total_amount, confidence, current_stage)
- Pending questions: 3-5 pending elicitations (bill name, vendor, amount, question text)

### 📈 Spend Analytics

Global filters (top): date range, granularity (day/week/month/year), vendor dropdown, category dropdown

KPI tiles (4, reactive to filters): total spent, bills count, average bill amount, highest single bill (amount + vendor)

Trends: spending trend (line, filtrable), category evolution (stacked area by month), vendor spending evolution (multi-line, top 5)

Patterns: spending heatmap (day of week × week of month), bill size distribution (histogram), spending velocity (cumulative current month vs previous month overlay)

Breakdowns: spending by category (pie, filtrable), top vendors (bar, filtrable), payment status (stacked bar), spend by document type (bar)

Detections: recurring bills (vendors with monthly similar amount ±10%), outliers (top 5 largest deviation vs vendor avg), month-over-month comparison table (category/vendor with current, previous, delta %)

### 🥧 Categories

Filters: date range

KPI tiles (4): total categories, most expensive category (name + total), uncategorized bills count, "Other" rate (% catch-all)

Charts: spend by category (bar desc), bill count by category (bar), category evolution (stacked area), uncategorized trend (line), "Other" rate over time (line)

Category table: columns (name, bill count, total spent, avg bill amount, % of total spend), sortable, click → filtered Bills Explorer. Actions: edit (name, slug), delete (blocked if bills linked). Create new category button.

### 🏪 Vendors

Filters: date range, category dropdown

KPI tiles (4): total vendors, top vendor (name + total), new vendors this month, vendor concentration (top 3 as % of total spend)

Charts: top vendors by spend (bar, top 10), top vendors by frequency (bar, top 10), new vendors over time (line), recurring vendors table (name, avg amount, frequency, last bill)

Vendor table: columns (name, key, bill count, total spent, avg bill amount, last bill date, most frequent category), sortable. Actions: edit (name, address, key), delete (blocked if bills linked). Click → vendor detail.

Vendor detail (drill-down): header (name, address, total spent, bill count, avg bill amount), edit button. Spending trend line chart. Bills history table (name, amount, date, status, confidence). Click bill → Bill Detail.

### ✨ Agent Insights

KPI tiles (4): avg confidence, auto-resolved rate (% without elicitation), OCR rate (% ocr vs structured), bills in backlog (current_stage != 'complete')

Charts: confidence trend over time (line, AVG by month), confidence by category (bar), extraction strategy effectiveness (grouped bar, AVG confidence per strategy)

Deferred: resolution funnel (needs retry tracking), confidence histogram, stage funnel, field confidence breakdown (needs field_confidences populated), verification rate (needs verified_by_user data)

### ❓ Elicitations (analytics + answering)

KPI tiles (4): pending count, answered count, expired count, expiration rate (% expired / total)

Charts: elicitation rate over time (line by month), elicitations by stage (bar: parsing/categorizing/auditing)

Also displayed: avg confidence (all bills), uncategorized bills count

Pending questions (bottom): list of pending elicitations with bill name, vendor, amount, question text. Textarea + submit to answer. Absorbs the former Clarify page.

### 📄 Bill Detail

Header: bill name, vendor name + address, status badge. Actions: edit bill, delete bill (confirmation).

Metadata: invoice number, issue date, due date, document type, total amount, subtotal, tax amount, currency, payment status, current stage, confidence + reasoning, extraction strategy. Editable fields: name, invoice_number, issue_date, due_date, total_amount, category, vendor, payment_status, status.

Line items: table (description, common_name, quantity, unit_price, line_total, category). Actions per row: edit, delete. Add new line item button.

Elicitations (if any): list (question, status, answer). If pending: textarea + submit.

### 📋 Bills Explorer

Filters: date range, vendor dropdown, category dropdown, status dropdown, search (name or invoice_number)

Table columns: name (clickable → Bill Detail), vendor, amount (+ currency), issue date, status, confidence (color-coded badge), category

Features: sortable, pagination. Actions per row: delete (confirmation). Upload new bill button (top).

### 🧾 Line Items

KPI tiles (3): total line items, most purchased item (common_name + count), categorization gap (% without category_id)

Charts: most frequent items (bar by common_name), top items by spend (bar by SUM line_total), unit price trend (line per item over time)

Table: columns (description, common_name, quantity, unit_price, line_total, vendor, bill name), filterable by vendor/category, sortable. Actions per row: edit (description, common_name, quantity, unit_price, category), delete (confirmation).

## CRUD summary

| Entity      | Create                  | Read                     | Update                   | Delete                  |
| ----------- | ----------------------- | ------------------------ | ------------------------ | ----------------------- |
| Bill        | Upload (Bills Explorer) | Explorer + Detail        | Bill Detail (all fields) | Explorer row, Detail    |
| Line Item   | Bill Detail             | Detail + Line Items page | Per row                  | Per row                 |
| Category    | Categories page         | Table + charts           | Edit name/slug           | Blocked if bills linked |
| Vendor      | —                       | Table + detail           | Edit name/address/key    | Blocked if bills linked |
| Elicitation | —                       | List                     | Answer (submit)          | —                       |

## Build phases

### 5A — MVP (demo-ready)

Overview, Bills Explorer, Bill Detail, Elicitations (includes answering)

### 5B — Analytics expansion

- Spend Analytics, + Agent Insights

### 5C — Deep dives

- Vendors, + Categories

### 5D — Granular analysis

- Line Items

## Schema gaps (not blocking)

- Stage transition history: current_stage exists but no timestamp log per stage
- Retry tracking: no explicit parse attempt log, resolution funnel is inferred
- raw_text: scaffolded, not populated
- field_confidences: JSONB exists, parser only sets bill-level confidence

## Data completeness

- payment_status: agents produce unpaid/partial/paid only until auditor lands
- field_confidences: scaffolded but unused, charts use bill-level confidence
- common_name: nullable, not always extracted

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
