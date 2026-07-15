import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatQuantity(val: number): string {
  if (val === 0) return '0 Kg';
  
  if (val >= 100000) {
    return (val / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' L Kg';
  }
  
  return val.toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Kg';
}

export function formatCurrencyINR(val: number): string {
  if (val === 0) return '₹0';

  if (val >= 10000000) {
    return '₹' + (val / 10000000).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr';
  }
  if (val >= 100000) {
    return '₹' + (val / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' L';
  }
  
  return '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatPercentage(val: number): string {
  return val.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%';
}

export function truncateText(str: string, maxLength: number): string {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}
