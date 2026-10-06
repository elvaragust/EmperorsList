# EmperorsList relay

A 40-line Cloudflare Worker so the app can update stratagems in one tap. Wahapedia blocks browsers from fetching its export files directly; this passes through only those CSV files and adds the header browsers need. It stores nothing.

## Deploy once (free Cloudflare account)

```bash
cd relay
npx wrangler@3 login      # opens the browser once
npx wrangler@3 deploy     # prints a URL like https://emperorslist-relay.<you>.workers.dev
```

Or paste `worker.js` into Cloudflare dashboard → Workers → Create → "Hello World" → Edit code → Deploy.

Then in the app: **Settings → Extra rules → Relay URL**, paste the URL, and tap **Update stratagems**.

Test it: open `https://emperorslist-relay.<you>.workers.dev/wahapedia/Factions.csv` — you should see a CSV.

Data from Wahapedia — "Powered by Wahapedia". Keep it for personal use.
