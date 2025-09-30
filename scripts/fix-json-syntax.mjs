import fs from 'fs'
import path from 'path'

const API_DIR = './app/api'

function fixJsonSyntax(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    let modified = false

    // Fix malformed JSON.stringify calls with nested objects
    // Pattern: JSON.stringify({ ... }, { status: 500 }), { status: 200, headers: ... }
    const malformedPattern = /JSON\.stringify\(\s*\{[^}]*\},\s*\{\s*status:\s*\d+\s*\}\s*\),\s*\{\s*status:\s*\d+,\s*headers:\s*\{[^}]*\}\s*\}\)/g
    
    content = content.replace(malformedPattern, (match) => {
      // Extract the JSON object and the final status/headers
      const jsonMatch = match.match(/JSON\.stringify\(\s*(\{[^}]*\})/);
      const finalMatch = match.match(/,\s*\{\s*status:\s*(\d+),\s*headers:\s*(\{[^}]*\})\s*\}\)$/);
      
      if (jsonMatch && finalMatch) {
        const jsonObject = jsonMatch[1];
        const status = finalMatch[1];
        const headers = finalMatch[2];
        
        return `JSON.stringify(${jsonObject}),\n      { status: ${status}, headers: ${headers} }`;
      }
      return match;
    });

    // Fix simple malformed patterns
    // Pattern: JSON.stringify({ ... }, { status: 400 }), { status: 200, headers: ... }
    const simplePattern = /JSON\.stringify\(\s*\{[^}]*\},\s*\{\s*status:\s*\d+\s*\}\s*\),\s*\{\s*status:\s*\d+,\s*headers:\s*\{[^}]*\}\s*\}\)/g
    
    content = content.replace(simplePattern, (match) => {
      // Extract the JSON object and the final status/headers
      const jsonMatch = match.match(/JSON\.stringify\(\s*(\{[^}]*\})/);
      const finalMatch = match.match(/,\s*\{\s*status:\s*(\d+),\s*headers:\s*(\{[^}]*\})\s*\}\)$/);
      
      if (jsonMatch && finalMatch) {
        const jsonObject = jsonMatch[1];
        const status = finalMatch[1];
        const headers = finalMatch[2];
        
        return `JSON.stringify(${jsonObject}),\n      { status: ${status}, headers: ${headers} }`;
      }
      return match;
    });

    if (modified || content !== fs.readFileSync(filePath, 'utf8')) {
      fs.writeFileSync(filePath, content, 'utf8')
      console.log(`✅ Fixed: ${filePath}`)
      return true
    }
    return false
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message)
    return false
  }
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir)
  let fixedCount = 0

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      fixedCount += walkDirectory(filePath)
    } else if (file === 'route.ts') {
      if (fixJsonSyntax(filePath)) {
        fixedCount++
      }
    }
  }

  return fixedCount
}

console.log('🔧 Fixing malformed JSON.stringify calls in API routes...')
const fixedCount = walkDirectory(API_DIR)
console.log(`\n✅ Fixed ${fixedCount} API route files`)
