# Fit-Ready-IQ Frontend

Next.js 14 frontend application with TypeScript, Tailwind CSS, and mobile-responsive design.

## Tech Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **React Query**: Server state management
- **Zustand**: Client state management
- **Mapbox GL**: Interactive maps
- **Recharts**: Data visualization
- **React Hook Form + Zod**: Form handling and validation

## Architecture

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Auth-protected routes
│   │   ├── dashboard/         # Fitness dashboard
│   │   ├── routes/            # Route discovery
│   │   ├── training/          # Training programs
│   │   └── itinerary/         # Itinerary builder
│   ├── components/            # React components
│   │   ├── ui/               # Reusable UI components
│   │   ├── maps/             # Map components
│   │   ├── fitness/          # Fitness visualizations
│   │   └── layouts/          # Layout components
│   ├── lib/                  # Utilities and helpers
│   │   ├── api/              # API client
│   │   ├── hooks/            # Custom hooks
│   │   └── utils/            # Helper functions
│   ├── store/                # Zustand stores
│   ├── types/                # TypeScript types
│   └── styles/               # Global styles
└── public/                   # Static assets
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:3000

### Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
NEXT_PUBLIC_APP_NAME=Fit-Ready-IQ
```

### Build

```bash
npm run build
npm start
```

### Docker

```bash
# Development
docker-compose up frontend

# Production
docker build -t fit-ready-iq-frontend .
docker run -p 3000:3000 fit-ready-iq-frontend
```

## Features

- Responsive design (mobile, tablet, desktop)
- Progressive Web App (PWA) capabilities
- Server-side rendering (SSR)
- Optimized image loading
- API client with error handling
- Authentication flow
- Interactive maps with Mapbox
- Fitness data visualization
- Route search and filtering
- Training program display
- Itinerary builder with weather

## Project Structure Conventions

- Use functional components with hooks
- Keep components small and focused
- Implement proper error boundaries
- Use TypeScript for type safety
- Follow Tailwind CSS best practices
- Optimize for mobile-first
- Lazy load heavy components
- Use React Query for server data
- Implement proper loading states

## Testing

```bash
npm test
npm run test:e2e
```

## License

MIT
