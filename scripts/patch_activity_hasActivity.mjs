import fs from 'fs';

const p = 'src/components/dashboard/FinanceDashboardApiPanel.jsx';
const path = p;
let t = fs.readFileSync(path, 'utf8');

const old = '  const hasActivity = dash.activity?.length > 0;';
if (!t.includes(old)) {
  console.error('Old hasActivity line not found');
  process.exit(1);
}

const neu = [
  '  const activityItems = useMemo(() => {',
  '    const items = Array.isArray(dash.activity) ? dash.activity : [];',
  '    return items.filter((item) => {',
  '      const title =',
  '        item?.title ??',
  '        item?.message ??',
  '        item?.description ??',
  '        item?.label ??',
  '        item?.type ??',
  '        (typeof item === \'string\' ? item : \'\');',
  '      const tt = String(title ?? \'\');',
  '      // Some payloads include helper/debug rows (export labels, login identity).',
  '      return !/export/i.test(tt) && !/login user/i.test(tt);',
  '    });',
  '  }, [dash.activity]);',
  '  const hasActivity = activityItems.length > 0;',
].join('\n');

t = t.replace(old, neu);
fs.writeFileSync(path, t, 'utf8');
console.log('patched hasActivity computation');

