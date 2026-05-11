# Hauttagebuch – Neurodermitis Tracker

A personal skin diary for tracking neurodermatitis flares with automatic weather, pollen, food trigger, and medication logging.

**Live app:** https://zarxxy.github.io/neurodermitis_tracker/

## Stack

- React 18 + Vite
- Data stored locally in the browser (`localStorage`) — no backend, no account needed
- Weather & pollen data from [Open-Meteo](https://open-meteo.com/) (free, no API key)

## Local development

```bash
npm install
npm run dev
```

## Deployment (one-time setup)

1. Merge this branch to `main`
2. Go to **Settings → Pages → Source** and select **GitHub Actions**
3. Every subsequent push to `main` triggers an automatic build and deploy
