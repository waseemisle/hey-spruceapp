/**
 * Replaces per-page portal shell wrappers with React fragments so segment
 * layout.tsx files own the real shell and returns stay valid JSX (single root).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function walkTsx(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function isSegmentPortalLayout(absPath) {
  const norm = absPath.split(path.sep).join('/');
  return /\/app\/(client-portal|admin-portal|subcontractor-portal)\/layout\.tsx$/.test(norm);
}

function stripForFile(absPath, layoutName, importPath) {
  if (isSegmentPortalLayout(absPath)) {
    return false;
  }

  let s = fs.readFileSync(absPath, 'utf8');
  const orig = s;

  const importRe = new RegExp(
    `^import ${layoutName} from ['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"];\\s*\\r?\\n`,
    'm',
  );
  s = s.replace(importRe, '');

  const esc = layoutName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Suspense fallbacks that wrapped the portal shell — keep inner spinner/content only
  s = s.replace(
    new RegExp(`fallback=\\{\\s*<${esc}>\\s*([\\s\\S]*?)\\s*</${esc}>\\s*\\}`, 'g'),
    'fallback={$1}',
  );

  // Same-line opening: return <AdminLayout>  →  return <>
  s = s.replace(new RegExp(`<${esc}>`, 'g'), '<>');
  // Closing tag anywhere
  s = s.replace(new RegExp(`</${esc}>`, 'g'), '</>');

  if (s !== orig) fs.writeFileSync(absPath, s, 'utf8');
  return s !== orig;
}

const skipAdmin = path.join(repoRoot, 'app/admin-portal/clients/[id]/page.tsx');

let fileCount = 0;
for (const f of walkTsx(path.join(repoRoot, 'app/client-portal'))) {
  if (stripForFile(f, 'ClientLayout', '@/components/client-layout')) fileCount++;
}
for (const f of walkTsx(path.join(repoRoot, 'app/admin-portal'))) {
  if (f === skipAdmin) continue;
  if (stripForFile(f, 'AdminLayout', '@/components/admin-layout')) fileCount++;
}
for (const f of walkTsx(path.join(repoRoot, 'app/subcontractor-portal'))) {
  if (stripForFile(f, 'SubcontractorLayout', '@/components/subcontractor-layout')) fileCount++;
}

const msgPath = path.join(repoRoot, 'components/messaging/message-logs-page.tsx');
if (stripForFile(msgPath, 'AdminLayout', '@/components/admin-layout')) fileCount++;

// Multiline <AdminLayout headerExtra={...}> on client detail page
{
  let s = fs.readFileSync(skipAdmin, 'utf8');
  const orig = s;
  s = s.replace(/^import AdminLayout from ['"]@\/components\/admin-layout['"];?\s*\r?\n/m, '');
  s = s.replace(
    /<AdminLayout\s+headerExtra=\{[\s\S]*?\}\s*>/g,
    '<>',
  );
  s = s.replace(/<AdminLayout>/g, '<>');
  s = s.replace(/<\/AdminLayout>/g, '</>');
  if (s !== orig) {
    fs.writeFileSync(skipAdmin, s, 'utf8');
    fileCount++;
  }
}

console.log(`strip-inline-portal-layouts: files modified: ${fileCount}`);
