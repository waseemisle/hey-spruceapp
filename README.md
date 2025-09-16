# Spruce App Portal

A modern property maintenance management portal built with Next.js, React, Tailwind CSS, D3.js, and shadcn/ui.

## Features

- **Multi-role Authentication**: Separate portals for Admin, Client, and Subcontractor users
- **Real-time Dashboard**: Interactive charts and analytics using D3.js
- **Property Management**: Comprehensive property and work order management
- **Responsive Design**: Modern UI built with Tailwind CSS and shadcn/ui components
- **Supabase Integration**: Backend authentication and data management

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Charts**: D3.js for data visualization
- **Backend**: Supabase (Authentication & Database)
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd spruce-app-portal
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Portal Access

### Demo Credentials

The application includes demo credentials for testing:

- **Client Portal**: 
  - Email: `demo.client@heyspruce.com`
  - Password: `demo123`

- **Admin Portal**: 
  - Email: `demo.admin@heyspruce.com`
  - Password: `demo123`

- **Subcontractor Portal**: 
  - Email: `demo.sub@heyspruce.com`
  - Password: `demo123`

### Portal Features

#### Admin Portal
- System overview dashboard
- User management
- Property management
- Work order oversight
- Analytics and reporting
- System settings

#### Client Portal
- Property portfolio management
- Work order requests
- Billing and invoices
- Maintenance history
- Real-time notifications

#### Subcontractor Portal
- Assigned work orders
- Proposal submissions
- Earnings tracking
- Schedule management
- Customer ratings

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── admin-portal/      # Admin portal pages
│   ├── client-portal/     # Client portal pages
│   ├── subcontractor-portal/ # Subcontractor portal pages
│   ├── portal-login/      # Authentication pages
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # Reusable components
│   ├── ui/               # shadcn/ui components
│   └── charts/           # D3.js chart components
├── lib/                  # Utility functions
│   ├── auth.ts          # Authentication hooks
│   ├── supabase.ts      # Supabase client and types
│   └── utils.ts         # Helper functions
└── public/              # Static assets
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Adding New Features

1. **New Pages**: Add pages in the `app/` directory following Next.js 13+ app router conventions
2. **Components**: Create reusable components in the `components/` directory
3. **Styling**: Use Tailwind CSS classes and shadcn/ui components
4. **Charts**: Create new D3.js visualizations in `components/charts/`

## Supabase Setup

### Database Schema

The application expects the following Supabase tables:

```sql
-- Users table
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT CHECK (role IN ('admin', 'client', 'subcontractor')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Properties table
CREATE TABLE properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  client_id UUID REFERENCES users(id),
  property_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Work orders table
CREATE TABLE work_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  client_id UUID REFERENCES users(id),
  subcontractor_id UUID REFERENCES users(id),
  property_id UUID REFERENCES properties(id),
  estimated_cost DECIMAL,
  actual_cost DECIMAL,
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Proposals table
CREATE TABLE proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID REFERENCES work_orders(id),
  subcontractor_id UUID REFERENCES users(id),
  amount DECIMAL NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Row Level Security (RLS)

Enable RLS on all tables and create appropriate policies for each user role.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The application can be deployed to any platform that supports Next.js:
- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- 📞 Phone: 877-253-2646
- ✉️ Email: support@heyspruce.com

## Version History

- **v2.0.1** - Initial release with Next.js, React, Tailwind CSS, D3.js, and shadcn/ui integration
