export function normalizeItemName(original: string): string {
  if (!original) return '';

  let name = original.toLowerCase();

  // Replace multiple spaces with single space
  name = name.replace(/\s+/g, ' ');

  // Standardize units
  name = name.replace(/\b(kgs|kg|k\.g\.?)\b/g, 'kg');
  name = name.replace(/\b(pcs|pc|pieces|p\.c\.?)\b/g, 'pc');

  // Standardize multiplication
  name = name.replace(/(\d+)\s*([xX*])\s*(\d+)/g, '$1 x $3');
  name = name.replace(/([xX*])/g, ' x ');

  // Remove unsafe punctuation but keep hyphens, parentheses and numbers
  // Keep decimals for numbers
  name = name.replace(/[^\w\s\-\.\(\)]/g, '');

  // Trim and collapse spaces again
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}
