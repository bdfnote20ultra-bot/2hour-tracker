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
- The FUITS Live TV Restart button in the app should restart the current video from the beginning, not call `/admin/restart-services`.
- If Git says the remote has newer work, use `git pull --rebase --autostash origin main`, resolve conflicts by keeping the newest remote live-stream code, then re-apply only the requested UI behavior.
