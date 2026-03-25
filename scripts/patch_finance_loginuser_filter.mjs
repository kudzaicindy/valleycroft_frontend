import fs from 'fs';

const file = 'src/components/dashboard/FinanceDashboardApiPanel.jsx';
const path = file;
let t = fs.readFileSync(path, 'utf8');

// Match the exact filter line we currently have in FinanceDashboardApiPanel.
// Example line:
//   return !/export/i.test(String(title ?? ''));
const re = /^(\s*)return !\/export\/i\.test\(String\(title \?\? ''\)\);\s*$/m;
const match = re.exec(t);
if (!match) {
  throw new Error(`Could not find expected LoginUser filter line in ${path}`);
}

const indent = match[1];
const replacement = [
  `${indent}const t = String(title ?? '');`,
  `${indent}// Some payloads include helper/debug rows (export labels, login identity).`,
  `${indent}return !/export/i.test(t) && !/login user/i.test(t);`,
].join('\n');

t = t.replace(re, replacement);

fs.writeFileSync(path, t, 'utf8');
console.log('patched login user activity filter');

