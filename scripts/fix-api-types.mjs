import fs from 'fs'
import path from 'path'

const API_DIR = './app/api'

function fixApiFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    let modified = false

    // Replace NextRequest imports
    if (content.includes('NextRequest, NextResponse')) {
      content = content.replace(
        /import \{ NextRequest, NextResponse \} from 'next\/server'/g,
        "// Using standard Response instead of NextResponse to avoid type issues"
      )
      modified = true
    } else if (content.includes('import { NextRequest')) {
      content = content.replace(
        /import \{ NextRequest \} from 'next\/server'/g,
        "// Using standard Request instead of NextRequest to avoid type issues"
      )
      modified = true
    }

    // Replace NextResponse imports
    if (content.includes('import { NextResponse }')) {
      content = content.replace(
        /import \{ NextResponse \} from 'next\/server'/g,
        "// Using standard Response instead of NextResponse to avoid type issues"
      )
      modified = true
    }

    // Replace NextRequest parameter types
    content = content.replace(/request: NextRequest/g, 'request: Request')
    if (content.includes('request: NextRequest')) {
      modified = true
    }

    // Replace NextResponse.json calls
    const nextResponsePattern = /return NextResponse\.json\(\s*([^,]+),\s*\{\s*status:\s*(\d+)\s*\}\s*\)/g
    content = content.replace(nextResponsePattern, (match, jsonData, status) => {
      return `return new Response(\n        JSON.stringify(${jsonData}),\n        { status: ${status}, headers: { 'Content-Type': 'application/json' } }\n      )`
    })
    if (nextResponsePattern.test(content)) {
      modified = true
    }

    // Handle NextResponse.json without status
    const nextResponseNoStatusPattern = /return NextResponse\.json\(\s*([^)]+)\s*\)/g
    content = content.replace(nextResponseNoStatusPattern, (match, jsonData) => {
      return `return new Response(\n        JSON.stringify(${jsonData}),\n        { status: 200, headers: { 'Content-Type': 'application/json' } }\n      )`
    })
    if (nextResponseNoStatusPattern.test(content)) {
      modified = true
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
      if (fixApiFile(filePath)) {
        fixedCount++
      }
    }
  }

  return fixedCount
}

console.log('🔧 Fixing NextRequest/NextResponse type issues in API routes...')
const fixedCount = walkDirectory(API_DIR)
console.log(`\n✅ Fixed ${fixedCount} API route files`)
