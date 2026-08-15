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

export const WITHHOLDING_TAX_OPTIONS: WithholdingTaxOption[] = [
  { label: 'Select Withholding Tax', value: '' },
  { label: '1%', value: '1' },
  { label: '2%', value: '2' }
];
