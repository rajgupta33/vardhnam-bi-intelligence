function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
    <SVFROMDATE>${escapeXml(fromDate)}</SVFROMDATE>
    <SVTODATE>${escapeXml(toDate)}</SVTODATE>
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
    <SVFROMDATE>${escapeXml(fromDate)}</SVFROMDATE>
    <SVTODATE>${escapeXml(toDate)}</SVTODATE>
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

export function buildStockExportRequest(company: string): string {
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
