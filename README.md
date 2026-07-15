# Vardhnam Analytics

## Project Overview
Vardhnam Analytics is a complete, premium, interactive business analytics dashboard for Vardhnam Agro. It is designed for management-level analysis to evaluate the business flow from Purchase to Closing Stock.

## Business Objective
To provide a consolidated view of the FY 2025–26 business operations. The application answers key management questions including:
- What quantity and value did we purchase and sell?
- What is the actual Net Demand and Return Rate?
- Which SKUs have strong market absorption vs. high return leakage?
- Based on current data and management assumptions, what is the next-season Fresh Purchase Requirement?

## Current MVP Scope
This is an approval MVP designed for local usage.
- Runs locally during development.
- Processes FY 2025–26 Excel/CSV files directly from the filesystem.
- No permanent database, no authentication, no external API calls (Tally/AI).
- Data is processed securely in the local browser via IndexedDB for session persistence.

## Technology Stack
- **Next.js (App Router)** & **TypeScript**
- **Tailwind CSS** (for styling) & **Lucide React** (for icons)
- **Recharts** (for data visualization)
- **xlsx** & **papaparse** (for file parsing)
- **idb** (for IndexedDB session persistence)

## Security Warning
**DO NOT COMMIT ACTUAL CONFIDENTIAL BUSINESS DATA TO A PUBLIC REPOSITORY.**
The application reads from `data/approval/`. This directory and any `*.business.xlsx` files are ignored by git.

## Local Setup & How to Run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm run dev
   ```

3. **View the application:**
   Open [http://localhost:3000](http://localhost:3000) with your browser.

## How to Load Data
1. Ensure the default FY 2025-26 source files are placed in the `data/approval/` folder.
2. Navigate to the root route (`/`) which acts as the Data Workspace.
3. Click "Process Default Dataset" to parse the files, validate data quality, and load the processed insights into the dashboard.

## Expected Source Types
- **Sales:** `DayBook_1_converted.xlsx`
- **Purchase:** `Purcase_UP_1_converted.xlsx`, `purchase_2_converted.xlsx`
- **Sales Return:** `Sales_Return_Items.csv`
- **Closing Stock:** `Godown_Stock_Excel.xlsx`
- **SKU Metadata:** `SKU_Master.csv`, `SKU_Mapping.csv`
- **Voucher Context:** `Voucher_Header.csv`, `Credit_Note.xlsx`

## Data Processing Flow
1. **Raw File Reading:** Reading local buffers/strings.
2. **Parsing:** Source-specific adapters (`parseGodown`, `parseSales`, etc.) convert raw structures to domain models.
3. **Validation & Mapping:** The `SkuMapper` standardises item names and assigns proper `skuId`s. The `ValidationEngine` identifies unmapped items, semantic errors, and overlaps.
4. **Persistence:** Cleaned records are saved into IndexedDB.
5. **Analytics Engine:** Pure mathematical functions aggregate data by Crop, SKU, or Global scope.

## Business KPI Definitions
- **Gross Sales Quantity:** Total valid Sales Quantity for mapped Seed SKUs.
- **Physical Sales Return Quantity:** Actual item-level return quantity.
- **Net Demand:** Gross Sales Quantity - Physical Sales Return Quantity.
- **Return Rate %:** (Physical Sales Return Quantity / Gross Sales Quantity) × 100.
- **Purchase to Demand Gap:** Purchase Quantity - Net Demand.

## Forecast Formula
- **Forecast Demand:** Net Demand × (1 + Expected Growth Rate)
- **Usable Stock:** Closing Stock × Usable Stock %
- **Fresh Purchase Requirement:** MAX(Forecast Demand - Usable Stock, 0)
*Note: This is a deterministic scenario planner, not an AI forecasting model.*

## Known Data Limitations
1. **Opening Stock:** Opening Stock as on 01 April 2025 is not included. Purchase-to-closing-stock reconciliation is partial.
2. **Dealer Location:** Dealer District/State data is unavailable, limiting location-based forecasting.
3. **Inventory Ageing:** Batch/Lot dates are not confirmed, preventing true ageing analysis.
4. **Quality Status:** Germination status is unknown, thus Usable Stock % remains a management assumption.
5. **Time Scope:** The dashboard currently only reflects a single financial year (FY 2025–26), meaning no statistical YoY trend comparisons are possible.

## Future Roadmap
- Integration with a permanent database (e.g. Supabase, PostgreSQL).
- Direct API integration with Tally for live sync.
- Authentication and Role-Based Access Control (RBAC).
- Inclusion of Opening Stock for complete inventory reconciliation.
