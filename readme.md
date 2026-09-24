# Simple Bank

A dependency-free banking demo: `index.html`, `style.css`, `app.js`. No build step; data lives in the browser's localStorage.

## Features
- **Overview:** totals and clickable account cards (click one to select it for transactions)
- **Transact:** deposit, withdraw, transfer, repay loan, all with inline validation (e.g. "Insufficient balance") and currency-masked amount fields
- **Manage:** create account, take a 10,000 KES loan (creates a linked loan account), delete a dormant account, load sample data, reset all data
- **Activity:** search plus filters by account, type and date range

Deleting needs the account to be dormant (no activity for N days, default 90), have a zero balance, and have no outstanding loan.

## Run it
Open `index.html` in a browser (or use the VS Code Live Server extension). Use "Load sample data" in Manage to try it fast; ACC-1003 is already dormant.

Amounts are stored in cents to avoid floating-point errors. Demo only: no authentication or server.
