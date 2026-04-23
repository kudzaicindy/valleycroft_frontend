/**
 * Statement table cell: optional click to drill into underlying transactions.
 */
export default function StatementAmountCell({
  className = '',
  loading,
  hasData,
  rawValue,
  display,
  onDrill,
  alignClass = 'num',
  /** When false, a numeric zero is shown (display must be set) instead of treated as empty. */
  emptyIncludesZero = true,
}) {
  const cls = `${alignClass} ${className}`.trim();
  if (loading) {
    return <td className={cls}>…</td>;
  }
  const n = Number(rawValue);
  const empty =
    !hasData ||
    rawValue == null ||
    rawValue === '' ||
    Number.isNaN(n) ||
    (emptyIncludesZero && n === 0);
  if (empty) {
    return <td className={cls}>{display}</td>;
  }
  if (!onDrill) {
    return <td className={cls}>{display}</td>;
  }
  return (
    <td className={`${cls} acct-ui-td-drill`}>
      <button type="button" className="acct-ui-amount-drill" onClick={onDrill}>
        {display}
      </button>
    </td>
  );
}
