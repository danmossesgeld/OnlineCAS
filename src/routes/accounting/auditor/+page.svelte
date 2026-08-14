<script lang="ts">
  import { onMount } from 'svelte';
  import { queryCollectionDocs } from '$lib/utils/firestoreCrud';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';

  interface AuditResult {
    category: string;
    issues: AuditIssue[];
    totalCount: number;
    issueCount: number;
  }

  interface AuditIssue {
    id: string;
    documentNo?: string;
    name?: string;
    issue: string;
    severity: 'high' | 'medium' | 'low';
  }

  let auditResults: AuditResult[] = [];
  let isLoading = true;
  let lastAuditDate: Date | null = null;
  let showTransactionJournal = false;
  let transactionJournal: any[] = [];
  let journalLoading = false;

  onMount(async () => {
    await runAudit();
  });

  async function runAudit() {
    isLoading = true;
    auditResults = [];
    
    try {
      // Run all audit checks
      const [
        journalEntriesAudit,
        salesInvoicesAudit,
        apvsAudit,
        accountsAudit,
        customersAudit,
        vendorsAudit,
        itemsAudit,
        chartOfAccountsConsistencyAudit,
        accountCodeSuggestions
      ] = await Promise.all([
        auditJournalEntries(),
        auditSalesInvoices(),
        auditAPVs(),
        auditAccounts(),
        auditCustomers(),
        auditVendors(),
        auditItems(),
        auditChartOfAccountsConsistency(),
        suggestAccountCodes()
      ]);

      auditResults = [
        journalEntriesAudit,
        salesInvoicesAudit,
        apvsAudit,
        accountsAudit,
        customersAudit,
        vendorsAudit,
        itemsAudit,
        chartOfAccountsConsistencyAudit,
        accountCodeSuggestions
      ].filter(result => result.issues.length > 0);

      lastAuditDate = new Date();
    } catch (error) {
      console.error('Audit failed:', error);
    } finally {
      isLoading = false;
    }
  }

  async function auditJournalEntries(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const journalEntries = await queryCollectionDocs('accounting/journalEntries');
      
      journalEntries.forEach((entry: any) => {
        if (!entry.lines || !Array.isArray(entry.lines) || entry.lines.length === 0) {
          issues.push({
            id: entry.id,
            documentNo: entry.referenceNo,
            issue: 'Missing or invalid journal entry lines',
            severity: 'high'
          });
        } else {
          // Check for lines without required fields
          entry.lines.forEach((line: any, index: number) => {
            if (!line.accountId || !line.accountName) {
              issues.push({
                id: entry.id,
                documentNo: entry.referenceNo,
                issue: `Line ${index + 1} missing accountId or accountName`,
                severity: 'high'
              });
            }
            if (line.debit === undefined || line.credit === undefined) {
              issues.push({
                id: entry.id,
                documentNo: entry.referenceNo,
                issue: `Line ${index + 1} missing debit or credit amounts`,
                severity: 'high'
              });
            }
          });

          // Check if journal entry is balanced
          const totalDebit = entry.lines.reduce((sum: number, line: any) => sum + (line.debit || 0), 0);
          const totalCredit = entry.lines.reduce((sum: number, line: any) => sum + (line.credit || 0), 0);
          
          if (Math.abs(totalDebit - totalCredit) > 0.01) {
            issues.push({
              id: entry.id,
              documentNo: entry.referenceNo,
              issue: `Journal entry not balanced. Debits: ${totalDebit}, Credits: ${totalCredit}, Difference: ${totalDebit - totalCredit}`,
              severity: 'high'
            });
          }

          // Check for accounts that don't exist in chart of accounts
          entry.lines.forEach((line: any, index: number) => {
            if (line.accountName && line.accountName.includes('Unknown Account')) {
              issues.push({
                id: entry.id,
                documentNo: entry.referenceNo,
                issue: `Line ${index + 1} references unknown account: "${line.accountName}". Account may not exist in chart of accounts.`,
                severity: 'medium'
              });
            }
          });
        }

        if (!entry.journalDate) {
          issues.push({
            id: entry.id,
            documentNo: entry.referenceNo,
            issue: 'Missing journal date',
            severity: 'medium'
          });
        }

        if (entry.isPosted === undefined) {
          issues.push({
            id: entry.id,
            documentNo: entry.referenceNo,
            issue: 'Missing isPosted flag',
            severity: 'medium'
          });
        }

        // Check for duplicate reference numbers
        const duplicateRefs = journalEntries.filter((je: any) => je.referenceNo === entry.referenceNo);
        if (duplicateRefs.length > 1) {
          issues.push({
            id: entry.id,
            documentNo: entry.referenceNo,
            issue: `Duplicate reference number found. ${duplicateRefs.length} entries use this reference.`,
            severity: 'high'
          });
        }
      });

      return {
        category: 'Journal Entries',
        issues,
        totalCount: journalEntries.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Journal entries audit failed:', error);
      return {
        category: 'Journal Entries',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function auditSalesInvoices(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const invoices = await queryCollectionDocs('customerCenter/salesInvoices');
      
      invoices.forEach((invoice: any) => {
        if (!invoice.customer) {
          issues.push({
            id: invoice.id,
            documentNo: invoice.invoiceNo || invoice.documentNo,
            issue: 'Missing customer reference',
            severity: 'high'
          });
        }

        if (!invoice.invoiceDate) {
          issues.push({
            id: invoice.id,
            documentNo: invoice.invoiceNo || invoice.documentNo,
            issue: 'Missing invoice date',
            severity: 'medium'
          });
        }

        if (!invoice.dueDate) {
          issues.push({
            id: invoice.id,
            documentNo: invoice.invoiceNo || invoice.documentNo,
            issue: 'Missing due date',
            severity: 'medium'
          });
        }

        // Check for valid status values
        const validStatuses = ['Posted', 'Paid', 'Draft', 'Unpaid'];
        if (!invoice.status || !validStatuses.includes(invoice.status)) {
          issues.push({
            id: invoice.id,
            documentNo: invoice.invoiceNo || invoice.documentNo,
            issue: `Invalid status: "${invoice.status}". Expected one of: ${validStatuses.join(', ')}`,
            severity: 'medium'
          });
        }

        // Check if status is appropriate for aging reports
        if (invoice.status === 'Draft') {
          issues.push({
            id: invoice.id,
            documentNo: invoice.invoiceNo || invoice.documentNo,
            issue: 'Status is "Draft" - should be "Posted" or "Paid" for proper aging',
            severity: 'low'
          });
        }

        if (!invoice.totalAmount && !invoice.netSales) {
          issues.push({
            id: invoice.id,
            documentNo: invoice.invoiceNo || invoice.documentNo,
            issue: 'Missing total amount',
            severity: 'high'
          });
        }
      });

      return {
        category: 'Sales Invoices',
        issues,
        totalCount: invoices.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Sales invoices audit failed:', error);
      return {
        category: 'Sales Invoices',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function auditAPVs(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const apvs = await queryCollectionDocs('vendorCenter/apvs');
      
      apvs.forEach((apv: any) => {
        if (!apv.vendor) {
          issues.push({
            id: apv.id,
            documentNo: apv.billNo || apv.documentNo,
            issue: 'Missing vendor reference',
            severity: 'high'
          });
        }

        if (!apv.billDate) {
          issues.push({
            id: apv.id,
            documentNo: apv.billNo || apv.documentNo,
            issue: 'Missing bill date',
            severity: 'medium'
          });
        }

        if (!apv.dueDate) {
          issues.push({
            id: apv.id,
            documentNo: apv.billNo || apv.documentNo,
            issue: 'Missing due date',
            severity: 'medium'
          });
        }

        // Check for valid status values
        const validStatuses = ['Posted', 'Paid', 'Draft', 'Unpaid'];
        if (!apv.status || !validStatuses.includes(apv.status)) {
          issues.push({
            id: apv.id,
            documentNo: apv.billNo || apv.documentNo,
            issue: `Invalid status: "${apv.status}". Expected one of: ${validStatuses.join(', ')}`,
            severity: 'medium'
          });
        }

        // Check if status is appropriate for aging reports
        if (apv.status === 'Draft') {
          issues.push({
            id: apv.id,
            documentNo: apv.billNo || apv.documentNo,
            issue: 'Status is "Draft" - should be "Posted" or "Paid" for proper aging',
            severity: 'low'
          });
        }

        if (!apv.totalAmount && !apv.netAmount) {
          issues.push({
            id: apv.id,
            documentNo: apv.billNo || apv.documentNo,
            issue: 'Missing total amount',
            severity: 'high'
          });
        }
      });

      return {
        category: 'APVs (Bills)',
        issues,
        totalCount: apvs.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('APVs audit failed:', error);
      return {
        category: 'APVs (Bills)',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function auditAccounts(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const accounts = await queryCollectionDocs('masterlist/accounts');
      
      accounts.forEach((account: any) => {
        // Check for missing account codes
        if (!account.code || account.code.trim() === '') {
          issues.push({
            id: account.id,
            name: account.name,
            issue: 'Missing account code',
            severity: 'high'
          });
        }

        // Check for duplicate account codes
        const duplicateCodes = accounts.filter((acc: any) => acc.code === account.code);
        if (duplicateCodes.length > 1) {
          issues.push({
            id: account.id,
            name: account.name,
            issue: `Duplicate account code "${account.code}" found. ${duplicateCodes.length} accounts use this code.`,
            severity: 'high'
          });
        }

        // Check for missing account types
        if (!account.accountType) {
          issues.push({
            id: account.id,
            name: account.name,
            issue: 'Missing account type',
            severity: 'high'
          });
        }

        // Check for missing financial statement classification
        if (!account.fsClassification) {
          issues.push({
            id: account.id,
            name: account.name,
            issue: 'Missing financial statement classification',
            severity: 'medium'
          });
        }

        // Check for inactive accounts that might be referenced in transactions
        if (account.isActive === false) {
          issues.push({
            id: account.id,
            name: account.name,
            issue: 'Account is marked as inactive - may cause issues if referenced in transactions',
            severity: 'low'
          });
        }
      });

      return {
        category: 'Chart of Accounts',
        issues,
        totalCount: accounts.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Accounts audit failed:', error);
      return {
        category: 'Chart of Accounts',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function auditChartOfAccountsConsistency(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const [accounts, journalEntries] = await Promise.all([
        queryCollectionDocs('masterlist/accounts'),
        queryCollectionDocs('accounting/journalEntries')
      ]);

      // Create a set of account names from chart of accounts
      const chartAccountNames = new Set(accounts.map((acc: any) => acc.name.toLowerCase()));
      
      // Check journal entries for accounts not in chart of accounts
      const missingAccounts = new Set<string>();
      
      journalEntries.forEach((entry: any) => {
        if (entry.lines && Array.isArray(entry.lines)) {
          entry.lines.forEach((line: any) => {
            if (line.accountName && !chartAccountNames.has(line.accountName.toLowerCase())) {
              missingAccounts.add(line.accountName);
            }
          });
        }
      });

      // Create issues for missing accounts
      missingAccounts.forEach(accountName => {
        issues.push({
          id: 'missing-account',
          name: accountName,
          issue: `Account "${accountName}" is referenced in journal entries but not found in chart of accounts`,
          severity: 'high'
        });
      });

      return {
        category: 'Chart of Accounts Consistency',
        issues,
        totalCount: accounts.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Chart of accounts consistency audit failed:', error);
      return {
        category: 'Chart of Accounts Consistency',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function auditCustomers(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const customers = await queryCollectionDocs('masterlist/customers');
      
      customers.forEach((customer: any) => {
        if (!customer.name) {
          issues.push({
            id: customer.id,
            issue: 'Missing customer name',
            severity: 'high'
          });
        }

        if (!customer.code) {
          issues.push({
            id: customer.id,
            name: customer.name,
            issue: 'Missing customer code',
            severity: 'medium'
          });
        }

        if (customer.is_active === undefined) {
          issues.push({
            id: customer.id,
            name: customer.name,
            issue: 'Missing is_active flag',
            severity: 'low'
          });
        }
      });

      return {
        category: 'Customers',
        issues,
        totalCount: customers.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Customers audit failed:', error);
      return {
        category: 'Customers',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function auditVendors(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const vendors = await queryCollectionDocs('masterlist/vendors');
      
      vendors.forEach((vendor: any) => {
        if (!vendor.name) {
          issues.push({
            id: vendor.id,
            issue: 'Missing vendor name',
            severity: 'high'
          });
        }

        if (!vendor.code) {
          issues.push({
            id: vendor.id,
            name: vendor.name,
            issue: 'Missing vendor code',
            severity: 'medium'
          });
        }

        if (vendor.is_active === undefined) {
          issues.push({
            id: vendor.id,
            name: vendor.name,
            issue: 'Missing is_active flag',
            severity: 'low'
          });
        }
      });

      return {
        category: 'Vendors',
        issues,
        totalCount: vendors.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Vendors audit failed:', error);
      return {
        category: 'Vendors',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function auditItems(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const items = await queryCollectionDocs('masterlist/items');
      
      items.forEach((item: any) => {
        if (!item.name) {
          issues.push({
            id: item.id,
            issue: 'Missing item name',
            severity: 'high'
          });
        }

        if (!item.code) {
          issues.push({
            id: item.id,
            name: item.name,
            issue: 'Missing item code',
            severity: 'medium'
          });
        }

        if (item.is_active === undefined) {
          issues.push({
            id: item.id,
            name: item.name,
            issue: 'Missing is_active flag',
            severity: 'low'
          });
        }

        // Check for sales price with multiple possible field names
        const salesPrice = item.sales_price || item.salesPrice || item.price || item.unitPrice || item.retailPrice || item.sellingPrice;
        if (salesPrice === undefined || salesPrice === null || salesPrice === '') {
          issues.push({
            id: item.id,
            name: item.name,
            issue: 'Missing sales price (checked: sales_price, salesPrice, price, unitPrice, retailPrice, sellingPrice)',
            severity: 'medium'
          });
        }
      });

      return {
        category: 'Items',
        issues,
        totalCount: items.length,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Items audit failed:', error);
      return {
        category: 'Items',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function suggestAccountCodes(): Promise<AuditResult> {
    const issues: AuditIssue[] = [];
    
    try {
      const [accounts, journalEntries] = await Promise.all([
        queryCollectionDocs('masterlist/accounts'),
        queryCollectionDocs('accounting/journalEntries')
      ]);

      // Find accounts referenced in journal entries but not in chart of accounts
      const referencedAccounts = new Set<string>();
      
      journalEntries.forEach((entry: any) => {
        if (entry.lines && Array.isArray(entry.lines)) {
          entry.lines.forEach((line: any) => {
            if (line.accountName) {
              referencedAccounts.add(line.accountName);
            }
          });
        }
      });

      // Check for missing accounts
      const chartAccountNames = new Set(accounts.map((acc: any) => acc.name));
      
      referencedAccounts.forEach(accountName => {
        if (!chartAccountNames.has(accountName)) {
          // Suggest a code based on account type
          let suggestedCode = '';
          const name = accountName.toLowerCase();
          
          if (name.includes('cash')) suggestedCode = '1000';
          else if (name.includes('bank')) suggestedCode = '1100';
          else if (name.includes('receivable')) suggestedCode = '1200';
          else if (name.includes('inventory')) suggestedCode = '1300';
          else if (name.includes('payable')) suggestedCode = '2000';
          else if (name.includes('tax')) suggestedCode = '2100';
          else if (name.includes('equity') || name.includes('capital')) suggestedCode = '3000';
          else if (name.includes('revenue') || name.includes('sales')) suggestedCode = '4000';
          else if (name.includes('expense') || name.includes('cost')) suggestedCode = '5000';
          else suggestedCode = '9999';
          
          issues.push({
            id: 'missing-account',
            name: accountName,
            issue: `Account "${accountName}" needs to be added to chart of accounts. Suggested code: ${suggestedCode}`,
            severity: 'high'
          });
        }
      });

      return {
        category: 'Account Code Suggestions',
        issues,
        totalCount: referencedAccounts.size,
        issueCount: issues.length
      };
    } catch (error) {
      console.error('Account code suggestions failed:', error);
      return {
        category: 'Account Code Suggestions',
        issues: [],
        totalCount: 0,
        issueCount: 0
      };
    }
  }

  async function loadTransactionJournal() {
    journalLoading = true;
    try {
      const journalEntries = await queryCollectionDocs('accounting/journalEntries');
      
      // Sort by date and add balance validation
      transactionJournal = journalEntries.map((entry: any) => {
        const totalDebit = entry.lines?.reduce((sum: number, line: any) => sum + (line.debit || 0), 0) || 0;
        const totalCredit = entry.lines?.reduce((sum: number, line: any) => sum + (line.credit || 0), 0) || 0;
        const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
        
        return {
          ...entry,
          totalDebit,
          totalCredit,
          isBalanced,
          balanceDifference: totalDebit - totalCredit,
          journalDate: entry.journalDate?.seconds ? new Date(entry.journalDate.seconds * 1000) : new Date()
        };
      }).sort((a: any, b: any) => b.journalDate - a.journalDate);
      
    } catch (error) {
      console.error('Failed to load transaction journal:', error);
    } finally {
      journalLoading = false;
    }
  }

  function toggleTransactionJournal() {
    showTransactionJournal = !showTransactionJournal;
    if (showTransactionJournal && transactionJournal.length === 0) {
      loadTransactionJournal();
    }
  }

  function getSeverityColorVar(severity: string): string {
    switch (severity) {
      case 'high': return '--color-error-600';
      case 'medium': return '--color-warning-600';
      case 'low': return '--color-primary-600';
      default: return '--color-neutral-500';
    }
  }

  function getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🔵';
      default: return '⚪';
    }
  }
</script>

<svelte:head>
  <title>Data Auditor - Digisoft CAS</title>
</svelte:head>

<FormLayout title="Data Auditor">
  <div class="mb-4">
    <h2 class="text-lg font-semibold mb-2" style="color: var(--color-neutral-800);">Review data quality and identify missing fields</h2>
    <p style="color: var(--color-neutral-600);">Click 'Run Audit' to analyze your data for missing or invalid fields</p>
  </div>

  <FormSection title="Audit Results">
    <div class="mb-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex gap-4">
          <button
            on:click={runAudit}
            disabled={isLoading}
            class="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style="background: var(--color-primary-600);"
          >
            {isLoading ? 'Running Audit...' : 'Run Audit'}
          </button>

          <button
            on:click={toggleTransactionJournal}
            class="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
            style="background: var(--color-success-600);"
          >
            {showTransactionJournal ? 'Hide' : 'Show'} Transaction Journal
          </button>
        </div>

        {#if lastAuditDate}
          <div class="text-sm" style="color: var(--color-neutral-600);">
            Last audit: {formatDate(lastAuditDate)}
          </div>
        {/if}
      </div>

      {#if showTransactionJournal}
        <div class="mb-6 rounded-lg border overflow-hidden" style="border-color: var(--color-neutral-200);">
          <div class="px-4 py-3" style="background: var(--color-neutral-50); border-bottom: 1px solid var(--color-neutral-200);">
            <h3 class="text-lg font-medium" style="color: var(--color-neutral-800);">Transaction Journal</h3>
            <p class="text-sm" style="color: var(--color-neutral-600);">Review journal entries and their balance status</p>
          </div>

          {#if journalLoading}
            <div class="p-4 text-center" style="color: var(--color-neutral-600);">Loading transaction journal...</div>
          {:else if transactionJournal.length === 0}
            <div class="p-4 text-center" style="color: var(--color-neutral-600);">No journal entries found.</div>
          {:else}
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Date</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Reference</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
                    <th class="px-4 py-3 text-right text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Debits</th>
                    <th class="px-4 py-3 text-right text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Credits</th>
                    <th class="px-4 py-3 text-center text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {#each transactionJournal as entry}
                    <tr class="transition-colors hover:[background:var(--color-primary-50)]">
                      <td class="px-4 py-3" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                        {formatDate(entry.journalDate)}
                      </td>
                      <td class="px-4 py-3 font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                        {entry.referenceNo}
                      </td>
                      <td class="px-4 py-3" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                        {entry.description}
                      </td>
                      <td class="px-4 py-3 text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                        {formatCurrency(entry.totalDebit)}
                      </td>
                      <td class="px-4 py-3 text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                        {formatCurrency(entry.totalCredit)}
                      </td>
                      <td class="px-4 py-3 text-center" style="border-bottom: 1px solid var(--color-neutral-100);">
                        {#if entry.isBalanced}
                          <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full" style="color: var(--color-success-600); background: color-mix(in srgb, var(--color-success-600) 14%, transparent);">
                            Balanced
                          </span>
                        {:else}
                          <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full" style="color: var(--color-error-600); background: color-mix(in srgb, var(--color-error-600) 14%, transparent);">
                            Unbalanced
                          </span>
                        {/if}
                      </td>
                    </tr>
                    {#if !entry.isBalanced}
                      <tr>
                        <td colspan="6" class="px-4 py-2 text-xs" style="background: var(--color-error-50); color: var(--color-error-700); border-bottom: 1px solid var(--color-neutral-100);">
                          <strong>Balance Difference:</strong> {formatCurrency(entry.balanceDifference)}
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/if}

      {#if auditResults.length === 0 && !isLoading}
        <div class="text-center py-8" style="color: var(--color-neutral-500);">
          {#if lastAuditDate}
            No data quality issues found. Your data is clean.
          {:else}
            Click "Run Audit" to start analyzing your data.
          {/if}
        </div>
      {/if}

      {#each auditResults as result}
        <div class="mb-6 rounded-lg border overflow-hidden" style="border-color: var(--color-neutral-200);">
          <div class="px-4 py-3" style="background: var(--color-neutral-50); border-bottom: 1px solid var(--color-neutral-200);">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-medium" style="color: var(--color-neutral-800);">{result.category}</h3>
              <div class="flex items-center gap-4">
                <span class="text-sm" style="color: var(--color-neutral-600);">
                  {result.issueCount} of {result.totalCount} records have issues
                </span>
                <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full" style="color: var(--color-error-600); background: color-mix(in srgb, var(--color-error-600) 14%, transparent);">
                  {Math.round((result.issueCount / result.totalCount) * 100)}% issue rate
                </span>
              </div>
            </div>
          </div>

          <div>
            {#each result.issues as issue, idx}
              {@const severityColor = getSeverityColorVar(issue.severity)}
              <div
                class="px-4 py-3 transition-colors hover:[background:var(--color-neutral-50)]"
                style="border-top: 1px solid var(--color-neutral-100); {idx === 0 ? 'border-top: none;' : ''}"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-sm">{getSeverityIcon(issue.severity)}</span>
                      <span
                        class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                        style={`color: var(${severityColor}); background: color-mix(in srgb, var(${severityColor}) 14%, transparent);`}
                      >
                        {issue.severity.toUpperCase()}
                      </span>
                    </div>
                    <p class="text-sm mb-1" style="color: var(--color-neutral-800);">{issue.issue}</p>
                    <div class="text-xs flex flex-wrap gap-x-2" style="color: var(--color-neutral-500);">
                      {#if issue.documentNo}
                        <span>Document: {issue.documentNo}</span>
                      {/if}
                      {#if issue.name}
                        <span>Name: {issue.name}</span>
                      {/if}
                      <span>ID: {issue.id}</span>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </FormSection>

  <div class="mt-6 p-4 rounded-lg" style="background: var(--color-neutral-50);">
    <div class="text-sm" style="color: var(--color-neutral-600);">
      <p><strong>Severity Levels:</strong></p>
      <ul class="list-disc list-inside mt-1 space-y-1">
        <li><span style="color: var(--color-error-600);">🔴 High:</span> Critical issues that may prevent reports from working</li>
        <li><span style="color: var(--color-warning-600);">🟡 Medium:</span> Important issues that may affect data accuracy</li>
        <li><span style="color: var(--color-primary-600);">🔵 Low:</span> Minor issues that don't affect core functionality</li>
      </ul>
    </div>
  </div>
</FormLayout>
