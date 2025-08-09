import { getDocFromCollection, queryCollectionDocs, type FilterCondition } from './firestoreCrud';
import type { WhereFilterOp } from 'firebase/firestore';
import { formatCurrency, formatDate } from './formatters';

/**
 * Account types in the Chart of Accounts
 */
export enum AccountType {
  Asset = 'asset',
  Liability = 'liability',
  Equity = 'equity',
  Income = 'income',
  Expense = 'expense'
}

/**
 * Normal balance direction for each account type
 */
export enum NormalBalance {
  Debit = 'debit',
  Credit = 'credit'
}

/**
 * Financial statement classification
 */
export enum FSClassification {
  CurrentAsset = 'current-asset',
  NonCurrentAsset = 'non-current-asset',
  CurrentLiability = 'current-liability',
  NonCurrentLiability = 'non-current-liability',
  Equity = 'equity',
  Revenue = 'revenue',
  CostOfSales = 'cost-of-sales',
  OperatingExpense = 'operating-expense',
  OtherIncome = 'other-income',
  OtherExpense = 'other-expense',
  Tax = 'tax'
}

/**
 * Interface for account data
 */
export interface Account {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  fsClassification: FSClassification;
  isActive: boolean;
  parentId?: string;
  parentName?: string;
  glCode?: string;
  glName?: string;
  slCode?: string;
  slName?: string;
}

/**
 * Interface for journal entry data
 */
export interface JournalEntry {
  id: string;
  journalDate: Date | { seconds: number };
  referenceNo: string;
  description: string;
  sourceType: string;
  sourceId: string;
  totalDebit: number;
  totalCredit: number;
  isPosted: boolean;
  lines: JournalEntryLine[];
}

/**
 * Interface for journal entry line data
 */
export interface JournalEntryLine {
  lineNo: number;
  accountId: string;
  accountName: string;
  nameType?: string;
  nameId?: string;
  nameName?: string;
  lineDescription: string;
  debit: number;
  credit: number;
}

/**
 * Interface for account balance
 */
export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  fsClassification: FSClassification;
  debit: number;
  credit: number;
  balance: number;
  normalBalance: NormalBalance;
}

/**
 * Date range for reports
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Get all active accounts from the chart of accounts
 */
export async function getAllAccounts(): Promise<Account[]> {
  try {
    const filters: FilterCondition[] = [
      { field: 'isActive', operator: '==', value: true }
    ];
    
    const accounts = await queryCollectionDocs('masterlist/accounts', filters);
    
    return accounts as Account[];
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return [];
  }
}

/**
 * Get all journal entries within a date range
 */
export async function getJournalEntries(dateRange: DateRange): Promise<JournalEntry[]> {
  try {
    // Convert dates to Firestore timestamp compatible format
    const startDate = new Date(dateRange.startDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(dateRange.endDate);
    endDate.setHours(23, 59, 59, 999);
    
    // Query journal entries within the date range
    const filters: FilterCondition[] = [
      { field: 'journalDate', operator: '>=', value: startDate },
      { field: 'journalDate', operator: '<=', value: endDate },
      { field: 'isPosted', operator: '==', value: true }
    ];
    
    const journalEntries = await queryCollectionDocs('accounting/journalEntries', filters);
    
    return journalEntries as JournalEntry[];
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return [];
  }
}

/**
 * Get account balances for all accounts within a date range
 */
export async function getAccountBalances(dateRange: DateRange): Promise<AccountBalance[]> {
  try {
    // Get all accounts and journal entries
    const [accounts, journalEntries] = await Promise.all([
      getAllAccounts(),
      getJournalEntries(dateRange)
    ]);
    
    // Initialize account balances
    const accountBalances: { [accountId: string]: AccountBalance } = {};
    
    // Initialize all accounts with zero balances
    accounts.forEach(account => {
      // Determine normal balance for the account type
      let normalBalance = NormalBalance.Debit;
      
      switch (account.accountType) {
        case AccountType.Asset:
        case AccountType.Expense:
          normalBalance = NormalBalance.Debit;
          break;
        case AccountType.Liability:
        case AccountType.Equity:
        case AccountType.Income:
          normalBalance = NormalBalance.Credit;
          break;
      }
      
      accountBalances[account.id] = {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.accountType as AccountType,
        fsClassification: account.fsClassification as FSClassification,
        debit: 0,
        credit: 0,
        balance: 0,
        normalBalance
      };
    });
    
    // Process journal entries to calculate account balances
    journalEntries.forEach(journalEntry => {
      if (journalEntry.lines && Array.isArray(journalEntry.lines)) {
        journalEntry.lines.forEach(line => {
          if (accountBalances[line.accountId]) {
            accountBalances[line.accountId].debit += line.debit || 0;
            accountBalances[line.accountId].credit += line.credit || 0;
          }
        });
      }
    });
    
    // Calculate final balance based on normal balance direction
    Object.values(accountBalances).forEach(balance => {
      if (balance.normalBalance === NormalBalance.Debit) {
        balance.balance = balance.debit - balance.credit;
      } else {
        balance.balance = balance.credit - balance.debit;
      }
    });
    
    return Object.values(accountBalances);
  } catch (error) {
    console.error('Error calculating account balances:', error);
    return [];
  }
}

/**
 * Get data for Trial Balance report
 */
export async function getTrialBalanceData(dateRange: DateRange): Promise<{
  accounts: AccountBalance[];
  totalDebit: number;
  totalCredit: number;
}> {
  try {
    // Get account balances
    const accountBalances = await getAccountBalances(dateRange);
    
    // Filter accounts with non-zero balances
    const filteredAccounts = accountBalances.filter(
      account => Math.abs(account.balance) > 0.01
    );
    
    // Calculate total debits and credits for trial balance
    const totalDebit = filteredAccounts.reduce(
      (sum, account) => sum + (account.normalBalance === NormalBalance.Debit ? Math.abs(account.balance) : 0), 
      0
    );
    
    const totalCredit = filteredAccounts.reduce(
      (sum, account) => sum + (account.normalBalance === NormalBalance.Credit ? Math.abs(account.balance) : 0), 
      0
    );
    
    return {
      accounts: filteredAccounts,
      totalDebit,
      totalCredit
    };
  } catch (error) {
    console.error('Error generating Trial Balance:', error);
    return { accounts: [], totalDebit: 0, totalCredit: 0 };
  }
}

/**
 * Get data for Income Statement report
 */
export async function getIncomeStatementData(dateRange: DateRange): Promise<{
  revenues: AccountBalance[];
  costOfSales: AccountBalance[];
  operatingExpenses: AccountBalance[];
  otherIncome: AccountBalance[];
  otherExpenses: AccountBalance[];
  taxes: AccountBalance[];
  totalRevenue: number;
  totalCostOfSales: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  operatingIncome: number;
  totalOtherIncome: number;
  totalOtherExpenses: number;
  incomeBeforeTax: number;
  totalTaxes: number;
  netIncome: number;
}> {
  try {
    const accountBalances = await getAccountBalances(dateRange);
    
    // Filter accounts by classification
    const revenues = accountBalances.filter(account => 
      account.fsClassification === FSClassification.Revenue && account.balance !== 0
    );
    
    const costOfSales = accountBalances.filter(account => 
      account.fsClassification === FSClassification.CostOfSales && account.balance !== 0
    );
    
    const operatingExpenses = accountBalances.filter(account => 
      account.fsClassification === FSClassification.OperatingExpense && account.balance !== 0
    );
    
    const otherIncome = accountBalances.filter(account => 
      account.fsClassification === FSClassification.OtherIncome && account.balance !== 0
    );
    
    const otherExpenses = accountBalances.filter(account => 
      account.fsClassification === FSClassification.OtherExpense && account.balance !== 0
    );
    
    const taxes = accountBalances.filter(account => 
      account.fsClassification === FSClassification.Tax && account.balance !== 0
    );
    
    // Calculate totals
    const totalRevenue = revenues.reduce((sum, account) => sum + account.balance, 0);
    const totalCostOfSales = costOfSales.reduce((sum, account) => sum + account.balance, 0);
    const grossProfit = totalRevenue - totalCostOfSales;
    
    const totalOperatingExpenses = operatingExpenses.reduce((sum, account) => sum + account.balance, 0);
    const operatingIncome = grossProfit - totalOperatingExpenses;
    
    const totalOtherIncome = otherIncome.reduce((sum, account) => sum + account.balance, 0);
    const totalOtherExpenses = otherExpenses.reduce((sum, account) => sum + account.balance, 0);
    const incomeBeforeTax = operatingIncome + totalOtherIncome - totalOtherExpenses;
    
    const totalTaxes = taxes.reduce((sum, account) => sum + account.balance, 0);
    const netIncome = incomeBeforeTax - totalTaxes;
    
    return {
      revenues,
      costOfSales,
      operatingExpenses,
      otherIncome,
      otherExpenses,
      taxes,
      totalRevenue,
      totalCostOfSales,
      grossProfit,
      totalOperatingExpenses,
      operatingIncome,
      totalOtherIncome,
      totalOtherExpenses,
      incomeBeforeTax,
      totalTaxes,
      netIncome
    };
  } catch (error) {
    console.error('Error generating income statement data:', error);
    throw new Error('Failed to generate income statement data');
  }
}

/**
 * Interface for Aging Bucket
 */
export interface AgingBucket {
  name: string;
  amount: number;
}

/**
 * Interface for Aging Item
 */
export interface AgingItem {
  id: string;
  name: string;
  totalAmount: number;
  buckets: AgingBucket[];
  documents: {
    id: string;
    documentNo: string;
    date: Date;
    dueDate: Date;
    age: number;
    amount: number;
    bucketIndex: number;
  }[];
}

/**
 * Get data for Balance Sheet report
 */
export async function getBalanceSheetData(dateRange: DateRange): Promise<{
  currentAssets: AccountBalance[];
  nonCurrentAssets: AccountBalance[];
  currentLiabilities: AccountBalance[];
  nonCurrentLiabilities: AccountBalance[];
  equity: AccountBalance[];
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalAssets: number;
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
}> {
  try {
    const accountBalances = await getAccountBalances(dateRange);
    
    // Filter accounts by classification
    const currentAssets = accountBalances.filter(account => 
      account.fsClassification === FSClassification.CurrentAsset && account.balance !== 0
    );
    
    const nonCurrentAssets = accountBalances.filter(account => 
      account.fsClassification === FSClassification.NonCurrentAsset && account.balance !== 0
    );
    
    const currentLiabilities = accountBalances.filter(account => 
      account.fsClassification === FSClassification.CurrentLiability && account.balance !== 0
    );
    
    const nonCurrentLiabilities = accountBalances.filter(account => 
      account.fsClassification === FSClassification.NonCurrentLiability && account.balance !== 0
    );
    
    const equity = accountBalances.filter(account => 
      account.fsClassification === FSClassification.Equity && account.balance !== 0
    );
    
    // Calculate totals
    const totalCurrentAssets = currentAssets.reduce((sum, account) => sum + account.balance, 0);
    const totalNonCurrentAssets = nonCurrentAssets.reduce((sum, account) => sum + account.balance, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    
    const totalCurrentLiabilities = currentLiabilities.reduce((sum, account) => sum + account.balance, 0);
    const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((sum, account) => sum + account.balance, 0);
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
    
    const totalEquity = equity.reduce((sum, account) => sum + account.balance, 0);
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    
    return {
      currentAssets,
      nonCurrentAssets,
      currentLiabilities,
      nonCurrentLiabilities,
      equity,
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity
    };
  } catch (error) {
    console.error('Error generating balance sheet data:', error);
    throw new Error('Failed to generate balance sheet data');
  }
}

/**
 * Get data for Accounts Receivable Aging report
 */
export async function getARAgingData(asOfDate: Date): Promise<{
  customers: AgingItem[];
  buckets: string[];
  totals: number[];
  grandTotal: number;
}> {
  try {
    // Define aging buckets (in days)
    const buckets = ['Current', '1-30', '31-60', '61-90', '> 90'];
    const bucketRanges = [
      { min: 0, max: 0 },     // Current
      { min: 1, max: 30 },    // 1-30 days
      { min: 31, max: 60 },   // 31-60 days
      { min: 61, max: 90 },   // 61-90 days
      { min: 91, max: 9999 }  // > 90 days
    ];
    
    // Get all outstanding sales invoices
    const invoiceFilters: FilterCondition[] = [
      { field: 'status', operator: '==', value: 'Posted' },
      { field: 'isPaid', operator: '==', value: false }
    ];
    
    const invoices = await queryCollectionDocs('customerCenter/salesInvoices', invoiceFilters);
    
    // Get all customers
    const customers = await queryCollectionDocs('masterlist/customers');
    
    // Prepare customer map for quick lookup
    const customerMap: { [customerId: string]: any } = {};
    if (customers && Array.isArray(customers)) {
      customers.forEach((customer: any) => {
        customerMap[customer.id] = customer;
      });
    }
    
    // Process invoices and build aging data
    const customerAging: { [customerId: string]: AgingItem } = {};
    const totals = [0, 0, 0, 0, 0]; // Totals for each bucket
    let grandTotal = 0;
    
    if (invoices && Array.isArray(invoices)) {
      invoices.forEach((invoice: any) => {
        // Get invoice date and due date
        const invoiceDate = new Date(invoice.invoiceDate);
        const dueDate = new Date(invoice.dueDate);
        
        // Calculate age in days
        const ageInDays = Math.max(0, Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Determine bucket index
        let bucketIndex = 0;
        for (let i = 0; i < bucketRanges.length; i++) {
          if (ageInDays >= bucketRanges[i].min && ageInDays <= bucketRanges[i].max) {
            bucketIndex = i;
            break;
          }
        }
        
        // Get customer info
        const customerId = invoice.customer;
        const customer = customerMap[customerId] || { name: 'Unknown Customer' };
        
        // Calculate outstanding amount
        const outstandingAmount = invoice.totalAmount - (invoice.amountPaid || 0);
        if (outstandingAmount <= 0) return; // Skip if fully paid
        
        // Initialize customer aging if not exists
        if (!customerAging[customerId]) {
          customerAging[customerId] = {
            id: customerId,
            name: customer.name,
            totalAmount: 0,
            buckets: buckets.map(name => ({ name, amount: 0 })),
            documents: []
          };
        }
        
        // Add to customer's aging data
        customerAging[customerId].totalAmount += outstandingAmount;
        customerAging[customerId].buckets[bucketIndex].amount += outstandingAmount;
        customerAging[customerId].documents.push({
          id: invoice.id,
          documentNo: invoice.invoiceNo || `Invoice #${invoice.id}`,
          date: invoiceDate,
          dueDate: dueDate,
          age: ageInDays,
          amount: outstandingAmount,
          bucketIndex
        });
        
        // Add to totals
        totals[bucketIndex] += outstandingAmount;
        grandTotal += outstandingAmount;
      });
    }
    
    // Convert customer aging map to array and sort by total amount
    const customers_array = Object.values(customerAging);
    customers_array.sort((a, b) => b.totalAmount - a.totalAmount);
    
    return {
      customers: customers_array,
      buckets,
      totals,
      grandTotal
    };
  } catch (error) {
    console.error('Error generating accounts receivable aging data:', error);
    throw new Error('Failed to generate accounts receivable aging data');
  }
}

/**
 * Get data for Accounts Payable Aging report
 */
export async function getAPAgingData(asOfDate: Date): Promise<{
  vendors: AgingItem[];
  buckets: string[];
  totals: number[];
  grandTotal: number;
}> {
  try {
    // Define aging buckets (in days)
    const buckets = ['Current', '1-30', '31-60', '61-90', '> 90'];
    const bucketRanges = [
      { min: 0, max: 0 },     // Current
      { min: 1, max: 30 },    // 1-30 days
      { min: 31, max: 60 },   // 31-60 days
      { min: 61, max: 90 },   // 61-90 days
      { min: 91, max: 9999 }  // > 90 days
    ];
    
    // Get all outstanding APVs (bills)
    const billFilters: FilterCondition[] = [
      { field: 'status', operator: '==', value: 'Posted' },
      { field: 'isPaid', operator: '==', value: false }
    ];
    
    const bills = await queryCollectionDocs('vendorCenter/apvs', billFilters);
    
    // Get all vendors
    const vendors = await queryCollectionDocs('masterlist/vendors');
    
    // Prepare vendor map for quick lookup
    const vendorMap: { [vendorId: string]: any } = {};
    if (vendors && Array.isArray(vendors)) {
      vendors.forEach((vendor: any) => {
        vendorMap[vendor.id] = vendor;
      });
    }
    
    // Process bills and build aging data
    const vendorAging: { [vendorId: string]: AgingItem } = {};
    const totals = [0, 0, 0, 0, 0]; // Totals for each bucket
    let grandTotal = 0;
    
    if (bills && Array.isArray(bills)) {
      bills.forEach((bill: any) => {
        // Get bill date and due date
        const billDate = new Date(bill.billDate);
        const dueDate = new Date(bill.dueDate);
        
        // Calculate age in days
        const ageInDays = Math.max(0, Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Determine bucket index
        let bucketIndex = 0;
        for (let i = 0; i < bucketRanges.length; i++) {
          if (ageInDays >= bucketRanges[i].min && ageInDays <= bucketRanges[i].max) {
            bucketIndex = i;
            break;
          }
        }
        
        // Get vendor info
        const vendorId = bill.vendor;
        const vendor = vendorMap[vendorId] || { name: 'Unknown Vendor' };
        
        // Calculate outstanding amount
        const outstandingAmount = bill.totalAmount - (bill.amountPaid || 0);
        if (outstandingAmount <= 0) return; // Skip if fully paid
        
        // Initialize vendor aging if not exists
        if (!vendorAging[vendorId]) {
          vendorAging[vendorId] = {
            id: vendorId,
            name: vendor.name,
            totalAmount: 0,
            buckets: buckets.map(name => ({ name, amount: 0 })),
            documents: []
          };
        }
        
        // Add to vendor's aging data
        vendorAging[vendorId].totalAmount += outstandingAmount;
        vendorAging[vendorId].buckets[bucketIndex].amount += outstandingAmount;
        vendorAging[vendorId].documents.push({
          id: bill.id,
          documentNo: bill.billNo || `Bill #${bill.id}`,
          date: billDate,
          dueDate: dueDate,
          age: ageInDays,
          amount: outstandingAmount,
          bucketIndex
        });
        
        // Add to totals
        totals[bucketIndex] += outstandingAmount;
        grandTotal += outstandingAmount;
      });
    }
    
    // Convert vendor aging map to array and sort by total amount
    const vendors_array = Object.values(vendorAging);
    vendors_array.sort((a, b) => b.totalAmount - a.totalAmount);
    
    return {
      vendors: vendors_array,
      buckets,
      totals,
      grandTotal
    };
  } catch (error) {
    console.error('Error generating accounts payable aging data:', error);
    throw new Error('Failed to generate accounts payable aging data');
  }
}
