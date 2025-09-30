import fs from 'fs'
import path from 'path'

const API_DIR = './app/api'

function fixSyntaxErrors(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    let modified = false

    // Fix all malformed JSON.stringify patterns
    // Pattern: JSON.stringify({ ... }, { status: 500 }), { status: 200, headers: ... }
    const patterns = [
      // Pattern 1: JSON.stringify({ ... }, { status: 400 }), { status: 200, headers: ... }
      {
        regex: /JSON\.stringify\(\s*(\{[^}]*\})\s*,\s*\{\s*status:\s*(\d+)\s*\}\s*\),\s*\{\s*status:\s*(\d+),\s*headers:\s*(\{[^}]*\})\s*\}\)/g,
        replacement: 'JSON.stringify($1),\n      { status: $3, headers: $4 }'
      },
      // Pattern 2: JSON.stringify({ ... }, { status: 500 }), { status: 200, headers: ... }
      {
        regex: /JSON\.stringify\(\s*(\{[^}]*\})\s*,\s*\{\s*status:\s*(\d+)\s*\}\s*\),\s*\{\s*status:\s*(\d+),\s*headers:\s*(\{[^}]*\})\s*\}\)/g,
        replacement: 'JSON.stringify($1),\n      { status: $3, headers: $4 }'
      }
    ]

    for (const pattern of patterns) {
      const newContent = content.replace(pattern.regex, pattern.replacement)
      if (newContent !== content) {
        content = newContent
        modified = true
      }
    }

    if (modified) {
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
      if (fixSyntaxErrors(filePath)) {
        fixedCount++
      }
    }
  }

  return fixedCount
}

console.log('🔧 Fixing all syntax errors in API routes...')
const fixedCount = walkDirectory(API_DIR)
console.log(`\n✅ Fixed ${fixedCount} API route files`)
