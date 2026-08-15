/**
 * Shared withholding-tax percentage options.
 *
 * Every transaction type with a real withholding concept in the accounting engine (Sales
 * Invoice, Credit Memo, APV — see accountingService.ts) rendered its own identical, independently
 * duplicated `[{label:'Select Withholding Tax',value:''},{label:'1%',value:'1'},{label:'2%',value:'2'}]`
 * array for FormFooter's `withholdingTaxOptions` prop. Transaction types without a withholding
 * concept (Receiving Report, Vendor Payment, Receive Payment) should pass FormFooter's
 * `showWithholding={false}` instead of wiring this up with nothing behind it.
 */

export interface WithholdingTaxOption {
  label: string;
  value: string;
}

// Common RR 2-98 (as amended) creditable withholding tax categories used in day-to-day PH
// bookkeeping. `value` is the plain percent every calc site already does parseFloat(value)/100
// against — several labels intentionally share the same value (e.g. two 2% categories), since
// the calc only cares about the rate, not which BIR category produced it.
export const WITHHOLDING_TAX_OPTIONS: WithholdingTaxOption[] = [
  { label: 'Select Withholding Tax', value: '' },
  { label: '1% - Purchase of Goods', value: '1' },
  { label: '2% - Purchase of Services', value: '2' },
  { label: '2% - Contractors (General Engineering/Building/Specialty)', value: '2' },
  { label: '5% - Rental (Real/Personal Property)', value: '5' },
  { label: '5% - Professional/Talent Fees (Individual, ≤₱3M gross)', value: '5' },
  { label: '10% - Professional/Talent Fees (Individual, >₱3M / Non-Individual, ≤₱720K)', value: '10' },
  { label: '10% - Commissions (Agents/Brokers)', value: '10' },
  { label: '15% - Professional/Talent Fees (Non-Individual, >₱720K)', value: '15' }
];
