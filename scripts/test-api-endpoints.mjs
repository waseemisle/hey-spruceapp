import fetch from 'node-fetch'

async function testAPIs() {
  console.log('🧪 Testing API Endpoints...\n')
  
  const baseUrl = 'http://localhost:3000'
  
  const endpoints = [
    { name: 'Admin Clients', url: '/api/admin/clients' },
    { name: 'Admin Subcontractors', url: '/api/admin/subcontractors' },
    { name: 'Categories', url: '/api/categories' },
    { name: 'Work Orders', url: '/api/workorders' },
    { name: 'Quotes', url: '/api/quotes' },
  ]
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint.name}`)
      const response = await fetch(`${baseUrl}${endpoint.url}`)
      
      if (response.ok) {
        const data = await response.json()
        const isArray = Array.isArray(data)
        console.log(`✅ ${endpoint.url} - Status: ${response.status}`)
        console.log(`   Type: ${isArray ? 'Array' : 'Object'}`)
        console.log(`   Count: ${isArray ? data.length : 'N/A'}`)
      } else {
        console.log(`❌ ${endpoint.url} - Status: ${response.status}`)
        const error = await response.json()
        console.log(`   Error: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name} - Failed to connect`)
      console.log(`   Error: ${error.message}`)
    }
    console.log('')
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎯 API Test Complete!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

testAPIs().catch(console.error)
