2Hour Tracker Credit Hub MVP

ADMIN PASSWORD:
FUCKNUTZ22!

What was added:
- CREDIT HUB button on the main app header.
- Separate Credit Hub page/tab.
- Polygon browser wallet connect using window.ethereum.
- Trust Wallet open button.
- Username based on connected wallet address.
- Manual deposit requests for USDC / USDT / POL / SOL.
- Manual withdrawal requests for USDC / USDT / POL / SOL.
- Internal credits balance for casino/sportsbook.
- 0.05% fee calculation on deposits, withdrawals, sportsbook bets, casino wagers, and FUIT Coin admin actions.
- Sportsbook demo area for prematch/esports layout.
- Casino demo area to test win/loss and fee logic.
- Password-protected admin area.
- Admin can approve/reject deposits, mark withdrawals paid, settle bets, see online users, and add/remove credits.
- House dashboard shows coin balances, active credits, open liability, and fees.
- Separate admin-only FUIT Coin vault tracker, 1:1 with stablecoin backing.

Important:
- This is a local MVP UI + localStorage ledger, not a production gambling/payment backend.
- The Odds API is not wired to a live key yet; demo events are included so the page works now.
- Cloudflare URL files were left alone from the clean uploaded project.
- Test locally with: npm install, then npm start.
- If it works locally, commit and push to GitHub for Vercel.
