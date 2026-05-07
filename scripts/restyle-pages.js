/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const appRoot = path.join(repoRoot, 'app');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function titleFromFile(filePath) {
  const rel = filePath.replace(repoRoot + path.sep, '').replace(/\\/g, '/');
  const parts = rel.split('/').filter(Boolean);
  // app/.../page.tsx -> use parent folder name
  const idx = parts.lastIndexOf('page.tsx');
  const seg = idx > 0 ? parts[idx - 1] : 'Page';
  const cleaned = seg.replace(/\[.*?\]/g, '').replace(/-/g, ' ').trim();
  if (!cleaned) return 'Page';
  return cleaned
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function portalFor(filePath) {
  const rel = filePath.replace(repoRoot + path.sep, '').replace(/\\/g, '/');
  if (rel.startsWith('app/admin-portal/')) return 'admin';
  if (rel.startsWith('app/client-portal/')) return 'client';
  if (rel.startsWith('app/subcontractor-portal/')) return 'subcontractor';
  return 'other';
}

function ensureImport(src, importLine, fromPath) {
  if (fromPath && src.includes(fromPath)) return src;

  const lines = src.split('\n');
  const useClientIdx = lines.findIndex((l) => l.trim() === "'use client';" || l.trim() === '"use client";');
  let i = useClientIdx >= 0 ? useClientIdx + 1 : 0;

  // Skip initial blank line(s)
  while (i < lines.length && lines[i].trim() === '') i++;

  // Walk through import region, including multi-line imports, until the first non-import statement.
  while (i < lines.length) {
    if (!lines[i].startsWith('import ')) break;
    // advance to the semicolon line that ends this import
    while (i < lines.length && !lines[i].trimEnd().endsWith(';')) i++;
    i++;
    while (i < lines.length && lines[i].trim() === '') i++;
  }

  lines.splice(i, 0, importLine);
  return lines.join('\n');
}

function ensureSparklesImport(src) {
  if (!/\bSparkles\b/.test(src)) return src;
  const hasSparkles = /import\s+\{[^}]*\bSparkles\b[^}]*\}\s+from\s+['"]lucide-react['"]\s*;/.test(src);
  if (hasSparkles) return src;
  // Always safe as a separate import; avoids touching large existing imports.
  return ensureImport(src, "import { Sparkles } from 'lucide-react';", null);
}

function wrapWithPageContainer(src, layoutTag) {
  if (src.includes('<PageContainer')) return src;
  const open = `<${layoutTag}>`;
  const close = `</${layoutTag}>`;
  const openIdx = src.indexOf(open);
  const closeIdx = src.lastIndexOf(close);
  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) return src;

  // Insert right after layout open tag.
  let next = src;
  next = next.replace(open, `${open}\n      <PageContainer>`);
  next = next.replace(close, `      </PageContainer>\n    ${close}`);
  return next;
}

function ensureHero(src, title) {
  if (src.includes('bg-gradient-to-br') || src.includes('<PortalHero')) return src;
  // Insert PortalHero right after PageContainer opening.
  if (!src.includes('<PageContainer')) return src;

  return src.replace(
    '<PageContainer>',
    `<PageContainer>\n        <PortalHero\n          title="${title}"\n          subtitle=""\n          icon={Sparkles}\n        />`,
  );
}

function apply(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');

  // Clean up any previously-inserted imports that might have landed inside
  // a multi-line import block (string-codemod safety).
  src = src
    .split('\n')
    .filter((l) =>
      l.trim() !== "import { PageContainer } from '@/components/ui/page-container';"
      && l.trim() !== "import { PortalHero } from '@/components/ui/portal-hero';"
      && l.trim() !== "import { Sparkles } from 'lucide-react';",
    )
    .join('\n');

  const portal = portalFor(filePath);
  const title = titleFromFile(filePath);

  if (portal === 'admin' && src.includes('<AdminLayout')) {
    src = ensureImport(src, "import { PageContainer } from '@/components/ui/page-container';", '@/components/ui/page-container');
    src = ensureImport(src, "import { PortalHero } from '@/components/ui/portal-hero';", '@/components/ui/portal-hero');
    src = wrapWithPageContainer(src, 'AdminLayout');
    src = ensureHero(src, title);
    src = ensureSparklesImport(src);
  }

  if (portal === 'client' && src.includes('<ClientLayout')) {
    src = ensureImport(src, "import { PageContainer } from '@/components/ui/page-container';", '@/components/ui/page-container');
    src = ensureImport(src, "import { PortalHero } from '@/components/ui/portal-hero';", '@/components/ui/portal-hero');
    src = wrapWithPageContainer(src, 'ClientLayout');
    src = ensureHero(src, title);
    src = ensureSparklesImport(src);
  }

  if (portal === 'subcontractor' && src.includes('<SubcontractorLayout')) {
    src = ensureImport(src, "import { PageContainer } from '@/components/ui/page-container';", '@/components/ui/page-container');
    src = ensureImport(src, "import { PortalHero } from '@/components/ui/portal-hero';", '@/components/ui/portal-hero');
    src = wrapWithPageContainer(src, 'SubcontractorLayout');
    src = ensureHero(src, title);
    src = ensureSparklesImport(src);
  }

  fs.writeFileSync(filePath, src, 'utf8');
}

function main() {
  const files = walk(appRoot).filter((p) => p.endsWith(`${path.sep}page.tsx`));
  console.log(`Found ${files.length} page.tsx files`);
  for (const f of files) apply(f);
  console.log('Done.');
}

main();

