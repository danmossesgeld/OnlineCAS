import { getDocFromCollection, queryCollectionDocs, type FilterCondition } from './firestoreCrud';
import type { WhereFilterOp } from 'firebase/firestore';
import { formatCurrency, formatDate } from './formatters';
import { getAccountCategory } from './accountTypes';

/**
 * Account types in the Chart of Accounts
 */
export enum AccountType {
  Asset = 'asset',
  Liability = 'liability',
  Equity = 'equity',
  // NOTE: value is 'revenue', not 'income' — this matches the value the Chart of Accounts
  // form and the Items masterlist's income-account filter actually use throughout the app.
  Revenue = 'revenue',
  Expense = 'expense',
  Cogs = 'cogs'
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
    
    // Filter out entries without lines or with invalid lines
    const validEntries = journalEntries.filter((entry: any) => 
      entry && entry.lines && Array.isArray(entry.lines) && entry.lines.length > 0
    );
    
    return validEntries as JournalEntry[];
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
    const accountBalances: { [accountName: string]: AccountBalance } = {};
    
    // Initialize all accounts with zero balances
    accounts.forEach(account => {
      // Determine normal balance for the account type. account.accountType may be one of the
      // 6 broad legacy values this switch expects directly, OR (far more likely for any account
      // actually created through the Chart of Accounts form today) one of the granular
      // QuickBooks-style values — 'accounts-payable', 'bank', 'other-current-liability', etc. —
      // that never equal AccountType.Liability/.Asset/etc. by string comparison. Resolving
      // through getAccountCategory() first maps either shape down to the same 6 broad values
      // this switch already handles, so a Liability-category account can't silently fall through
      // to the Debit default and get its balance sign inverted in every report. See
      // accountTypes.ts for the full taxonomy.
      const category = getAccountCategory(account.accountType);
      let normalBalance = NormalBalance.Debit;

      switch (category) {
        case AccountType.Asset:
        case AccountType.Expense:
        case AccountType.Cogs:
          normalBalance = NormalBalance.Debit;
          break;
        case AccountType.Liability:
        case AccountType.Equity:
        case AccountType.Revenue:
          normalBalance = NormalBalance.Credit;
          break;
      }

      accountBalances[account.name] = {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: category as AccountType,
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
          // Try to find account by name first, then by ID
          const accountName = line.accountName;
          if (accountName && accountBalances[accountName]) {
            accountBalances[accountName].debit += line.debit || 0;
            accountBalances[accountName].credit += line.credit || 0;
          } else if (line.accountId && accountBalances[line.accountId]) {
            accountBalances[line.accountId].debit += line.debit || 0;
            accountBalances[line.accountId].credit += line.credit || 0;
          } else {
            // Create a new account balance entry if account not found
            const accountType = determineAccountTypeFromName(accountName || '');
            const fsClassification = determineFSClassificationFromName(accountName || '');
            
            if (!accountBalances[accountName || 'unknown']) {
              accountBalances[accountName || 'unknown'] = {
                accountId: line.accountId || 'unknown',
                accountCode: 'UNK',
                accountName: accountName || 'Unknown Account',
                accountType: accountType,
                fsClassification: fsClassification,
                debit: line.debit || 0,
                credit: line.credit || 0,
                balance: 0,
                normalBalance: accountType === AccountType.Asset || accountType === AccountType.Expense ? 
                  NormalBalance.Debit : NormalBalance.Credit
              };
            } else {
              accountBalances[accountName || 'unknown'].debit += line.debit || 0;
              accountBalances[accountName || 'unknown'].credit += line.credit || 0;
            }
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

// Helper function to determine account type from account name
function determineAccountTypeFromName(accountName: string): AccountType {
  const name = accountName.toLowerCase();
  if (name.includes('cash') || name.includes('bank') || name.includes('receivable') || 
      name.includes('inventory') || name.includes('asset')) {
    return AccountType.Asset;
  } else if (name.includes('payable') || name.includes('tax') || name.includes('loan') || 
             name.includes('liability')) {
    return AccountType.Liability;
  } else if (name.includes('equity') || name.includes('capital') || name.includes('retained')) {
    return AccountType.Equity;
  } else if (name.includes('revenue') || name.includes('sales') || name.includes('income')) {
    return AccountType.Revenue;
  } else if (name.includes('expense') || name.includes('cost')) {
    return AccountType.Expense;
  } else {
    return AccountType.Asset; // Default to asset
  }
}

// Helper function to determine FS classification from account name
function determineFSClassificationFromName(accountName: string): FSClassification {
  const name = accountName.toLowerCase();
  
  // Asset accounts
  if (name.includes('cash') || name.includes('bank') || name.includes('receivable') || 
      name.includes('inventory') || name.includes('prepaid')) {
    return FSClassification.CurrentAsset;
  }
  
  // Liability accounts
  if (name.includes('payable') || name.includes('tax') || name.includes('accrued') ||
      name.includes('loan') || name.includes('debt')) {
    return FSClassification.CurrentLiability;
  }
  
  // Equity accounts
  if (name.includes('equity') || name.includes('capital') || name.includes('retained') ||
      name.includes('earnings') || name.includes('stock') || name.includes('owner')) {
    return FSClassification.Equity;
  }
  
  // Revenue accounts
  if (name.includes('revenue') || name.includes('sales') || name.includes('income') ||
      name.includes('fees') || name.includes('commission')) {
    return FSClassification.Revenue;
  }
  
  // Cost of sales accounts
  if (name.includes('cost of sales') || name.includes('cogs') || name.includes('cost of goods') ||
      name.includes('direct cost') || name.includes('materials')) {
    return FSClassification.CostOfSales;
  }
  
  // Operating expense accounts
  if (name.includes('expense') || name.includes('cost') || name.includes('salary') ||
      name.includes('rent') || name.includes('utilities') || name.includes('advertising') ||
      name.includes('depreciation') || name.includes('amortization')) {
    return FSClassification.OperatingExpense;
  }
  
  // Tax accounts
  if (name.includes('vat') || name.includes('withholding') || name.includes('tax')) {
    return FSClassification.Tax;
  }
  
  // Default to current asset if no match found
  return FSClassification.CurrentAsset;
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
    let filteredAccounts = accountBalances.filter(
      account => Math.abs(account.balance) > 0.01
    );
    
    // Calculate total debits and credits for trial balance
    let totalDebit = filteredAccounts.reduce(
      (sum, account) => sum + account.debit, 
      0
    );
    
    let totalCredit = filteredAccounts.reduce(
      (sum, account) => sum + account.credit, 
      0
    );
    
    // Check if trial balance balances, if not, add retained earnings
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      // Trial balance doesn't balance, need to add retained earnings
      const retainedEarningsAmount = totalDebit - totalCredit;
      
      // Ensure retained earnings account exists
      const retainedEarningsAccountId = await ensureRetainedEarningsAccount();
      
      // Add retained earnings to trial balance
      const retainedEarningsAccount: AccountBalance = {
        accountId: retainedEarningsAccountId,
        accountCode: '3500',
        accountName: 'Retained Earnings',
        accountType: AccountType.Equity,
        fsClassification: FSClassification.Equity,
        debit: 0,
        credit: Math.max(0, retainedEarningsAmount),
        balance: retainedEarningsAmount,
        normalBalance: NormalBalance.Credit
      };
      
      filteredAccounts.push(retainedEarningsAccount);
      
      // Recalculate totals
      totalDebit = filteredAccounts.reduce((sum, account) => sum + account.debit, 0);
      totalCredit = filteredAccounts.reduce((sum, account) => sum + account.credit, 0);
    }
    
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
 * Ensure a retained earnings account exists in the chart of accounts
 */
async function ensureRetainedEarningsAccount(): Promise<string> {
  try {
    // Check if retained earnings account already exists
    const filters: FilterCondition[] = [
      { field: 'name', operator: '==', value: 'Retained Earnings' },
      { field: 'isActive', operator: '==', value: true }
    ];
    
    const existingAccounts = await queryCollectionDocs('masterlist/accounts', filters);
    
    if (existingAccounts && existingAccounts.length > 0) {
      return existingAccounts[0].id;
    }
    
    // Create retained earnings account if it doesn't exist
    const retainedEarningsData = {
      code: '3500',
      name: 'Retained Earnings',
      description: 'Accumulated net income/loss from previous periods',
      accountType: 'equity',
      fsClassification: 'equity',
      isActive: true,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const { addDocToCollection } = await import('./firestoreCrud');
    const newAccountRef = await addDocToCollection('masterlist/accounts', retainedEarningsData);
    
    // Extract the ID from the document reference
    const newAccountId = typeof newAccountRef === 'string' ? newAccountRef : newAccountRef.id;
    
    return newAccountId;
  } catch (error) {
    console.error('Error ensuring retained earnings account:', error);
    return 'retained-earnings'; // Fallback ID
  }
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
    
    // Check if balance sheet balances, if not, add retained earnings
    let adjustedTotalEquity = totalEquity;
    let adjustedEquity = [...equity];
    
    if (Math.abs(totalAssets - totalLiabilities - totalEquity) > 0.01) {
      // Balance sheet doesn't balance, need to add retained earnings
      const retainedEarningsAmount = totalAssets - totalLiabilities - totalEquity;
      
      // Ensure retained earnings account exists
      const retainedEarningsAccountId = await ensureRetainedEarningsAccount();
      
      // Add retained earnings to equity
      adjustedEquity.push({
        accountId: retainedEarningsAccountId,
        accountCode: '3500',
        accountName: 'Retained Earnings',
        accountType: AccountType.Equity,
        fsClassification: FSClassification.Equity,
        debit: 0,
        credit: Math.max(0, retainedEarningsAmount),
        balance: retainedEarningsAmount,
        normalBalance: NormalBalance.Credit
      });
      
      adjustedTotalEquity = totalEquity + retainedEarningsAmount;
    }
    
    const totalLiabilitiesAndEquity = totalLiabilities + adjustedTotalEquity;
    
    return {
      currentAssets,
      nonCurrentAssets,
      currentLiabilities,
      nonCurrentLiabilities,
      equity: adjustedEquity,
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      totalEquity: adjustedTotalEquity,
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
    
    // Get all journal entries for the current year
    const startOfYear = new Date(asOfDate.getFullYear(), 0, 1);
    const filters: FilterCondition[] = [
      { field: 'journalDate', operator: '>=', value: startOfYear },
      { field: 'journalDate', operator: '<=', value: asOfDate },
      { field: 'isPosted', operator: '==', value: true }
    ];
    
    const journalEntries = await queryCollectionDocs('accounting/journalEntries', filters);
    
    // Get all customers
    const customers = await queryCollectionDocs('masterlist/customers');
    
    // Prepare customer map for quick lookup
    const customerMap: { [customerId: string]: any } = {};
    if (customers && Array.isArray(customers)) {
      customers.forEach((customer: any) => {
        customerMap[customer.id] = customer;
      });
    }
    
    // Process journal entries and build aging data
    const customerAging: { [customerId: string]: AgingItem } = {};
    const totals = [0, 0, 0, 0, 0]; // Totals for each bucket
    let grandTotal = 0;
    
    if (journalEntries && Array.isArray(journalEntries)) {
      journalEntries.forEach((entry: any) => {
        if (entry.lines && Array.isArray(entry.lines)) {
          entry.lines.forEach((line: any) => {
            // Look for receivable accounts
            if (line.accountName && line.accountName.toLowerCase().includes('receivable')) {
              const customerId = entry.customer || entry.customerId || 'unknown';
              const customer = customerMap[customerId] || { name: customerId };
              
              // Get entry date
              const entryDate = entry.journalDate?.seconds ? 
                new Date(entry.journalDate.seconds * 1000) : new Date();
              
              // Calculate age in days (simplified - use entry date)
              const ageInDays = Math.max(0, Math.floor((asOfDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
              
              // Determine bucket index
              let bucketIndex = 0;
              for (let i = 0; i < bucketRanges.length; i++) {
                if (ageInDays >= bucketRanges[i].min && ageInDays <= bucketRanges[i].max) {
                  bucketIndex = i;
                  break;
                }
              }
              
              // Calculate amount (receivables are typically debit balances)
              const amount = line.debit > 0 ? line.debit : line.credit;
              
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
              customerAging[customerId].totalAmount += amount;
              customerAging[customerId].buckets[bucketIndex].amount += amount;
              customerAging[customerId].documents.push({
                id: entry.id || entry.documentId || '',
                documentNo: entry.referenceNo || entry.documentNo || `JE-${entry.id}`,
                date: entryDate,
                dueDate: entryDate, // Use entry date as due date for simplicity
                age: ageInDays,
                amount: amount,
                bucketIndex: bucketIndex
              });
              
              // Update totals
              totals[bucketIndex] += amount;
              grandTotal += amount;
            }
          });
        }
      });
    }
    
    return {
      customers: Object.values(customerAging),
      buckets,
      totals,
      grandTotal
    };
  } catch (error) {
    console.error('Error generating AR aging data:', error);
    return {
      customers: [],
      buckets: ['Current', '1-30', '31-60', '61-90', '> 90'],
      totals: [0, 0, 0, 0, 0],
      grandTotal: 0
    };
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
    
    // Get all journal entries for the current year
    const startOfYear = new Date(asOfDate.getFullYear(), 0, 1);
    const filters: FilterCondition[] = [
      { field: 'journalDate', operator: '>=', value: startOfYear },
      { field: 'journalDate', operator: '<=', value: asOfDate },
      { field: 'isPosted', operator: '==', value: true }
    ];
    
    const journalEntries = await queryCollectionDocs('accounting/journalEntries', filters);
    
    // Get all vendors
    const vendors = await queryCollectionDocs('masterlist/vendors');
    
    // Prepare vendor map for quick lookup
    const vendorMap: { [vendorId: string]: any } = {};
    if (vendors && Array.isArray(vendors)) {
      vendors.forEach((vendor: any) => {
        vendorMap[vendor.id] = vendor;
      });
    }
    
    // Process journal entries and build aging data
    const vendorAging: { [vendorId: string]: AgingItem } = {};
    const totals = [0, 0, 0, 0, 0]; // Totals for each bucket
    let grandTotal = 0;
    
    if (journalEntries && Array.isArray(journalEntries)) {
      journalEntries.forEach((entry: any) => {
        if (entry.lines && Array.isArray(entry.lines)) {
          entry.lines.forEach((line: any) => {
            // Look for payable accounts
            if (line.accountName && line.accountName.toLowerCase().includes('payable')) {
              const vendorId = entry.vendor || entry.vendorId || 'unknown';
              const vendor = vendorMap[vendorId] || { name: vendorId };
              
              // Get entry date
              const entryDate = entry.journalDate?.seconds ? 
                new Date(entry.journalDate.seconds * 1000) : new Date();
              
              // Calculate age in days (simplified - use entry date)
              const ageInDays = Math.max(0, Math.floor((asOfDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
              
              // Determine bucket index
              let bucketIndex = 0;
              for (let i = 0; i < bucketRanges.length; i++) {
                if (ageInDays >= bucketRanges[i].min && ageInDays <= bucketRanges[i].max) {
                  bucketIndex = i;
                  break;
                }
              }
              
              // Calculate amount (payables are typically credit balances)
              const amount = line.credit > 0 ? line.credit : line.debit;
              
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
              vendorAging[vendorId].totalAmount += amount;
              vendorAging[vendorId].buckets[bucketIndex].amount += amount;
              vendorAging[vendorId].documents.push({
                id: entry.id || entry.documentId || '',
                documentNo: entry.referenceNo || entry.documentNo || `JE-${entry.id}`,
                date: entryDate,
                dueDate: entryDate, // Use entry date as due date for simplicity
                age: ageInDays,
                amount: amount,
                bucketIndex: bucketIndex
              });
              
              // Update totals
              totals[bucketIndex] += amount;
              grandTotal += amount;
            }
          });
        }
      });
    }
    
    return {
      vendors: Object.values(vendorAging),
      buckets,
      totals,
      grandTotal
    };
  } catch (error) {
    console.error('Error generating AP aging data:', error);
    return {
      vendors: [],
      buckets: ['Current', '1-30', '31-60', '61-90', '> 90'],
      totals: [0, 0, 0, 0, 0],
      grandTotal: 0
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Statutory books: General Ledger, Sales Journal, Purchase Journal, Cash Receipts/Disbursements
// Journal — the report formats a BIR CAS Acknowledgment Certificate application asks for sample
// output of (BLUEPRINT.md §8.4). All built on getJournalEntries(dateRange), already the shared
// base every other report in this file uses.
// ---------------------------------------------------------------------------------------------

function toJsDate(date: Date | { seconds: number } | string | undefined): Date {
  if (!date) return new Date(0);
  if (date instanceof Date) return date;
  if (typeof date === 'object' && 'seconds' in date) return new Date(date.seconds * 1000);
  return new Date(date);
}

/**
 * General Ledger — every journal-entry line in the range, grouped by account (standard GL
 * presentation — an interleaved single date-sorted feed across every account at once isn't how
 * a real ledger reads, since each account's running balance would jump around next to
 * unrelated accounts' balances), chronological within each account, each group opening with a
 * "Beginning Balance" line carried forward from all posted activity *before* the range rather
 * than resetting to zero at the period start. Normal-balance direction resolved the same way
 * getAccountBalances does, via getAccountCategory so granular QuickBooks-style account types
 * don't fall through to the debit default.
 */
export interface GeneralLedgerLine {
  date: Date;
  referenceNo: string;
  description: string;
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
  isBeginningBalance?: boolean;
}

function resolveNormalBalanceIsDebit(
  accountId: string,
  accountName: string,
  accountsById: Map<string, Account>,
  accountsByName: Map<string, Account>
): boolean {
  const account = accountsById.get(accountId) || accountsByName.get(accountName);
  const category = account ? getAccountCategory(account.accountType) : determineAccountTypeFromName(accountName);
  return category === AccountType.Asset || category === AccountType.Expense || category === AccountType.Cogs;
}

export async function getGeneralLedgerData(dateRange: DateRange, accountId?: string): Promise<{
  lines: GeneralLedgerLine[];
  accounts: Account[];
}> {
  try {
    const dayBeforeStart = new Date(dateRange.startDate);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

    const [accounts, journalEntries, priorEntries] = await Promise.all([
      getAllAccounts(),
      getJournalEntries(dateRange),
      getJournalEntries({ startDate: new Date(0), endDate: dayBeforeStart })
    ]);
    const accountsById = new Map(accounts.map((a) => [a.id, a]));
    const accountsByName = new Map(accounts.map((a) => [a.name, a]));
    const filterAccount = accountId ? accountsById.get(accountId) : undefined;

    type Raw = { date: Date; referenceNo: string; description: string; accountId: string; accountName: string; debit: number; credit: number };

    function matchesFilter(lineAccountId: string, lineAccountName: string): boolean {
      if (filterAccount) return lineAccountId === filterAccount.id || lineAccountName === filterAccount.name;
      if (accountId) return lineAccountId === accountId;
      return true;
    }

    // Beginning balance per account: every posted entry strictly before the range, summed.
    const beginningBalance: Record<string, number> = {};
    priorEntries.forEach((entry) => {
      (entry.lines || []).forEach((line) => {
        if (!matchesFilter(line.accountId, line.accountName)) return;
        const key = line.accountId || line.accountName;
        const isDebitNormal = resolveNormalBalanceIsDebit(line.accountId, line.accountName, accountsById, accountsByName);
        const delta = isDebitNormal ? (line.debit || 0) - (line.credit || 0) : (line.credit || 0) - (line.debit || 0);
        beginningBalance[key] = (beginningBalance[key] || 0) + delta;
      });
    });

    const raw: Raw[] = [];
    journalEntries.forEach((entry) => {
      (entry.lines || []).forEach((line) => {
        if (!matchesFilter(line.accountId, line.accountName)) return;
        raw.push({
          date: toJsDate(entry.journalDate),
          referenceNo: entry.referenceNo,
          description: line.lineDescription || entry.description,
          accountId: line.accountId,
          accountName: line.accountName,
          debit: line.debit || 0,
          credit: line.credit || 0
        });
      });
    });

    // Group by account (code, falling back to name) so each account's activity reads together;
    // chronological within each group. A single account filter makes this a no-op (one group).
    raw.sort((a, b) => {
      const accA = accountsById.get(a.accountId) || accountsByName.get(a.accountName);
      const accB = accountsById.get(b.accountId) || accountsByName.get(b.accountName);
      const groupA = accA?.code || a.accountName;
      const groupB = accB?.code || b.accountName;
      if (groupA !== groupB) return groupA.localeCompare(groupB, undefined, { numeric: true });
      return a.date.getTime() - b.date.getTime();
    });

    const runningBalance: Record<string, number> = { ...beginningBalance };
    const seenKeys = new Set<string>();
    const lines: GeneralLedgerLine[] = [];

    raw.forEach((r) => {
      const key = r.accountId || r.accountName;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        lines.push({
          date: dateRange.startDate,
          referenceNo: '',
          description: 'Beginning Balance',
          accountId: r.accountId,
          accountName: r.accountName,
          debit: 0,
          credit: 0,
          balance: runningBalance[key] || 0,
          isBeginningBalance: true
        });
      }
      const isDebitNormal = resolveNormalBalanceIsDebit(r.accountId, r.accountName, accountsById, accountsByName);
      const delta = isDebitNormal ? r.debit - r.credit : r.credit - r.debit;
      runningBalance[key] = (runningBalance[key] || 0) + delta;
      lines.push({ ...r, balance: runningBalance[key] });
    });

    return { lines, accounts };
  } catch (error) {
    console.error('Error generating General Ledger data:', error);
    return { lines: [], accounts: [] };
  }
}

export interface SalesJournalRow {
  date: Date;
  invoiceNo: string;
  customerName: string;
  vatableSales: number;
  zeroRated: number;
  vatExempt: number;
  vat: number;
  total: number;
}

/** Sales Journal — one row per posted Sales Invoice in range, pulling the canonical stored
 * VAT-breakdown fields from the invoice itself (not re-derived from journal-line text — the
 * journal entry's own referenceNo is an unrelated JE-<timestamp> string, not the invoice
 * number; BLUEPRINT.md §5.3/§8.4). */
export async function getSalesJournalData(dateRange: DateRange): Promise<{ rows: SalesJournalRow[]; totals: Omit<SalesJournalRow, 'date' | 'invoiceNo' | 'customerName'> }> {
  try {
    const journalEntries = await getJournalEntries(dateRange);
    const salesEntries = journalEntries.filter((e) => e.sourceType === 'salesInvoice' && e.sourceId);

    const rows = (
      await Promise.all(
        salesEntries.map(async (entry) => {
          const invoice: any = await getDocFromCollection('customerCenter/salesInvoices', entry.sourceId);
          if (!invoice) return null;
          const row: SalesJournalRow = {
            date: toJsDate(invoice.invoiceDate || entry.journalDate),
            invoiceNo: invoice.invoiceNo || entry.referenceNo,
            customerName: invoice.customerName || 'Unknown',
            vatableSales: invoice.vatableSales || 0,
            zeroRated: invoice.zeroRated || 0,
            vatExempt: invoice.vatExempt || 0,
            vat: invoice.vat || 0,
            total: invoice.totalDue || 0
          };
          return row;
        })
      )
    ).filter((r): r is SalesJournalRow => r !== null);

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totals = rows.reduce(
      (acc, r) => ({
        vatableSales: acc.vatableSales + r.vatableSales,
        zeroRated: acc.zeroRated + r.zeroRated,
        vatExempt: acc.vatExempt + r.vatExempt,
        vat: acc.vat + r.vat,
        total: acc.total + r.total
      }),
      { vatableSales: 0, zeroRated: 0, vatExempt: 0, vat: 0, total: 0 }
    );

    return { rows, totals };
  } catch (error) {
    console.error('Error generating Sales Journal data:', error);
    return { rows: [], totals: { vatableSales: 0, zeroRated: 0, vatExempt: 0, vat: 0, total: 0 } };
  }
}

export interface PurchaseJournalRow {
  date: Date;
  apvNo: string;
  vendorName: string;
  netAmount: number;
  vat: number;
  total: number;
}

/** Purchase Journal — one row per posted APV in range, joined back to
 * transactions/vendorCenter/apvs for apvNo/supplierName/netAmount/vat/totalAmountDue (APV has no
 * vatable/zero-rated/exempt split field the way Sales Invoice does — see BLUEPRINT.md §3.4 — so
 * this only reports the flat net/VAT/total APV already computes). */
export async function getPurchaseJournalData(dateRange: DateRange): Promise<{ rows: PurchaseJournalRow[]; totals: Omit<PurchaseJournalRow, 'date' | 'apvNo' | 'vendorName'> }> {
  try {
    const journalEntries = await getJournalEntries(dateRange);
    const apvEntries = journalEntries.filter((e) => e.sourceType === 'apv' && e.sourceId);

    const rows = (
      await Promise.all(
        apvEntries.map(async (entry) => {
          const apv: any = await getDocFromCollection('vendorCenter/apvs', entry.sourceId);
          if (!apv) return null;
          const row: PurchaseJournalRow = {
            date: toJsDate(apv.apvDate || entry.journalDate),
            apvNo: apv.apvNo || entry.referenceNo,
            vendorName: apv.supplierName || 'Unknown',
            netAmount: apv.netAmount || 0,
            vat: apv.vat || 0,
            total: apv.totalAmountDue || 0
          };
          return row;
        })
      )
    ).filter((r): r is PurchaseJournalRow => r !== null);

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totals = rows.reduce(
      (acc, r) => ({ netAmount: acc.netAmount + r.netAmount, vat: acc.vat + r.vat, total: acc.total + r.total }),
      { netAmount: 0, vat: 0, total: 0 }
    );

    return { rows, totals };
  } catch (error) {
    console.error('Error generating Purchase Journal data:', error);
    return { rows: [], totals: { netAmount: 0, vat: 0, total: 0 } };
  }
}

export interface CashJournalRow {
  date: Date;
  documentNo: string;
  name: string; // customer or vendor
  account: string; // the offsetting (non-cash/bank) account this row's cash amount hit
  amount: number;
}

/** Finds the journal-entry line most likely to be the "other side" of a cash movement — i.e.
 * not the Cash/Bank line itself — by the same name-substring heuristic already used elsewhere
 * in this file (determineAccountTypeFromName, getARAgingData's "receivable" match). Falls back
 * to the first non-zero line on the requested side if nothing matches. */
function findOffsettingAccountName(lines: JournalEntryLine[], side: 'credit' | 'debit'): string {
  const candidates = lines.filter((l) => (side === 'credit' ? l.credit > 0 : l.debit > 0));
  const nonCash = candidates.find((l) => !/cash|bank/i.test(l.accountName || ''));
  return (nonCash || candidates[0])?.accountName || 'Unknown';
}

/** Cash Receipts Journal — one row per posted customer Receipt in range: date, receipt #,
 * customer, the offsetting (non-cash) account credited, amount. */
export async function getCashReceiptsJournalData(dateRange: DateRange): Promise<{ rows: CashJournalRow[]; total: number }> {
  try {
    const journalEntries = await getJournalEntries(dateRange);
    const receiptEntries = journalEntries.filter((e) => e.sourceType === 'receipt' && e.sourceId);

    const rows = (
      await Promise.all(
        receiptEntries.map(async (entry) => {
          const receipt: any = await getDocFromCollection('customerCenter/receipts', entry.sourceId);
          if (!receipt) return null;
          const row: CashJournalRow = {
            date: toJsDate(receipt.receiptDate || entry.journalDate),
            documentNo: receipt.receiptNo || entry.referenceNo,
            name: receipt.customerName || 'Unknown',
            account: findOffsettingAccountName(entry.lines || [], 'credit'),
            amount: receipt.amount || 0
          };
          return row;
        })
      )
    ).filter((r): r is CashJournalRow => r !== null);

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    return { rows, total };
  } catch (error) {
    console.error('Error generating Cash Receipts Journal data:', error);
    return { rows: [], total: 0 };
  }
}

/** Cash Disbursements Journal — one row per posted Vendor Payment in range: date, voucher #,
 * vendor, the offsetting (non-cash) account debited, amount. */
export async function getCashDisbursementsJournalData(dateRange: DateRange): Promise<{ rows: CashJournalRow[]; total: number }> {
  try {
    const journalEntries = await getJournalEntries(dateRange);
    const paymentEntries = journalEntries.filter((e) => e.sourceType === 'payment' && e.sourceId);

    const rows = (
      await Promise.all(
        paymentEntries.map(async (entry) => {
          const payment: any = await getDocFromCollection('vendorCenter/payments', entry.sourceId);
          if (!payment) return null;
          const row: CashJournalRow = {
            date: toJsDate(payment.paymentDate || entry.journalDate),
            documentNo: payment.paymentNo || entry.referenceNo,
            name: payment.vendorName || 'Unknown',
            account: findOffsettingAccountName(entry.lines || [], 'debit'),
            amount: payment.amount || 0
          };
          return row;
        })
      )
    ).filter((r): r is CashJournalRow => r !== null);

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    return { rows, total };
  } catch (error) {
    console.error('Error generating Cash Disbursements Journal data:', error);
    return { rows: [], total: 0 };
  }
}
