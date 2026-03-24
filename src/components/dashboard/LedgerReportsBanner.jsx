/** Explains ledger vs transaction-based finance statements */
export default function LedgerReportsBanner() {
  return (
    <div className="finance-ledger-banner" role="note">
      <div className="finance-ledger-banner-title">
        <i className="fas fa-book" aria-hidden />
        Ledger-based accounting
      </div>
      <p>
        Figures on this page come from <strong>/api/accounting</strong> (posted journals). They can differ from{' '}
        <strong>Statements (transaction-based)</strong> in the nav — see each section for the date range you select.
      </p>
    </div>
  );
}
