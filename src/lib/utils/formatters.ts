/**
 * Utility functions for formatting values in the application
 */

/**
 * Format a number as currency (PHP)
 * @param value - Number to format
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '₱0.00';
  
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format a date to a readable string
 * @param date - Date to format (can be Date, Firestore timestamp, or null)
 * @returns Formatted date string
 */
export function formatDate(date: Date | { seconds: number; nanoseconds: number } | null | undefined): string {
  if (!date) return '-';
  
  // Convert Firestore timestamp to Date if needed
  let dateObj: Date;
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'object' && 'seconds' in date) {
    dateObj = new Date(date.seconds * 1000);
  } else {
    return '-';
  }
  
  // Format the date as YYYY-MM-DD
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a date as YYYY-MM-DD for input fields
 * @param date - Date to format
 * @returns Formatted date string for input fields
 */
export function formatDateForInput(date: Date | { seconds: number; nanoseconds: number } | null | undefined): string {
  if (!date) return '';
  
  // Convert Firestore timestamp to Date if needed
  let dateObj: Date;
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'object' && 'seconds' in date) {
    dateObj = new Date(date.seconds * 1000);
  } else {
    return '';
  }
  
  // Format as YYYY-MM-DD for input type="date"
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Format a number with specified decimal places
 * @param value - Number to format
 * @param decimalPlaces - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export function formatNumber(value: number | null | undefined, decimalPlaces: number = 2): string {
  if (value === null || value === undefined) return '0';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(value);
}

/**
 * Format a quantity with appropriate unit
 * @param quantity - Quantity to format
 * @param unit - Unit of measurement
 * @returns Formatted quantity with unit
 */
export function formatQuantity(quantity: number | null | undefined, unit: string = ''): string {
  if (quantity === null || quantity === undefined) return '0';
  
  const formattedQuantity = formatNumber(quantity, 2);
  return unit ? `${formattedQuantity} ${unit}` : formattedQuantity;
}
