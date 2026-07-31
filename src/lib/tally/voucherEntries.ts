/* eslint-disable @typescript-eslint/no-explicit-any -- iterates fast-xml-parser's inherently dynamic voucher XML shape. */
import {
  parseTallyXml,
  ensureArray,
  tallyText,
  tallyBool,
  parseTallyDate,
  parseTallyQuantityParts,
  parseTallyRate,
  tallyNumber,
} from './xml';
import { interCompanyPartyPattern } from './companies';

export interface TallyVoucherLineItem {
  /** Stable identity for the line: composite, because voucher numbers are not unique in Tally. */
  rowKey: string;
  sourceRowNumber: number;
  /** 1-based position of this inventory entry within its voucher. */
  lineIndex: number;
  date: Date | null;
  voucherNo: string;
  voucherType: string;
  party: string;
  itemName: string;
  /** Signed quantity in the entry's primary unit. */
  quantity: number;
  unit: string | null;
  /** Alternate unit half of a compound "288 KGS = 9 BAG" quantity. */
  altQuantity: number | null;
  altUnit: string | null;
  rate: number | null;
  /** Signed amount. Callers decide whether to take magnitude. */
  amount: number;
  isCancelled: boolean;
  isOptional: boolean;
  company: string;
  /** Counterparty is another group entity, so combined figures double-count it. */
  isInterCompany: boolean;
}

export interface VoucherExtraction {
  rows: TallyVoucherLineItem[];
  stats: {
    vouchers: number;
    /** Inventory entries seen in the XML, before any filtering. */
    inventoryEntries: number;
    /** Entries excluded, keyed by reason — nothing is dropped without being counted here. */
    rejected: Record<string, number>;
    cancelledVouchers: number;
    optionalVouchers: number;
    vouchersWithoutInventory: number;
    blankVoucherNumbers: number;
    interCompanyRows: number;
  };
}

/**
 * Builds a stable line identity. Tally voucher numbers are neither unique nor
 * guaranteed present — credit notes in this dataset collapse 157 vouchers into
 * 139 distinct numbers — so keying on voucherNo alone silently overwrites rows
 * on upsert. Date, type, party and line position disambiguate them.
 */
export function buildRowKey(
  company: string,
  voucherType: string,
  date: Date | null,
  voucherNo: string,
  party: string,
  lineIndex: number,
  itemName: string
): string {
  const datePart = date ? date.toISOString().slice(0, 10) : 'nodate';
  const voucherPart = voucherNo || 'novno';
  // Company leads the key: every company numbers its vouchers from 1, so keys
  // would collide across companies sharing a table.
  return [company, voucherType, datePart, voucherPart, party, lineIndex, itemName].join('|');
}

/**
 * Flattens a Tally Voucher collection XML export into one row per inventory line item.
 *
 * Cancelled and optional vouchers are flagged rather than dropped here, so the
 * reconciliation layer can show them explicitly instead of them vanishing.
 */
export function extractVoucherLineItems(xml: string, company = 'default'): VoucherExtraction {
  const obj = parseTallyXml(xml);
  const vouchers = ensureArray(obj?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER);
  const interCompanyRe = interCompanyPartyPattern();

  const rows: TallyVoucherLineItem[] = [];
  const rejected: Record<string, number> = {};
  let rowNum = 0;
  let inventoryEntries = 0;
  let cancelledVouchers = 0;
  let optionalVouchers = 0;
  let vouchersWithoutInventory = 0;
  let blankVoucherNumbers = 0;
  let interCompanyRows = 0;

  const reject = (reason: string) => {
    rejected[reason] = (rejected[reason] || 0) + 1;
  };

  vouchers.forEach((voucher: any) => {
    const date = parseTallyDate(voucher.DATE);
    const voucherNo = tallyText(voucher.VOUCHERNUMBER).trim();
    const voucherType = tallyText(voucher.VOUCHERTYPENAME).trim();
    const party = tallyText(voucher.PARTYLEDGERNAME).trim() || 'Unknown';
    const isCancelled = tallyBool(voucher.ISCANCELLED);
    const isOptional = tallyBool(voucher.ISOPTIONAL);
    const isInterCompany = interCompanyRe.test(party);

    if (isCancelled) cancelledVouchers += 1;
    if (isOptional) optionalVouchers += 1;
    if (!voucherNo) blankVoucherNumbers += 1;

    const entries = ensureArray(voucher['ALLINVENTORYENTRIES.LIST']);
    if (entries.length === 0) vouchersWithoutInventory += 1;

    entries.forEach((entry: any, i: number) => {
      inventoryEntries += 1;
      rowNum += 1;
      const lineIndex = i + 1;
      const itemName = tallyText(entry.STOCKITEMNAME).trim();

      if (!itemName) {
        reject('BLANK_STOCK_ITEM_NAME');
        return;
      }

      const qty = parseTallyQuantityParts(entry.BILLEDQTY ?? entry.ACTUALQTY);
      if (isInterCompany) interCompanyRows += 1;

      rows.push({
        rowKey: buildRowKey(company, voucherType, date, voucherNo, party, lineIndex, itemName),
        company,
        isInterCompany,
        sourceRowNumber: rowNum,
        lineIndex,
        date,
        voucherNo,
        voucherType,
        party,
        itemName,
        quantity: qty.primary.quantity,
        unit: qty.primary.unit,
        altQuantity: qty.secondary ? qty.secondary.quantity : null,
        altUnit: qty.secondary ? qty.secondary.unit : null,
        rate: parseTallyRate(entry.RATE),
        amount: tallyNumber(entry.AMOUNT),
        isCancelled,
        isOptional,
      });
    });
  });

  return {
    rows,
    stats: {
      vouchers: vouchers.length,
      inventoryEntries,
      rejected,
      cancelledVouchers,
      optionalVouchers,
      vouchersWithoutInventory,
      blankVoucherNumbers,
      interCompanyRows,
    },
  };
}
