/**
 * ServiceChannel-style problem taxonomy for guided work order creation.
 * Keyword search suggests: Area → Problem Type → Equipment → Problem Code
 */
export interface ProblemSuggestion {
  area: string;
  problemType: string;
  equipment: string;
  problemCode: string;
  keywords: string[];
}

export const PROBLEM_TAXONOMY: ProblemSuggestion[] = [
  { area: 'Executive Office', problemType: 'Electrical', equipment: 'Outlets', problemCode: 'Outlet Not Working (NAT)', keywords: ['outlet', 'electrical', 'plug', 'power', 'office'] },
  { area: 'Kitchen', problemType: 'Electrical', equipment: 'Outlets', problemCode: 'Outlet Not Working', keywords: ['outlet', 'kitchen', 'electrical'] },
  { area: 'Kitchen', problemType: 'HVAC', equipment: 'Walk-in Cooler', problemCode: 'Temperature Issue', keywords: ['cooler', 'refrigeration', 'temperature', 'cold'] },
  { area: 'Kitchen', problemType: 'Plumbing', equipment: 'Sink', problemCode: 'Leak', keywords: ['sink', 'leak', 'water', 'plumbing'] },
  { area: 'Restroom', problemType: 'Plumbing', equipment: 'Toilet', problemCode: 'Clogged', keywords: ['toilet', 'clog', 'restroom', 'plumbing'] },
  { area: 'Restroom', problemType: 'Plumbing', equipment: 'Faucet', problemCode: 'Leak', keywords: ['faucet', 'leak', 'restroom'] },
  { area: 'Main Floor', problemType: 'HVAC', equipment: 'AC Unit', problemCode: 'Not Cooling', keywords: ['ac', 'hvac', 'cooling', 'air'] },
  { area: 'Main Floor', problemType: 'HVAC', equipment: 'Heater', problemCode: 'Not Heating', keywords: ['heater', 'heat', 'hvac'] },
  { area: 'General', problemType: 'General Repairs', equipment: 'Doors', problemCode: 'Door Not Closing', keywords: ['door', 'hinge', 'close'] },
  { area: 'General', problemType: 'Janitorial', equipment: 'Floor', problemCode: 'Floor Cleaning Needed', keywords: ['floor', 'cleaning', 'janitorial'] },
  { area: 'Parking', problemType: 'Electrical', equipment: 'Lighting', problemCode: 'Light Out', keywords: ['light', 'parking', 'electrical', 'bulb'] },
  { area: 'Storage', problemType: 'Electrical', equipment: 'Outlets', problemCode: 'Outlet Not Working', keywords: ['outlet', 'storage', 'electrical'] },
];

export function searchProblemTaxonomy(query: string): ProblemSuggestion[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().trim();
  return PROBLEM_TAXONOMY.filter(
    (p) =>
      p.keywords.some((k) => k.includes(q) || q.includes(k)) ||
      p.area.toLowerCase().includes(q) ||
      p.problemType.toLowerCase().includes(q) ||
      p.equipment.toLowerCase().includes(q) ||
      p.problemCode.toLowerCase().includes(q)
  );
}

/** Troubleshooting tip for a problem type (e.g. Electrical/Outlets) */
export interface TroubleshootingTip {
  problemType: string;
  equipment: string;
  title: string;
  steps: string[];
  imageHint?: string; // e.g. "reset_test_outlet"
}

export const TROUBLESHOOTING_TIPS: TroubleshootingTip[] = [
  {
    problemType: 'Electrical',
    equipment: 'Outlets',
    title: 'GFCI Outlet — RESET / TEST',
    steps: [
      'Locate the outlet and check for RESET and TEST buttons.',
      'Press the RESET button firmly. Wait a few seconds.',
      'If the outlet has a red or orange indicator, it may have tripped — RESET should restore power.',
      'If power is restored, the issue is resolved. If not, proceed to create the work order.',
    ],
    imageHint: 'reset_test_outlet',
  },
  {
    problemType: 'Plumbing',
    equipment: 'Toilet',
    title: 'Toilet Not Flushing',
    steps: [
      'Check that the water supply valve behind the toilet is fully open.',
      'Lift the tank lid and ensure the flapper chain is connected and the float is not stuck.',
      'If the bowl is clogged, try a plunger before requesting service.',
    ],
  },
  {
    problemType: 'HVAC',
    equipment: 'AC Unit',
    title: 'AC Not Cooling',
    steps: [
      'Check the thermostat is set to Cool and the temperature is below room temperature.',
      'Ensure the circuit breaker for the AC unit has not tripped.',
      'Replace or clean the air filter if it has been more than 90 days.',
    ],
  },
];

export function getTroubleshootingTip(problemType: string, equipment: string): TroubleshootingTip | undefined {
  const pt = problemType.toLowerCase();
  const eq = equipment.toLowerCase();
  return TROUBLESHOOTING_TIPS.find(
    (t) => t.problemType.toLowerCase() === pt && t.equipment.toLowerCase() === eq
  ) ?? TROUBLESHOOTING_TIPS.find((t) => t.problemType.toLowerCase() === pt);
}

export const WEATHER_TYPES = ['Clear', 'Rain', 'Snow', 'Wind', 'Storm', 'Extreme Heat', 'Other'] as const;
