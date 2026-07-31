/* eslint-disable @typescript-eslint/no-explicit-any -- iterates fast-xml-parser's inherently dynamic voucher XML shape. */
import { parseTallyXml, ensureArray, tallyText, tallyBool, tallyNumber, parseTallyDate } from './xml';
import { interCompanyPartyPattern } from './companies';

/**
 * Which ledgers count as revenue or purchase for reconciliation.
 *
 * Enumerating the Sales/Purchase Accounts groups via the Ledger collection is
 * unreliably slow on some Tally installs, so ledgers are classified by name
 * pattern instead. The defaults were verified against FY24-25: `/^purchase/i`
 * selects exactly the five purchase ledgers that sum to the Purchase Accounts
 * group total, and `/^sales/i` selects exactly the Sales ledger.
 *
 * Override via TALLY_SALES_LEDGER_PATTERN / TALLY_PURCHASE_LEDGER_PATTERN if a
 * company's chart of accounts names them differently.
 */
function ledgerPattern(envVar: string, fallback: RegExp): RegExp {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  try {
    return new RegExp(raw, 'i');
  } catch {
    console.warn(`[tally] ${envVar} is not a valid regular expression; using default.`);
    return fallback;
  }
}

export function salesLedgerPattern(): RegExp {
  return ledgerPattern('TALLY_SALES_LEDGER_PATTERN', /^sales/i);
}

export function purchaseLedgerPattern(): RegExp {
  return ledgerPattern('TALLY_PURCHASE_LEDGER_PATTERN', /^purchase/i);
}

export type AdjustmentKind = 'SALES' | 'PURCHASE';

export interface TallyLedgerAdjustment {
  rowKey: string;
  sourceRowNumber: number;
  date: Date | null;
  voucherNo: string;
  voucherType: string;
  party: string;
  ledgerName: string;
  kind: AdjustmentKind;
  /**
   * Signed as Tally stores it: credits are negative. Revenue and purchase
   * ledgers are credit-natured, so a normal posting arrives negative.
   */
  amount: number;
  narration: string;
  isCancelled: boolean;
  isOptional: boolean;
  company: string;
  isInterCompany: boolean;
}

export interface AdjustmentExtraction {
  adjustments: TallyLedgerAdjustment[];
  stats: {
    vouchers: number;
    ledgerEntries: number;
    matchedEntries: number;
    cancelledVouchers: number;
    optionalVouchers: number;
  };
}

/**
 * Pulls postings to revenue/purchase ledgers out of non-inventory vouchers
 * (Journals, and anything else fetched with ledger entries).
 *
 * Cancelled and optional vouchers are extracted but flagged, so the
 * reconciliation can exclude them visibly rather than them disappearing.
 */
export function extractLedgerAdjustments(xml: string, company = 'default'): AdjustmentExtraction {
  const obj = parseTallyXml(xml);
  const vouchers = ensureArray(obj?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER);

  const salesRe = salesLedgerPattern();
  const purchaseRe = purchaseLedgerPattern();
  const interCompanyRe = interCompanyPartyPattern();

  const adjustments: TallyLedgerAdjustment[] = [];
  let rowNum = 0;
  let ledgerEntries = 0;
  let cancelledVouchers = 0;
  let optionalVouchers = 0;

  vouchers.forEach((voucher: any) => {
    const date = parseTallyDate(voucher.DATE);
    const voucherNo = tallyText(voucher.VOUCHERNUMBER).trim();
    const voucherType = tallyText(voucher.VOUCHERTYPENAME).trim();
    const party = tallyText(voucher.PARTYLEDGERNAME).trim() || 'Unknown';
    const narration = tallyText(voucher.NARRATION).trim();
    const isCancelled = tallyBool(voucher.ISCANCELLED);
    const isOptional = tallyBool(voucher.ISOPTIONAL);

    if (isCancelled) cancelledVouchers += 1;
    if (isOptional) optionalVouchers += 1;

    const entries = [
      ...ensureArray(voucher['ALLLEDGERENTRIES.LIST']),
      ...ensureArray(voucher['LEDGERENTRIES.LIST']),
    ];

    entries.forEach((entry: any, i: number) => {
      ledgerEntries += 1;
      const ledgerName = tallyText(entry.LEDGERNAME).trim();
      if (!ledgerName) return;

      let kind: AdjustmentKind | null = null;
      if (salesRe.test(ledgerName)) kind = 'SALES';
      else if (purchaseRe.test(ledgerName)) kind = 'PURCHASE';
      if (!kind) return;

      rowNum += 1;
      const datePart = date ? date.toISOString().slice(0, 10) : 'nodate';
      adjustments.push({
        rowKey: [company, voucherType, datePart, voucherNo || 'novno', party, i + 1, ledgerName].join('|'),
        company,
        isInterCompany: interCompanyRe.test(party),
        sourceRowNumber: rowNum,
        date,
        voucherNo,
        voucherType,
        party,
        ledgerName,
        kind,
        amount: tallyNumber(entry.AMOUNT),
        narration,
        isCancelled,
        isOptional,
      });
    });
  });

  return {
    adjustments,
    stats: {
      vouchers: vouchers.length,
      ledgerEntries,
      matchedEntries: adjustments.length,
      cancelledVouchers,
      optionalVouchers,
    },
  };
}
