# Notify Receiver (Windows background app)

This is the receiver app for your laptop. When installed, it:

- Starts automatically when Windows starts, and stays running in the background (tray icon only, no window).
- Connects to your Notify room over the internet — works from any country as long as it has internet access.
- When the admin (phone) sends a notification, it shows a notification in the corner of the screen and plays a sound every 5 minutes, no matter what you do, until the PC sleeps or shuts down.
- Lets you change your display name any time from the tray icon menu.

## One-time setup after installing

1. Right-click the tray icon → **Set server URL…**
2. Paste your project's web address (the domain shown in your browser, e.g. `your-project-name.replit.app`). Do this once — publish the project first so the address doesn't change.
3. Right-click the tray icon → **Change name…** to set how you appear in the room.

That's it — leave it running. It reconnects automatically if the internet drops.

## Building the .exe

You need to turn this source folder into an actual `.exe` once. Pick whichever is easier for you:

### Option A — Build automatically on GitHub (no Windows needed)

1. Push this project (or just the `desktop-app` folder) to a GitHub repository.
2. GitHub Actions will automatically build the Windows installer (workflow file already included at `.github/workflows/build.yml`).
3. Open the **Actions** tab on GitHub → open the latest run → download the `notify-receiver-windows` artifact → unzip it → you'll find the installer `.exe` inside.
4. Run that installer on your laptop.

If it doesn't start automatically, open the **Actions** tab and click **Run workflow**.

### Option B — Build it yourself on a Windows PC

1. Install [Node.js](https://nodejs.org) (LTS version) if you don't have it.
2. Open a terminal in this `desktop-app` folder.
3. Run:
   ```
   npm install
   npm run dist
   ```
4. The installer `.exe` will appear in the `dist` folder. Run it.

The installer sets the app to launch on startup automatically — you don't need to do anything else after installing.
