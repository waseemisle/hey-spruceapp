import fs from 'fs'

const filesToFix = [
  'app/api/check-registration-status/route.ts',
  'app/api/register-subcontractor/route.ts', 
  'app/api/test-sendgrid/route.ts',
  'app/api/workorders/route.ts'
]

function fixSyntaxErrors() {
  console.log('🔧 Fixing syntax errors in API files...')
  
  // Fix check-registration-status/route.ts
  let content = fs.readFileSync('app/api/check-registration-status/route.ts', 'utf8')
  content = content.replace(
    /return new Response\(\s*JSON\.stringify\(\{\s*success: true,\s*status: registration\.status,\s*registrationId,\s*message: getStatusMessage\(registration\.status\),\s*\{ status: 200, headers: \{ 'Content-Type': 'application/json' \} \}\s*\)\s*\)\s*\)/s,
    `return new Response(
      JSON.stringify({
        success: true,
        status: registration.status,
        registrationId,
        message: getStatusMessage(registration.status)
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )`
  )
  fs.writeFileSync('app/api/check-registration-status/route.ts', content)
  console.log('✅ Fixed check-registration-status/route.ts')

  // Fix register-subcontractor/route.ts
  content = fs.readFileSync('app/api/register-subcontractor/route.ts', 'utf8')
  content = content.replace(
    /return new Response\(\s*JSON\.stringify\(\{ error: \`Missing required fields: \$\{missingFields\.join\(', '\),\s*\{ status: 200, headers: \{ 'Content-Type': 'application/json' \} \}\s*\)\s*\}\s*\}\s*\),\s*\{ status: 400 \}\s*\)/s,
    `return new Response(
      JSON.stringify({ error: \`Missing required fields: \${missingFields.join(', ')}\` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )`
  )
  fs.writeFileSync('app/api/register-subcontractor/route.ts', content)
  console.log('✅ Fixed register-subcontractor/route.ts')

  // Fix test-sendgrid/route.ts
  content = fs.readFileSync('app/api/test-sendgrid/route.ts', 'utf8')
  content = content.replace(
    /return new Response\(\s*JSON\.stringify\(\{\s*success: false,\s*error: 'Failed to send test email',\s*details: error\.message,\s*fullError: JSON\.stringify\(error, null, 2\),\s*\{ status: 200, headers: \{ 'Content-Type': 'application/json' \} \}\s*\)\s*\)\s*\)\s*},\s*\{ status: 500 \}/s,
    `return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to send test email',
        details: error.message,
        fullError: JSON.stringify(error, null, 2)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )`
  )
  fs.writeFileSync('app/api/test-sendgrid/route.ts', content)
  console.log('✅ Fixed test-sendgrid/route.ts')

  // Fix workorders/route.ts
  content = fs.readFileSync('app/api/workorders/route.ts', 'utf8')
  content = content.replace(
    /return new Response\(\s*JSON\.stringify\(\{\s*error: 'Client or category not found',\s*details: \{\s*clientExists: clientDoc\.exists\(\),\s*\{ status: 200, headers: \{ 'Content-Type': 'application/json' \} \}\s*\)\s*\),\s*categoryExists: categoryDoc\.exists\(\),\s*clientId: data\.clientId,\s*categoryId: data\.categoryId\s*\}\s*\}\s*\),\s*\{ status: 404 \}\s*\)/s,
    `return new Response(
      JSON.stringify({
        error: 'Client or category not found',
        details: {
          clientExists: clientDoc.exists(),
          categoryExists: categoryDoc.exists(),
          clientId: data.clientId,
          categoryId: data.categoryId
        }
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )`
  )
  fs.writeFileSync('app/api/workorders/route.ts', content)
  console.log('✅ Fixed workorders/route.ts')

  console.log('\n✅ All syntax errors fixed!')
}

fixSyntaxErrors()
