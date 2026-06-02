# FUITS Live TV App Notes

Local project folder:
`C:\Users\newer\Desktop\MASTER FUIT START\DAILY MAINTENCE\BACKED UP GITHUB + VERCEL FILES\hours-tracker`

Production site:
`https://flivetv.qzz.io/`

GitHub remote:
`https://github.com/bdfnote20ultra-bot/2hour-tracker`

Before editing or pushing, update this folder first:

```powershell
git pull --rebase --autostash origin main
```

Then make the change, verify it builds, commit, and push:

```powershell
npm run build
git add src/App.js src/fattysLiveTvData.js PROJECT_NOTES.md
git commit -m "Describe the app change"
git push origin main
```

Important:
- `src/App.js` is the main React app file for the left navigation and FUITS Live TV panel.
- `src/fattysLiveTvData.js` stores the public FUITS Live TV base URL.
- The left-side links should stay visible as direct buttons. Do not put the discounts/jobs-style links inside a dropdown.
- Keep the existing discounts list visible before adding new items: `AVAILABLE RESIDENCE`, `EMERGENCY PLANNING!`, `FAMILY HUB`, `PROGRAMMING`, `HOUSING + LAND FOR SALE`, `RADIO + COMMUNICATION`, then `JOBS BOARD`.
- New left-side pages go under `JOBS BOARD`: `SPIRITUALISM`, `SCIENCE`, `USER REQUEST & UPLOADS`, `ITEMS / SERVICES FOR SALE`, `FOOD AND COOKING`.
- The FUITS Live TV Restart button in the app should restart the current `.mp4` playlist video from the beginning, not call `/admin/restart-services`.
- The Gaming Center `FUIT LIVE GAMING` tab embeds Kick channel `flivetv` with `https://player.kick.com/flivetv?autoplay=true&muted=true`; the channel input is saved in localStorage under `fuitLiveGamingKickChannel_v1`.
- The Gaming Center also has a starter blank tab named `FUIT LIVE GAMING YOUTUBE` for a future YouTube live embed.
- If Git says the remote has newer work, use `git pull --rebase --autostash origin main`, resolve conflicts by keeping the newest remote live-stream code, then re-apply only the requested UI behavior.
