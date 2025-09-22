// Test the date calculation function
function calculateNextExecution(
  frequency, 
  dayOfWeek, 
  dayOfMonth, 
  time = '09:00', 
  timezone = 'America/New_York'
) {
  const now = new Date()
  const [hours, minutes] = time.split(':').map(Number)
  
  let nextExecution = new Date(now)
  
  switch (frequency) {
    case 'weekly':
      const targetDay = parseInt(dayOfWeek || '1')
      const currentDay = now.getDay()
      const daysUntilTarget = (targetDay - currentDay + 7) % 7
      
      if (daysUntilTarget === 0) {
        // If it's the same day, check if time has passed
        nextExecution.setHours(hours, minutes, 0, 0)
        if (nextExecution <= now) {
          nextExecution.setDate(nextExecution.getDate() + 7)
        }
      } else {
        nextExecution.setDate(nextExecution.getDate() + daysUntilTarget)
        nextExecution.setHours(hours, minutes, 0, 0)
      }
      break
      
    case 'monthly':
      const targetDayOfMonth = parseInt(dayOfMonth || '1')
      nextExecution.setDate(targetDayOfMonth)
      nextExecution.setHours(hours, minutes, 0, 0)
      
      if (nextExecution <= now) {
        nextExecution.setMonth(nextExecution.getMonth() + 1)
      }
      break
      
    case 'quarterly':
      const targetDayQuarterly = parseInt(dayOfMonth || '1')
      nextExecution.setDate(targetDayQuarterly)
      nextExecution.setHours(hours, minutes, 0, 0)
      
      if (nextExecution <= now) {
        nextExecution.setMonth(nextExecution.getMonth() + 3)
      }
      break
      
    case 'yearly':
      const targetDayYearly = parseInt(dayOfMonth || '1')
      nextExecution.setMonth(0) // January
      nextExecution.setDate(targetDayYearly)
      nextExecution.setHours(hours, minutes, 0, 0)
      
      if (nextExecution <= now) {
        nextExecution.setFullYear(nextExecution.getFullYear() + 1)
      }
      break
      
    default:
      throw new Error(`Invalid frequency: ${frequency}`)
  }
  
  return nextExecution.toISOString()
}

// Test the function
try {
  console.log('Testing date calculation...');
  
  const testCases = [
    { frequency: 'weekly', dayOfWeek: '1', time: '09:00' },
    { frequency: 'monthly', dayOfMonth: '1', time: '09:00' },
    { frequency: 'quarterly', dayOfMonth: '1', time: '09:00' },
    { frequency: 'yearly', dayOfMonth: '1', time: '09:00' }
  ];
  
  testCases.forEach((testCase, index) => {
    try {
      const result = calculateNextExecution(
        testCase.frequency, 
        testCase.dayOfWeek, 
        testCase.dayOfMonth, 
        testCase.time, 
        'America/New_York'
      );
      console.log(`Test ${index + 1} (${testCase.frequency}):`, result);
    } catch (error) {
      console.error(`Test ${index + 1} failed:`, error.message);
    }
  });
  
} catch (error) {
  console.error('Error:', error);
}
