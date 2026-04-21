# Deploying to Render.com (free tier)

This app runs as a single Node service: Express + Puppeteer on the backend, React frontend built into `dist/` and served by the same Express process. One URL, no CORS.

## One-time setup

### 1. Put the code on GitHub

```bash
cd ielts-trf-react
git init
git add .
git commit -m "Initial commit"
```

Create an empty repo on GitHub (Private is fine), then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

### 2. Create the Render service

1. Sign up / log in at [dashboard.render.com](https://dashboard.render.com/).
2. Click **New → Blueprint**.
3. Connect your GitHub account and pick this repo.
4. Render reads [render.yaml](./render.yaml) automatically and proposes one Web Service named `ielts-trf-generator` on the Free plan. Click **Apply**.
5. First deploy takes ~5–8 minutes: installs deps, downloads Chromium (~300 MB), builds the React frontend.

### 3. (Recommended) Add a password

In the Render dashboard → your service → **Environment**, add:

| Key               | Value                          |
|-------------------|--------------------------------|
| `BASIC_AUTH_USER` | e.g. `admin`                   |
| `BASIC_AUTH_PASS` | a strong password you generate |

Save — Render redeploys automatically. The app now prompts for the username/password before anyone can access it. Share the credentials with teammates; health checks still work without auth so Render's uptime probe keeps passing.

### 4. Share the URL

Your app is at `https://<service-name>.onrender.com`. Bookmark it and share with teammates.

## Free-tier behaviour you should know

- **Sleeps after 15 min idle.** First request after a long gap takes ~30–40 seconds while the container wakes and Chromium warms up. Subsequent renders are normal speed.
- **Each month: 750 free instance hours.** One app running 24/7 fits comfortably.
- **Build cache keeps Chromium.** Between deploys, `node_modules` and the Puppeteer cache persist — redeploys take ~1 minute instead of 5.
- **512 MB RAM.** Enough for the warmup Chromium + ~4 concurrent PDF renders. If a big batch (40+ students) times out, lower the concurrency in [src/App.jsx](./src/App.jsx) from `4` to `2`.

## Optional: prevent cold starts with UptimeRobot

If teammates hate the 30-second wake-up delay, add a free uptime monitor that pings `/api/health` every 5 minutes:

1. Sign up at [uptimerobot.com](https://uptimerobot.com/) (free, no card).
2. **+ New Monitor** → Type: HTTP(s) → URL: `https://<your-app>.onrender.com/api/health` → Interval: 5 min.
3. That keeps the Render instance awake permanently. Trade-off: you consume more of your 750 free hours per month, but 24/7 uptime = 720 hours which still fits.

## Font fidelity on Linux vs Windows

The real Microsoft fonts (Times New Roman, Arial, Brush Script MT) aren't installed on Render's Ubuntu runtime. The template lists Google Fonts with matching metrics as fallbacks:

| Windows font       | Linux fallback (Google) |
|--------------------|-------------------------|
| Times New Roman    | Tinos                   |
| Arial / Arial Black| Arimo                   |
| Brush Script MT    | Great Vibes             |

These are **metric-compatible** — same character widths and line heights — so your PDFs look nearly identical on both platforms. The Google Fonts are fetched once per render (cached by Chromium), adding ~100 ms to the first cold render of the day.

## Local development unchanged

Everything still works locally. From the project folder:

```bash
npm run dev    # Vite UI on :5173 (or next free port) + Express on :3001
```

The Vite dev server proxies `/api/*` to `http://localhost:3001`, so the frontend behaves the same as in production.

## Troubleshooting

- **Build fails with "Failed to download Chromium"** — retry the deploy; Render sometimes rate-limits first-time Chromium downloads. After one successful build the cache makes this a non-issue.
- **PDFs show boxes / wrong fonts** — Google Fonts couldn't load. Check `/api/health` returns 200 and that the service has outbound internet (it does by default on Render).
- **"Cannot launch browser"** — Usually means the Chromium binary went missing from cache after an environment change. Go to **Manual Deploy → Clear build cache & deploy** in the Render dashboard.
- **Out-of-memory at 40+ students** — Drop the client-side concurrency from 4 to 2 in [src/App.jsx](./src/App.jsx) (search for `CONCURRENCY`).
