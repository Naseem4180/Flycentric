# FlyCentric — Aviation Learning Management System

FlyCentric is a comprehensive aviation learning ecosystem built for DGCA pilot examination preparation, ground school training, and computer-based test (CBT) practice.

## Architecture

- **Client**: React 19 SPA powered by Vite, Tailwind/custom design system with specialized aviation telemetry components (CBT timer, question palette, radar/gauge analytics, dark/light modes).
- **Server**: Node.js & Express REST API with connection pooling, gzip/deflate response compression, and robust authentication.
- **Database**: PostgreSQL 16 relational database with comprehensive indexing and constraints.

## Features

- **Identity & Access Management**: JWT authentication with short-lived access tokens and sliding refresh tokens. Formal role-based access control (`admin`, `instructor`, `student`, `institution`).
- **Curriculum Hierarchy**: Multi-tier course structuring across Bundles, Subjects, Chapters, and Lessons with rich-text descriptions.
- **Question Bank Engine**: Full-text search, CSV bulk import/export with composite duplicate detection, versioning, and explanation support.
- **Examination Engine**: Realistic DGCA CBT testing simulation, timed sessions, per-question time tracking, auto-save state, pass/fail evaluation, and detailed review heatmaps.
- **Spaced Repetition (Memory Bank)**: Interactive flashcard review deck with SM-2 spaced repetition scheduling.
- **Admin & Instructor Control Center**: Platform analytics, user management, course catalog builder, question moderation, doubt resolution queue, and audit trails.
- **Commerce & Access**: Bundle enrollment and purchase access control, coupon management, and transactional auditing.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ running locally or remotely

### 1. Database Setup

Create the PostgreSQL database and user:

```bash
sudo -u postgres psql -c "CREATE USER flycentric WITH PASSWORD 'flycentric_dev_pw';"
sudo -u postgres psql -c "CREATE DATABASE flycentric OWNER flycentric;"
```

### 2. Backend Setup

```bash
cd server
cp .env.example .env
npm install
npm run migrate
npm run seed
npm start
```

The API service runs on `http://localhost:4000`.

### 3. Frontend Setup

```bash
cd client
npm install
npm run dev
```

The web application runs on `http://localhost:5173`.

### Default Credentials

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@flycentric.in` | `Password123!` |
| Instructor | `instructor@flycentric.in` | `Password123!` |
| Student | `student@flycentric.in` | `Password123!` |
| Institution | `institution@flycentric.in` | `Password123!` |

## Project Structure

```text
Flycentric/
├── client/              # React frontend application
│   ├── src/
│   │   ├── components/  # Shared navigation, badges, modals
│   │   ├── context/     # Auth and state management
│   │   ├── pages/       # Student, instructor, and admin views
│   │   └── ui/          # Reusable design system primitives
│   └── package.json
├── server/              # Express API backend
│   ├── src/
│   │   ├── db/          # PostgreSQL schema and connection pool
│   │   ├── jobs/        # Background workers and schedulers
│   │   ├── middleware/  # Authentication, compression, CORS
│   │   ├── routes/      # REST API route handlers
│   │   └── utils/       # Common helpers and validation
│   └── package.json
└── docker-compose.yml   # Local development services
```

## License

Proprietary — All rights reserved.
