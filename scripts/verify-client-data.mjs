import fetch from 'node-fetch'

async function verifyClientData() {
  console.log('🔍 Verifying client data from API...\n')
  
  try {
    const response = await fetch('http://localhost:3000/api/admin/clients')
    
    if (!response.ok) {
      console.log('❌ API returned error:', response.status)
      process.exit(1)
    }
    
    const clients = await response.json()
    
    console.log('📊 API Response:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Total clients: ${clients.length}`)
    console.log('')
    
    if (clients.length === 0) {
      console.log('❌ No clients returned from API')
      console.log('\nThis means the API is returning an empty array.')
      console.log('Run: node scripts/create-sample-data.mjs')
    } else {
      clients.forEach((client, index) => {
        console.log(`Client ${index + 1}:`)
        console.log(`  id: "${client.id}"`)
        console.log(`  companyName: "${client.companyName}"`)
        console.log(`  fullName: "${client.fullName}"`)
        console.log(`  email: "${client.email}"`)
        console.log(`  status: "${client.status}"`)
        console.log('')
      })
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✅ The correct ID to use is:', clients[0].id)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('\n💡 The dropdown should use this ID when you select the client.')
      console.log('   Hard refresh your browser to load the updated API!')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
  
  process.exit(0)
}

verifyClientData()
