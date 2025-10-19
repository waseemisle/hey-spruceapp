// Script to download the Spruce logo and convert it to base64
// Run this with: node scripts/convert-logo-to-base64.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const logoUrl = 'https://cdn.prod.website-files.com/67edc7c78e3151d3b06686b2/681007b1b7f5a5cc527f1b94_Hey_SPRUCE_logo_font.png';
const outputPath = path.join(__dirname, '..', 'lib', 'logo-base64.ts');

console.log('Downloading Spruce logo...');

https.get(logoUrl, (response) => {
  const chunks = [];

  response.on('data', (chunk) => {
    chunks.push(chunk);
  });

  response.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    const fileContent = `// Hey Spruce Logo in base64 format for PDF embedding
// Auto-generated from ${logoUrl}
export const SPRUCE_LOGO_BASE64 = \`${dataUrl}\`;
`;

    fs.writeFileSync(outputPath, fileContent, 'utf8');
    console.log('✓ Logo converted to base64 successfully!');
    console.log(`✓ Saved to: ${outputPath}`);
    console.log(`✓ Size: ${(base64.length / 1024).toFixed(2)} KB`);
  });

  response.on('error', (error) => {
    console.error('Error downloading logo:', error);
  });
}).on('error', (error) => {
  console.error('Error:', error);
  console.log('\nFallback: You can manually convert the logo:');
  console.log('1. Download from:', logoUrl);
  console.log('2. Convert to base64 at: https://www.base64-image.de/');
  console.log('3. Update lib/logo-base64.ts with the result');
});
