function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * SVCURRENTDATE is mandatory, not decorative.
 *
 * A Voucher collection is walked against the company's *active period*, and
 * SVFROMDATE/SVTODATE alone do not set it. When a company's active period does
 * not span its vouchers — which is the normal state for a company whose books
 * were imported rather than entered, and which the user sees as "I have to pick
 * the period manually before anything shows" — Tally answers with an empty
 * collection and HTTP 200. No error, no warning, just nothing.
 *
 * That false negative is expensive: it previously led to the conclusion that
 * two FY23-24 company files held masters but no transactions, and that the
 * user's voucher import into Tally was broken. Both were wrong. The vouchers
 * were there the whole time; the query could not see them. Verified live on
 * 2026-07-31 — the same company returned 0 vouchers without SVCURRENTDATE and
 * 1227 with it, including exactly the 21 Purchase vouchers Tally's own
 * Purchase Register was showing on screen at the time.
 */
function periodVariables(fromDate: string, toDate: string): string {
  return `<SVFROMDATE TYPE="Date">${escapeXml(fromDate)}</SVFROMDATE>
    <SVTODATE TYPE="Date">${escapeXml(toDate)}</SVTODATE>
    <SVCURRENTDATE TYPE="Date">${escapeXml(toDate)}</SVCURRENTDATE>`;
}

/**
 * Tally's HTTP gateway ignores bare ad-hoc <COLLECTION> requests for TYPE=Data;
 * TYPE=Collection with ISINITIALIZE="Yes" is what actually dumps native XML
 * (VOUCHER / STOCKITEM tags) headlessly regardless of the active Tally UI screen.
 */
export function buildVoucherExportRequest(
  company: string,
  voucherTypeName: string,
  fromDate: string,
  toDate: string
): string {
  return `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>VoucherCollection</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
    ${periodVariables(fromDate, toDate)}
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="VoucherCollection" ISINITIALIZE="Yes">
      <TYPE>Voucher</TYPE>
      <FILTER>VchTypeFilter</FILTER>
      <FETCH>DATE, VOUCHERNUMBER, PARTYLEDGERNAME, VOUCHERTYPENAME, ISCANCELLED, ISOPTIONAL, ALLINVENTORYENTRIES.LIST</FETCH>
     </COLLECTION>
     <SYSTEM TYPE="Formulae" NAME="VchTypeFilter">$VoucherTypeName = "${escapeXml(voucherTypeName)}"</SYSTEM>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;
}

/**
 * Fetches vouchers by type with their ledger postings rather than inventory.
 *
 * Journals carry real revenue and purchase value that never appears in an
 * inventory entry — in FY24-25 three Journals moved ₹19,51,600 onto Purchase
 * Exempt — so the reconciliation cannot close without them.
 */
export function buildLedgerVoucherExportRequest(
  company: string,
  voucherTypeName: string,
  fromDate: string,
  toDate: string
): string {
  return `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>LedgerVoucherCollection</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
    ${periodVariables(fromDate, toDate)}
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="LedgerVoucherCollection" ISINITIALIZE="Yes">
      <TYPE>Voucher</TYPE>
      <FILTER>LedgerVchTypeFilter</FILTER>
      <FETCH>DATE, VOUCHERNUMBER, PARTYLEDGERNAME, VOUCHERTYPENAME, ISCANCELLED, ISOPTIONAL, NARRATION, ALLLEDGERENTRIES.LIST, LEDGERENTRIES.LIST</FETCH>
     </COLLECTION>
     <SYSTEM TYPE="Formulae" NAME="LedgerVchTypeFilter">$VoucherTypeName = "${escapeXml(voucherTypeName)}"</SYSTEM>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;
}

/**
 * A closing balance is "as at" a date, so this needs the period pinned for the
 * same reason the voucher collections do — see periodVariables. Without it the
 * balances come back for whatever period the company happens to be sitting on.
 */
export function buildStockExportRequest(company: string, fromDate: string, toDate: string): string {
  return `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>StockSummaryExport</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
    ${periodVariables(fromDate, toDate)}
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <REPORT NAME="StockSummaryExport">
      <FORMS>StockSummaryExport</FORMS>
     </REPORT>
     <FORM NAME="StockSummaryExport">
      <TOPPARTS>StockSummaryExport</TOPPARTS>
     </FORM>
     <PART NAME="StockSummaryExport">
      <TOPLINES>StockSummaryExport</TOPLINES>
      <REPEAT>StockSummaryExport : StockItemCollection</REPEAT>
      <SCROLLED>Vertical</SCROLLED>
     </PART>
     <LINE NAME="StockSummaryExport">
      <FIELDS>FldName, FldClosingQty, FldClosingRate, FldClosingValue</FIELDS>
     </LINE>
     <FIELD NAME="FldName"><SET>$Name</SET></FIELD>
     <FIELD NAME="FldClosingQty"><SET>$ClosingBalance</SET></FIELD>
     <FIELD NAME="FldClosingRate"><SET>$ClosingRate</SET></FIELD>
     <FIELD NAME="FldClosingValue"><SET>$ClosingValue</SET></FIELD>
     <COLLECTION NAME="StockItemCollection">
      <TYPE>StockItem</TYPE>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;
}
