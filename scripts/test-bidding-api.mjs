import fetch from 'node-fetch'

async function testBiddingAPI() {
  try {
    console.log('🧪 Testing Bidding Work Orders API...\n')
    
    // Test with the demo subcontractor ID we found
    const userId = 'HmOXbbG17aM1GWHEkNGIhPJppan1'
    const url = `http://localhost:3000/api/subcontractor/bidding-workorders?userId=${userId}`
    
    console.log(`Testing URL: ${url}`)
    
    const response = await fetch(url)
    
    console.log(`Response Status: ${response.status}`)
    console.log(`Response Headers:`, Object.fromEntries(response.headers.entries()))
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Success! Response data:')
      console.log(JSON.stringify(data, null, 2))
    } else {
      const errorText = await response.text()
      console.log('❌ Error response:')
      console.log(errorText)
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error.message)
  }
}

testBiddingAPI()
