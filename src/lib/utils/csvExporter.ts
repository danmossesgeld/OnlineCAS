/**
 * CSV Export utility for masterlist data
 * Provides functions to export Firestore collections to CSV format
 */

import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { app } from '$lib/utils/firebase';

export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
}

/**
 * Convert array of objects to CSV string
 * @param data Array of objects to convert
 * @param columns Column definitions for export
 * @returns CSV string
 */
export function convertToCSV(data: any[], columns: ExportColumn[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  // Create header row
  const headers = columns.map(col => col.label);
  const csvRows = [headers.join(',')];

  // Create data rows
  for (const item of data) {
    const row = columns.map(col => {
      let value = item[col.key];
      
      // Apply formatting if provided
      if (col.format && value !== undefined && value !== null) {
        value = col.format(value);
      }
      
      // Handle null/undefined values
      if (value === null || value === undefined) {
        value = '';
      }
      
      // Convert to string and escape quotes
      const stringValue = String(value);
      
      // If value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
      }
      
      return stringValue;
    });
    
    csvRows.push(row.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Download CSV file
 * @param csvContent CSV string content
 * @param filename Filename for download
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export Firestore collection to CSV
 * @param collectionPath Path to Firestore collection
 * @param columns Column definitions for export
 * @param filename Filename for download
 * @param orderByField Field to order by (optional)
 */
export async function exportFirestoreCollectionToCSV(
  collectionPath: string,
  columns: ExportColumn[],
  filename: string,
  orderByField?: string
): Promise<void> {
  try {
    const db = getFirestore(app);
    const collectionRef = collection(db, collectionPath);
    
    // Create query with optional ordering
    let dataQuery = query(collectionRef);
    if (orderByField) {
      dataQuery = query(collectionRef, orderBy(orderByField));
    }
    
    // Get data
    const snapshot = await getDocs(dataQuery);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    if (data.length === 0) {
      alert('No data to export');
      return;
    }
    
    // Convert to CSV and download
    const csvContent = convertToCSV(data, columns);
    downloadCSV(csvContent, filename);
    
  } catch (error) {
    console.error('Export error:', error);
    alert('Failed to export data: ' + (error as Error).message);
  }
}

/**
 * Export nested Firestore collection to CSV
 * @param rootCollection Root collection name
 * @param parentCollection Parent collection name  
 * @param subCollectionName Sub-collection name
 * @param columns Column definitions for export
 * @param filename Filename for download
 * @param orderByField Field to order by (optional)
 */
export async function exportNestedFirestoreCollectionToCSV(
  rootCollection: string,
  parentCollection: string,
  subCollectionName: string,
  columns: ExportColumn[],
  filename: string,
  orderByField?: string
): Promise<void> {
  const collectionPath = `${rootCollection}/${parentCollection}/${subCollectionName}`;
  return exportFirestoreCollectionToCSV(collectionPath, columns, filename, orderByField);
}
