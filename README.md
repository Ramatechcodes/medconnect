# 🩺 QuickMed

An "Uber for Healthcare" web app connecting **Patients**, **Doctors**, **Nurses**,
and a full **Admin** control panel.

## Features
- Register as Patient / Doctor / Nurse / Pharmacist / Lab Technician — with **address** collected at signup
- **Email verification by 6-digit code** (not a link) — enter it on the verify page,
  with a "resend code" option. If SMTP isn't configured, the code is printed to
  the server console so you can test without setting up a mailbox.
- Role-based dashboards, live map (Leaflet + OpenStreetMap, no API key needed)
- Patients search nearby available doctors/nurses/pharmacists/lab techs
  (MongoDB geospatial `$near`)
- **Peer coverage requests**: any provider (doctor/nurse/pharmacist/lab tech)
  can search other nearby providers and request them to cover while they're
  off — same accept/decline flow as patient care requests, tagged separately
  as "coverage" everywhere (admin log, live trips, history).
- Request → Accept/Decline flow in real time (Socket.IO)
- Once a request is accepted, **both sides see each other's full details**
  (name, phone, email, address, specialty/license for providers) right in
  their dashboard, plus a live "journey" map: the provider's marker moves in
  real time as they travel, with a FROM/TO tracking bar and distance remaining.
- **In-app chat**, unlocked once a request is accepted (patient↔provider or
  provider↔provider for coverage) — real-time via Socket.IO, backed by a
  short-interval poll as a safety net so messages still land within a few
  seconds even on networks/tunnels that don't keep WebSocket pushes
  reliable.
- **Medical records**: any provider matched with a patient (via an
  accepted request) can add documentation — diagnosis, prescribed drugs,
  lab tests, and a report — right inside that patient's trip panel, and
  sees that patient's full history from any provider so they know what's
  already been done. Patients get a read-only view of their own history;
  every dashboard (including admin, with full oversight) has a dedicated
  "Records" tab.
- **History tab** on every dashboard showing past (completed/declined/
  cancelled) visits and coverage arrangements.
- **Admin dashboard**:
  - Overview stats (all 5 roles, pending/active/coverage counts, banned users)
  - Full user directory with search + role filter, full details per user
  - **Ban**, **Restrict**, and **Delete** actions on any user
  - Full activity log of every request/trip (patient + provider full details,
    care vs. coverage tag, status, timestamps), filterable by status
  - **Live Trips** tab with real-time tracking bars for every active visit
  - Map showing every user's live location, color-coded by role (banned
    users shown in red)
- Banned users can't log in; restricted users can log in but can't create or
  accept new requests.
- Every dashboard is organized into **Home / History / Records / Settings**
  tabs (admin additionally has Overview / Live Trips / Users / Requests /
  Map / Records / Settings). Settings includes editing your profile (name,
  email, phone, address), changing your password, and a **dark/light mode**
  toggle that's remembered across visits.
- Landing page **Complaints & Support** section with direct email and
  WhatsApp contact.

## Tech stack
- **Backend:** Node.js, Express, MongoDB (Mongoose), Socket.IO, JWT, bcrypt, Nodemailer
- **Frontend:** Plain HTML, CSS, JavaScript, Leaflet.js, Leaflet Routing Machine

---

## 1. Prerequisites
- Node.js 18+
- MongoDB running locally OR a free MongoDB Atlas connection string

## 2. Install dependencies
```bash
cd medconnect
npm install
```

## 3. Configure environment variables
```bash
cp .env.example .env
```
Then open `.env` and fill in:
- `MONGO_URI` — your MongoDB connection string
- `JWT_SECRET` — any long random string
- `SMTP_*` — optional (blank = codes print to console instead of emailing)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` — used only when you run the
  admin-seed command below

## 4. Run MongoDB (if local)
```bash
mongod --dbpath /path/to/your/data/db
```

## 5. Create the Admin account
Admin accounts can't be created through the public sign-up form (by design,
for security). Instead, seed one from your `.env` values:
```bash
npm run seed:admin
```
Run this again any time to reset the admin password.

## 6. Start the app
```bash
npm run dev     # development, auto-restarts on changes
npm start        # production
```
Open **http://localhost:3000**

## 7. Try it out
> ⚠️ Use **separate browser tabs** for different roles — sessions are isolated
> per tab (via `sessionStorage`) specifically so you can be logged in as a
> patient in one tab and a doctor in another, in the same browser, without
> them overwriting each other.

1. Register a Patient and a Doctor/Nurse (fill in address too).
2. Check the server console (or your inbox, if SMTP is set) for each
   6-digit verification code, and enter it on the verify page.
3. Log in as the Doctor/Nurse → toggle **"Go Online"** → allow location access.
4. Log in as the Patient (separate tab) → allow location access → **Search
   nearby** → **Request Visit**.
5. On the Provider tab, **Accept** the request — full patient details (phone,
   email, address) now show in the trip panel.
6. On the Patient tab, the provider's full details appear too, and their
   marker updates live on the map as they move, with distance remaining.
7. Log in as Admin (`npm run seed:admin` credentials) to see all users,
   ban/restrict/delete anyone, review every request, and view everyone's
   live location on one map.

## Project structure
```
medconnect/
├── server.js                  # App entry point + Socket.IO setup
├── config/db.js                # MongoDB connection
├── models/                     # User, Request (trip) schemas
├── routes/                     # auth, users, requests, admin REST APIs
├── middleware/                 # auth.js (JWT), adminOnly.js
├── utils/sendEmail.js          # Verification code sender
├── sockets/locationSocket.js   # Real-time location relay
├── scripts/createAdmin.js      # `npm run seed:admin`
└── public/                     # Frontend (HTML/CSS/JS)
    ├── index.html, register.html, login.html, verify.html
    ├── dashboard-patient.html / dashboard-doctor.html / dashboard-nurse.html
    ├── dashboard-admin.html
    ├── css/style.css
    └── js/ (api.js, register.js, patient-dashboard.js, provider-dashboard.js, admin-dashboard.js)
```

## Notes & next steps for production
- Swap the free OSRM demo routing server (Leaflet Routing Machine) for a
  self-hosted OSRM instance or paid routing API before real traffic.
- Add rate limiting, stricter input validation, and HTTPS.
- Add password reset, profile photos, ratings/reviews, and payments.
- Consider a geocoding search bar (Nominatim) so patients can type an
  address instead of relying solely on device GPS.
- Consider audit-logging admin actions (who banned/deleted whom, and when).
