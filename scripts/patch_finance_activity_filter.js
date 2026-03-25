import fs from 'fs';

function patch() {
  const p = 'src/components/dashboard/FinanceDashboardApiPanel.jsx';
  let t = fs.readFileSync(p, 'utf8');

  const startMarker = '{dash.activity.slice(0, 8).map((item, i) => {';
  const s = t.indexOf(startMarker);
  if (s < 0) throw new Error(`Could not find activity start marker in ${p}`);

  const ulEnd = t.indexOf('</ul>', s);
  if (ulEnd < 0) throw new Error(`Could not find </ul> after activity start in ${p}`);

  const e = t.lastIndexOf('})}', ulEnd);
  if (e < 0) throw new Error(`Could not find activity expression end in ${p}`);

  const replacement = `{dash.activity
                .filter((item) => {
                  const title =
                    item?.title ??
                    item?.message ??
                    item?.description ??
                    item?.label ??
                    item?.type ??
                    (typeof item === 'string' ? item : '');
                  return !/export/i.test(String(title ?? ''));
                })
                .slice(0, 8)
                .map((item, i) => {
                  const title =
                    item.title ??
                    item.message ??
                    item.description ??
                    item.label ??
                    item.type ??
                    (typeof item === 'string' ? item : 'Entry');
                  const sub = item.subtitle ?? item.detail ?? item.ref ?? item.reference ?? '';
                  const key = item._id ?? item.id ?? i;
                  return (
                    <li key={key}>
                      <strong>{String(title)}</strong>
                      {sub ? <span className="finance-dash-activity-sub">{String(sub)}</span> : null}
                    </li>
                  );
                })}`;

  t = t.slice(0, s) + replacement + t.slice(e + 3);
  fs.writeFileSync(p, t, 'utf8');
}

patch();
console.log('patched finance activity export filter');

