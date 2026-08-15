import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { CompanyProfile } from './companyProfileService';
import { formatCurrency, formatDate } from './formatters';

pdfMake.addVirtualFileSystem(vfs);

/**
 * Closes the "Output" gap (BLUEPRINT.md §8.1/§8.7) — the first real printable/PDF document this
 * app can produce. Client-side only (pdfmake ships its own font data via vfs_fonts, no server —
 * this app is a static SPA, adapter-static, §2.6), stamping the seller identity captured in
 * Company Profile (companyProfileService.ts) onto the actual document face BIR requires it on.
 */
export interface InvoicePdfLineItem {
  itemName: string;
  description: string;
  unitName: string;
  qty: number;
  price: number;
  amount: number;
}

export interface InvoicePdfData {
  invoiceNo: string;
  invoiceDate: Date | { seconds: number } | string;
  dueDate?: Date | { seconds: number } | string;
  customerName: string;
  customerAddress?: string;
  customerTin?: string;
  poNumber?: string;
  termsName?: string;
  paymentMethodName?: string;
  lineItems: InvoicePdfLineItem[];
  grossAmount: number;
  discount: number;
  netSales: number;
  vatableSales: number;
  zeroRated: number;
  vatExempt: number;
  vat: number;
  lessWithholding: number;
  totalDue: number;
}

function money(n: number | undefined): string {
  return formatCurrency(n || 0);
}

export function generateSalesInvoicePdf(invoice: InvoicePdfData, company: CompanyProfile): void {
  const sellerName = company.tradeName?.trim() ? `${company.registeredName} (${company.tradeName})` : company.registeredName;
  const vatStatusLabel = company.vatStatus === 'vat' ? 'VAT Registered' : 'Non-VAT';

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    content: [
      {
        columns: [
          [
            { text: sellerName || 'Registered Business Name Not Set', style: 'sellerName' },
            { text: company.registeredAddress || '', style: 'small' },
            { text: `TIN: ${company.tin || 'N/A'}${company.rdoCode ? '  RDO: ' + company.rdoCode : ''}`, style: 'small' },
            { text: vatStatusLabel, style: 'small', bold: true }
          ],
          [
            { text: 'SALES INVOICE', style: 'docTitle', alignment: 'right' },
            { text: `No. ${invoice.invoiceNo}`, style: 'docNo', alignment: 'right' },
            { text: `Date: ${formatDate(invoice.invoiceDate as any)}`, style: 'small', alignment: 'right' },
            ...(invoice.dueDate ? [{ text: `Due: ${formatDate(invoice.dueDate as any)}`, style: 'small', alignment: 'right' as const }] : [])
          ]
        ]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 10, x2: 515, y2: 10, lineWidth: 1 }] },
      {
        margin: [0, 12, 0, 12],
        columns: [
          [
            { text: 'Bill To', style: 'label' },
            { text: invoice.customerName, bold: true },
            ...(invoice.customerAddress ? [{ text: invoice.customerAddress, style: 'small' }] : []),
            ...(invoice.customerTin ? [{ text: `TIN: ${invoice.customerTin}`, style: 'small' }] : [])
          ],
          [
            ...(invoice.poNumber ? [{ text: `PO #: ${invoice.poNumber}`, style: 'small', alignment: 'right' as const }] : []),
            ...(invoice.termsName ? [{ text: `Terms: ${invoice.termsName}`, style: 'small', alignment: 'right' as const }] : []),
            ...(invoice.paymentMethodName ? [{ text: `Payment Method: ${invoice.paymentMethodName}`, style: 'small', alignment: 'right' as const }] : [])
          ]
        ]
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 40, 50, 60, 60],
          body: [
            [
              { text: 'Description', style: 'tableHeader' },
              { text: 'Qty', style: 'tableHeader', alignment: 'right' },
              { text: 'Unit', style: 'tableHeader' },
              { text: 'Price', style: 'tableHeader', alignment: 'right' },
              { text: 'Amount', style: 'tableHeader', alignment: 'right' }
            ],
            ...invoice.lineItems.map((li) => [
              { text: li.itemName ? `${li.itemName}${li.description ? ' - ' + li.description : ''}` : li.description, style: 'cell' },
              { text: String(li.qty), style: 'cell', alignment: 'right' as const },
              { text: li.unitName || '', style: 'cell' },
              { text: money(li.price), style: 'cell', alignment: 'right' as const },
              { text: money(li.amount), style: 'cell', alignment: 'right' as const }
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      },
      {
        margin: [0, 12, 0, 0],
        columns: [
          { text: '', width: '*' },
          {
            width: 220,
            table: {
              widths: ['*', 80],
              body: [
                ['Gross Amount', { text: money(invoice.grossAmount), alignment: 'right' }],
                ...(invoice.discount ? [['Discount', { text: money(invoice.discount), alignment: 'right' as const }]] : []),
                ['Net Sales', { text: money(invoice.netSales), alignment: 'right' }],
                ...(invoice.vatableSales ? [['VATable Sales', { text: money(invoice.vatableSales), alignment: 'right' as const }]] : []),
                ...(invoice.zeroRated ? [['Zero-Rated Sales', { text: money(invoice.zeroRated), alignment: 'right' as const }]] : []),
                ...(invoice.vatExempt ? [['VAT-Exempt Sales', { text: money(invoice.vatExempt), alignment: 'right' as const }]] : []),
                ['VAT (12%)', { text: money(invoice.vat), alignment: 'right' }],
                ...(invoice.lessWithholding ? [['Less: Withholding Tax', { text: '(' + money(invoice.lessWithholding) + ')', alignment: 'right' as const }]] : []),
                [{ text: 'Total Due', bold: true }, { text: money(invoice.totalDue), alignment: 'right', bold: true }]
              ]
            },
            layout: 'lightHorizontalLines'
          }
        ]
      },
      {
        margin: [0, 24, 0, 0],
        text:
          'This invoice is not valid for claim of input tax unless the seller is VAT-registered and this document bears the required BIR registration details. Generated by DigiSoft CAS.',
        style: 'footer'
      }
    ],
    styles: {
      sellerName: { fontSize: 13, bold: true },
      docTitle: { fontSize: 16, bold: true },
      docNo: { fontSize: 11, bold: true },
      small: { fontSize: 8, color: '#555555' },
      label: { fontSize: 8, color: '#888888', margin: [0, 0, 0, 2] },
      tableHeader: { fontSize: 9, bold: true, fillColor: '#f2f2f2' },
      cell: { fontSize: 9 },
      footer: { fontSize: 7, color: '#888888', italics: true }
    },
    defaultStyle: { fontSize: 9 }
  };

  pdfMake.createPdf(docDefinition).download(`${invoice.invoiceNo || 'invoice'}.pdf`);
}
