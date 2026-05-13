/**
 * Fix invalid Tailwind opacity stacks introduced when replacing bg-blue-50/XX
 * patterns, and mop common remaining blue utilities.
 */
import fs from 'fs';
import path from 'path';

const roots = [
  path.join(process.cwd(), 'app', 'admin-portal'),
  path.join(process.cwd(), 'app', 'client-portal'),
  path.join(process.cwd(), 'app', 'subcontractor-portal'),
];

const REPLACEMENTS = [
  ['dark:bg-primary/25/60', 'dark:bg-primary/25'],
  ['dark:bg-primary/25/20', 'dark:bg-primary/20'],
  ['dark:bg-primary/25/10', 'dark:bg-primary/15'],
  ['bg-primary/10/80', 'bg-primary/10'],
  ['bg-primary/10/60', 'bg-primary/15'],
  ['bg-primary/10/50', 'bg-primary/10'],
  ['bg-primary/10/40', 'bg-primary/10'],
  ['border-primary/20/60', 'border-primary/20'],
  ['dark:border-blue-900/60', 'dark:border-primary/30'],
  ['dark:border-blue-800', 'dark:border-primary/30'],
  ['ring-blue-100', 'ring-primary/15'],
  ['dark:ring-blue-900/40', 'dark:ring-primary/25'],
  ['ring-blue-200', 'ring-primary/20'],
  ['dark:ring-blue-900/50', 'dark:ring-primary/25'],
  ['text-blue-900', 'text-foreground'],
  ['dark:text-blue-100', 'dark:text-foreground'],
  ['dark:text-blue-200', 'dark:text-muted-foreground'],
  ['hover:border-blue-400', 'hover:border-primary/40'],
  ['bg-blue-200/30', 'bg-primary/20'],
  ['bg-blue-600', 'bg-primary'],
  ['hover:bg-blue-700', 'hover:bg-primary/90'],
  ['from-blue-50 via-card to-purple-50/60', 'from-primary/10 via-card to-violet-500/10'],
  ['dark:from-blue-950/30', 'dark:from-primary/15'],
  ['from-blue-500 to-indigo-600', 'from-primary to-violet-600'],
  ['from-cyan-500 to-blue-600', 'from-cyan-500 to-primary'],
  ['focus:border-blue-500', 'focus:border-ring'],
  ['focus-within:border-blue-500', 'focus-within:border-ring'],
  ['hover:border-blue-500', 'hover:border-primary'],
  ['border-blue-500', 'border-primary'],
  ['border-blue-400', 'border-primary/40'],
  ['border-l-blue-500', 'border-l-primary'],
  ['shadow-blue-600/25', 'shadow-primary/25'],
  ['from-blue-600 to-blue-800', 'from-primary to-violet-900'],
  ['from-blue-500 to-blue-700', 'from-primary to-violet-700'],
  ['bg-blue-400', 'bg-primary/50'],
  ['dark:bg-blue-400', 'dark:bg-primary/60'],
  ['accent-blue-600', 'accent-primary'],
  ['fill-blue-600', 'fill-primary'],
  ['dark:bg-blue-900/30', 'dark:bg-primary/25'],
  ['dark:bg-blue-900', 'dark:bg-zinc-900'],
  ['dark:ring-blue-900/60', 'dark:ring-primary/30'],
  ['dark:border-blue-900/40', 'dark:border-primary/25'],
  ['bg-blue-900 text-blue-100', 'bg-zinc-900 text-zinc-100'],
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

let n = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    let s = fs.readFileSync(file, 'utf8');
    const o = s;
    for (const [a, b] of REPLACEMENTS) s = s.split(a).join(b);
    if (s !== o) {
      fs.writeFileSync(file, s);
      n++;
    }
  }
}
console.log(`Fixup touched ${n} file(s).`);
