# Flycentric App - Setup & Run Instructions

## Project Overview

Flycentric is a full-stack application for managing exams, content, analytics, and more. It consists of:

- **Client**: React 19 + Vite SPA
- **Server**: Node.js/Express REST API with PostgreSQL database

## Prerequisites

- Node.js v18.19.1 or higher
- npm 9.2.0 or higher (or yarn/pnpm)
- PostgreSQL 12+ (for database)

## Quick Start

### 1. Install Dependencies

```bash
# Install server dependencies
cd flycentric/server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Database Setup

The application requires PostgreSQL running locally:

```bash
# Connection details (from .env)
DATABASE_URL=postgresql://flycentric:flycentric_dev_pw@localhost:5432/flycentric
```

**To set up the database:**
1. Create PostgreSQL user and database:
   ```sql
   CREATE USER flycentric WITH PASSWORD 'flycentric_dev_pw';
   CREATE DATABASE flycentric OWNER flycentric;
   ```

2. Run migrations:
   ```bash
   cd flycentric/server
   npm run migrate
   ```

3. (Optional) Seed sample data:
   ```bash
   npm run seed
   ```

### 3. Environment Configuration

The server uses environment variables from `.env`:

```
PORT=4000
DATABASE_URL=postgresql://flycentric:flycentric_dev_pw@localhost:5432/flycentric
JWT_ACCESS_SECRET=dev_access_secret_change_me_in_prod
JWT_REFRESH_SECRET=dev_refresh_secret_change_me_in_prod
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
```

Update these values as needed for your environment.

### 4. Start the Application

**Terminal 1 - Start Backend Server:**
```bash
cd flycentric/server
npm start
# Server runs on http://localhost:4000
# Health check: http://localhost:4000/api/health
```

**Terminal 2 - Start Frontend (Vite Dev Server):**
```bash
cd flycentric/client
npm run dev
# Open http://localhost:5173 (or the URL shown in terminal)
```

## API Endpoints

The server provides the following API routes:
- `/api/auth` - Authentication (login, register, tokens)
- `/api/content` - Course content management
- `/api/questions` - Question bank
- `/api/exams` - Exam management
- `/api/memory-bank` - Memory/revision bank
- `/api/analytics` - Analytics and reporting
- `/api/admin` - Admin operations
- `/api/batches` - Batch management
- `/api/doubts` - Doubt clarification
- `/api/jobs` - Job listings
- `/api/payments` - Payment processing
- `/api/health` - Health check endpoint

## Project Structure

```
flycentric/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── context/       # React context (auth, etc)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── server/                 # Node.js/Express backend
│   ├── src/
│   │   ├── routes/        # API route handlers
│   │   ├── middleware/    # Express middleware
│   │   ├── db/            # Database schema & migrations
│   │   ├── auth/          # JWT token handling
│   │   └── server.js      # Main server file
│   ├── package.json
│   └── .env               # Environment configuration
│
└── README.md
```

## Server Dependencies

Key npm packages used:
- `express` - Web framework
- `pg` - PostgreSQL driver
- `jsonwebtoken` - JWT authentication
- `cors` - Cross-origin resource sharing
- `bcryptjs` - Password hashing
- `multer` - File upload handling
- `csv-parse` - CSV file parsing
- `dotenv` - Environment variable management

## Client Dependencies

Key npm packages used:
- `react` - UI library
- `react-dom` - React DOM rendering
- `react-router-dom` - Client-side routing
- `vite` - Frontend build tool

## Troubleshooting

### Issue: Database connection refused
**Solution**: Ensure PostgreSQL is running and the credentials in `.env` are correct.

### Issue: "Cannot find module" errors
**Solution**: Run `npm install` in the respective directory (server or client).

### Issue: Port already in use
**Solutions**:
- Change PORT in `.env` for server (default 4000)
- Use `npm run dev -- --port 3000` for client to change Vite port

### Issue: CORS errors
**Solution**: The server is configured with CORS enabled for all origins. Ensure the client is making requests to `http://localhost:4000/api/*`

## Available Scripts

### Server
- `npm start` - Run production server
- `npm run dev` - Run development server (same as start)
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed sample data

### Client
- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run linter

## Development Tips

1. **Hot Reload**: The Vite dev server supports hot module replacement for instant feedback
2. **Database Queries**: Check `server/src/db/pool.js` for connection pooling configuration
3. **JWT Tokens**: Tokens are managed in `server/src/auth/tokens.js`
4. **API Testing**: Use Postman, curl, or REST Client extensions to test endpoints
5. **CORS**: Currently allows all origins - update in production

## Production Deployment

Before deploying to production:
1. Change JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
2. Update DATABASE_URL to production database
3. Set NODE_ENV=production
4. Run `npm run build` for client
5. Use a process manager like PM2 for server

## License

Proprietary - Flycentric
