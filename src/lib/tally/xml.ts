/* eslint-disable @typescript-eslint/no-explicit-any -- fast-xml-parser's output shape is inherently dynamic (like JSON.parse); this file is the untyped parsing boundary. */
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) =>
    name === 'VOUCHER' ||
    name === 'ALLINVENTORYENTRIES.LIST' ||
    name === 'ALLLEDGERENTRIES.LIST' ||
    name === 'LEDGERENTRIES.LIST',
});

export function parseTallyXml(xml: string): any {
  return parser.parse(xml);
}

/** Normalises a fast-xml-parser node into an array, whether it was absent, a single object, or already an array. */
export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Extracts the text content of a Tally field node, which may be a plain scalar or an object with a #text/@_TYPE shape. */
export function tallyText(node: any): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'object') return node['#text'] !== undefined ? String(node['#text']) : '';
  return String(node);
}

/**
 * Tally renders amounts in Indian digit grouping ("1,23,456.78") in report-style
 * exports, so commas must be stripped before parseFloat — otherwise it stops at
 * the first separator and silently returns 1.
 */
export function tallyNumber(node: any): number {
  const text = tallyText(node).replace(/,/g, '').trim();
  const n = parseFloat(text);
  return isNaN(n) ? 0 : n;
}

/** Reads a Tally boolean field, which arrives as the literal text "Yes"/"No". */
export function tallyBool(node: any): boolean {
  return tallyText(node).trim().toLowerCase() === 'yes';
}

/** Parses a Tally date field (YYYYMMDD) into a JS Date. */
export function parseTallyDate(node: any): Date | null {
  const text = tallyText(node);
  if (!/^\d{8}$/.test(text)) return null;
  const year = parseInt(text.slice(0, 4), 10);
  const month = parseInt(text.slice(4, 6), 10) - 1;
  const day = parseInt(text.slice(6, 8), 10);
  return new Date(Date.UTC(year, month, day));
}

/**
 * Parses a Tally quantity string like " 288.000 KGS =  9 BAG" or "83 Pcs." into
 * { quantity, unit }, preferring the primary (first-listed) unit.
 *
 * Sign is preserved — Tally uses negative quantities for reversals, and callers
 * that need magnitude should take it deliberately rather than getting it here.
 */
export function parseTallyQuantity(node: any): { quantity: number; unit: string | null } {
  return parseTallyQuantityParts(node).primary;
}

export interface TallyQuantityPart {
  quantity: number;
  unit: string | null;
}

export interface TallyQuantityParts {
  primary: TallyQuantityPart;
  /** The alternate-unit half of a compound "288 KGS = 9 BAG" quantity, if present. */
  secondary: TallyQuantityPart | null;
  raw: string;
}

function parsePart(text: string): TallyQuantityPart {
  const match = text.trim().match(/^(-?[\d,]+(?:\.\d+)?)\s*([a-zA-Z.]+)?/);
  if (!match) return { quantity: 0, unit: null };
  return {
    quantity: parseFloat(match[1].replace(/,/g, '')),
    unit: normaliseUnit(match[2]),
  };
}

/**
 * Splits a compound Tally quantity into both of its unit expressions. Keeping the
 * alternate unit lets the pipeline report quantities per unit instead of summing
 * kilograms, pieces and bags into a single meaningless figure.
 */
export function parseTallyQuantityParts(node: any): TallyQuantityParts {
  const raw = tallyText(node).trim();
  const [primaryText, secondaryText] = raw.split('=');
  return {
    primary: parsePart(primaryText ?? ''),
    secondary: secondaryText !== undefined ? parsePart(secondaryText) : null,
    raw,
  };
}

/** Collapses Tally's unit spellings ("Pcs.", "pcs", "NOS") onto stable canonical keys. */
export function normaliseUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const cleaned = unit.replace(/\.+$/, '').trim().toUpperCase();
  if (!cleaned) return null;
  if (cleaned === 'KG' || cleaned === 'KGS') return 'KGS';
  if (cleaned === 'GM' || cleaned === 'GMS' || cleaned === 'G') return 'GMS';
  if (cleaned === 'PC' || cleaned === 'PCS' || cleaned === 'PIECE' || cleaned === 'PIECES') return 'PCS';
  if (cleaned === 'NO' || cleaned === 'NOS' || cleaned === 'NUM') return 'NOS';
  if (cleaned === 'BAG' || cleaned === 'BAGS') return 'BAG';
  if (cleaned === 'PKT' || cleaned === 'PKTS' || cleaned === 'PACKET' || cleaned === 'PACKETS') return 'PKT';
  return cleaned;
}

/** Parses a Tally rate string like "380.00/KGS" into its numeric component. */
export function parseTallyRate(node: any): number | null {
  const text = tallyText(node).trim();
  if (!text) return null;
  const match = text.match(/^(-?[\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ''));
}
