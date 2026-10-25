# Feedback - Ensaios

Feedback - Ensaios is a Vite + React + TypeScript booking app for music rehearsal rooms with a dedicated admin area and backend role-based access.

## Features

- Two rehearsal rooms (SALA RED and SALA GREY)
- Calendar-based date selection with occupied-day blocking per room
- Start time and duration rules based on studio closing time
- Portuguese (Portugal) and English language switching with Portuguese as the default
- Pricing model based on EUR per player per hour plus add-ons
- Admin page with login, role permissions, and booking operations
- Roles: Admin, Collaborator, Technician
- Backend persistence to local JSON file (`server/data/state.json`)
- Password hashing (scrypt) and expiring sessions
- Booking notifications by email and optional WhatsApp when configured
- Optional contact phone field for WhatsApp notifications
- Admin audit log for user creation, pricing updates, and booking decisions
- Responsive layout for desktop and mobile

## Run locally

1. Install Node.js 18 or newer.
2. Install dependencies:

```bash
npm install
```

3. Start the API server:

```bash
npm run dev:api
```

4. Start the frontend dev server:

```bash
npm run dev
```

5. Build for production:

```bash
npm run build
```

## Admin access

- URL: `/admin` (example: `http://localhost:5173/admin`)
- Default account:
	- Email: `admin@feedbook.local`
	- Password: `admin123`

## Backend configuration

- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: initial admin credentials when state file is first created.
- `CLIENT_ORIGINS`: comma-separated list of allowed CORS origins.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: email delivery settings for booking notifications.

## Next product steps

- Move state persistence from JSON file to PostgreSQL
- Add password reset and forced password change for first login
- Add audit logs for admin actions (price changes, user creation, booking decisions)
- Add EasyPay MB WAY integration and pay-on-arrival booking states