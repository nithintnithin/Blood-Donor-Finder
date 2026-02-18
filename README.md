# Blood Donor Finder

## Overview
Blood Donor Finder is a web-based platform that connects voluntary blood donors with people and institutions in need. The project now includes both a **client-facing interface** and a **backend server** for persistent storage, along with an **owner/admin dashboard**.

## Features
- **Home Section**: Information about blood donation and eligibility.
- **Register**: Users can sign up as donors; data is sent to the backend.
- **Donor Lists**: Browse donors by institution with search and filters.
- **Institution Details**: View donor details and filter by blood group.
- **Admin Panel**: Owners can log in to manage institutions and donors. (Now accessible directly from the main navigation.)

## Project Structure
```
Blood-Donor-Finder-Website-main/
├── backend/                # Node.js server code and SQLite database
│   ├── package.json
│   ├── server.js           # Express application
│   └── data.db             # SQLite database file (auto‑created)
├── index.html              # User-facing client page
├── owner.html              # Admin dashboard page
├── script.js               # Frontend logic (communicates with API)
├── owner.js                # Admin page logic
├── style.css               # Shared stylesheet
└── README.md               # Documentation (this file)
```

## Backend Setup (Owner/Developer)
1. Make sure Node.js (v16+) is installed.
2. Open a terminal and navigate to `backend` folder:
   ```bash
   cd backend
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. The server will listen on http://localhost:3000 and serve the static frontend files as well as API routes.

## Client Usage (Everyone)
1. Open a browser and navigate to `http://localhost:3000` (assuming the backend is running).
2. Browse sections using the navigation buttons.
3. Register a donor—information is saved to the server.
4. View and search lists; results reflect backend data.

## Admin Dashboard (Owner)
1. Click the **Admin** button in the navigation.
2. On first access, you'll see a **"Create First Admin Account"** form.
   - Choose a username and password for the first admin.
   - Click "Create Admin Account".
3. After the first admin is created, the login form appears.
4. Log in with your credentials.
5. Once authenticated, you can:
   - View all institutions and their donors.
   - Delete entire institutions or individual donors.
   - **Create additional admin accounts** at the bottom of the panel (username + password).
   - All new admins have the same full access and can create more admins.
   - Logout to protect access.

## Technology Stack
- **Node.js + Express** – backend server and REST API.
- **SQLite database** – lightweight, file‑based persistence for donor records.
- **HTML/CSS/JavaScript** – frontend user interface.

## Browser Support
Chrome, Firefox, Safari, Edge (modern versions).

## Data Storage
Donor data is stored on the server in a SQLite file `backend/data.db`. The schema is automatically created; you can back up this file or migrate to another database if needed.

## Future Improvements
- Use the SQLite database or migrate to a server-grade system (PostgreSQL, MongoDB, etc.) in the future.
- Add proper authentication and user accounts.
- Provide editing functionality for donors from the client.

## Copyright
© 2026 Blood Donor Finder. Saving Lives, One Donation at a Time.
