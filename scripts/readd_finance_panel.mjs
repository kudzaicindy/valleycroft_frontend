import fs from 'fs';

const file = 'src/components/dashboard/ExecutiveHomeDashboard.jsx';
let t = fs.readFileSync(file, 'utf8');

if (!t.includes('FinanceDashboardApiPanel')) {
  // Add import after the first react-router import.
  t = t.replace(
    "import { Link } from 'react-router-dom';\r\n\r\n",
    "import { Link } from 'react-router-dom';\r\n" +
      "import FinanceDashboardApiPanel from '@/components/dashboard/FinanceDashboardApiPanel';\r\n\r\n",
  );
}

if (!t.includes('<FinanceDashboardApiPanel basePath={c.basePath} />')) {
  const needle = '<div className="hero-banner">';
  const idx = t.indexOf(needle);
  if (idx === -1) throw new Error('hero-banner not found');

  const lineStart = t.lastIndexOf('\r\n', idx) + 2;
  const line = t.slice(lineStart, idx);
  const indentMatch = line.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '      ';

  const insertBlock =
    `${indent}{(variant === 'finance' || variant === 'ceo' || variant === 'admin') && (\r\n` +
    `${indent}  <FinanceDashboardApiPanel basePath={c.basePath} />\r\n` +
    `${indent})}\r\n`;

  t = t.slice(0, lineStart) + insertBlock + t.slice(lineStart);
}

fs.writeFileSync(file, t, 'utf8');
console.log('Re-added FinanceDashboardApiPanel render block');

