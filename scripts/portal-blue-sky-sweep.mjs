/**
 * One-off codemod: replace common Tailwind blue/sky utilities in web portals
 * with primary / ring semantic tokens. Run: node scripts/portal-blue-sky-sweep.mjs
 */
import fs from 'fs';
import path from 'path';

const roots = [
  path.join(process.cwd(), 'app', 'admin-portal'),
  path.join(process.cwd(), 'app', 'client-portal'),
  path.join(process.cwd(), 'app', 'subcontractor-portal'),
];

/** Longer keys first to avoid partial overlaps */
const REPLACEMENTS = [
  ['dark:bg-blue-950/40', 'dark:bg-primary/20'],
  ['dark:bg-blue-950/30', 'dark:bg-primary/15'],
  ['dark:bg-blue-950', 'dark:bg-primary/25'],
  ['dark:bg-blue-900/40', 'dark:bg-primary/20'],
  ['dark:bg-blue-900/20', 'dark:bg-primary/15'],
  ['dark:text-blue-400', 'dark:text-primary'],
  ['dark:text-blue-300', 'dark:text-primary'],
  ['text-blue-800', 'text-foreground'],
  ['text-blue-700', 'text-primary'],
  ['text-blue-600', 'text-primary'],
  ['text-blue-500', 'text-primary'],
  ['text-blue-400', 'text-primary'],
  ['hover:text-blue-800', 'hover:text-foreground'],
  ['hover:text-blue-700', 'hover:text-primary'],
  ['hover:text-blue-600', 'hover:text-primary'],
  ['border-blue-300', 'border-primary/25'],
  ['border-blue-200', 'border-primary/20'],
  ['border-blue-100', 'border-primary/15'],
  ['hover:border-blue-300', 'hover:border-primary/30'],
  ['border-blue-600', 'border-primary'],
  ['bg-blue-100', 'bg-primary/15'],
  ['bg-blue-50', 'bg-primary/10'],
  ['ring-blue-500', 'ring-ring'],
  ['focus:ring-blue-500', 'focus:ring-ring'],
  ['focus:ring-blue-400', 'focus:ring-ring'],
  ['dark:bg-sky-500/10', 'dark:bg-primary/10'],
  ['bg-sky-400/15', 'bg-primary/15'],
  ['text-sky-700', 'text-primary'],
  ['text-sky-600', 'text-primary'],
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

let filesChanged = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    let s = fs.readFileSync(file, 'utf8');
    const orig = s;
    for (const [a, b] of REPLACEMENTS) {
      s = s.split(a).join(b);
    }
    if (s !== orig) {
      fs.writeFileSync(file, s);
      filesChanged++;
    }
  }
}
console.log(`Updated ${filesChanged} file(s).`);
