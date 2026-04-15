// Tokens mirror /home/waseem/Desktop/hey-spruceapp/app/globals.css (Stone palette, light-only).
// HSL tuples are rendered verbatim. If the web palette changes, update here.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'hsl(0 0% 100%)',
        foreground: 'hsl(20 14.3% 4.1%)',
        card: 'hsl(0 0% 100%)',
        'card-foreground': 'hsl(20 14.3% 4.1%)',
        popover: 'hsl(0 0% 100%)',
        'popover-foreground': 'hsl(20 14.3% 4.1%)',
        primary: 'hsl(24 9.8% 10%)',
        'primary-foreground': 'hsl(60 9.1% 97.8%)',
        secondary: 'hsl(60 4.8% 95.9%)',
        'secondary-foreground': 'hsl(24 9.8% 10%)',
        muted: 'hsl(60 4.8% 95.9%)',
        'muted-foreground': 'hsl(25 5.3% 44.7%)',
        accent: 'hsl(60 4.8% 95.9%)',
        'accent-foreground': 'hsl(24 9.8% 10%)',
        destructive: 'hsl(0 84.2% 60.2%)',
        'destructive-foreground': 'hsl(60 9.1% 97.8%)',
        border: 'hsl(20 5.9% 90%)',
        input: 'hsl(20 5.9% 90%)',
        ring: 'hsl(20 14.3% 4.1%)',
        // GroundOps brand palette (from email templates)
        navy: '#0D1520',
        beige: '#F3EDE3',
        brand: '#D97706',
        emphasis: '#2563EB',
        'text-primary': '#1A2635',
        'text-secondary': '#5A6C7A',
        'text-muted': '#8A9CAB',
        // Status palette (matches lib/status-utils.ts)
        'status-yellow-bg': '#FEF9C3', 'status-yellow-fg': '#854D0E',
        'status-blue-bg':   '#DBEAFE', 'status-blue-fg':   '#1E40AF',
        'status-red-bg':    '#FEE2E2', 'status-red-fg':    '#991B1B',
        'status-green-bg':  '#DCFCE7', 'status-green-fg':  '#166534',
        'status-purple-bg': '#F3E8FF', 'status-purple-fg': '#6B21A8',
        'status-indigo-bg': '#E0E7FF', 'status-indigo-fg': '#3730A3',
        'status-cyan-bg':   '#CFFAFE', 'status-cyan-fg':   '#155E75',
        'status-teal-bg':   '#CCFBF1', 'status-teal-fg':   '#115E59',
        'status-orange-bg': '#FFEDD5', 'status-orange-fg': '#9A3412',
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
    },
  },
  plugins: [],
};
