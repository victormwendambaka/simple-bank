# Simple Bank

A dependency-free banking transaction interface. One HTML file, no build step. Data is saved in the browser's localStorage.

## Features

1. **Create a bank account** with an optional opening deposit
2. **Deposit** funds into an account
3. **Withdraw** funds (blocked if the balance is too low)
4. **Transfer** funds between two accounts
5. **Delete a dormant account**. An account is dormant after N days without activity (default 90, adjustable). It must also have a zero balance and no outstanding loan.
6. **Bonus: loan.** "Take 10,000 KES loan" creates a loan account (`LN-xxxx`) linked to the bank account and disburses KES 10,000 into it.

Amounts are stored in cents to avoid floating-point errors.

## Run it

Open `index.html` in a browser. To host it, enable GitHub Pages on the repo (Settings → Pages → deploy from `main`, root).

## Try the delete flow

A new account is never dormant, so set "Dormant after" to `0`, withdraw the balance to zero, then click Delete.

## Limitations

This is a demo. There is no authentication, no server, and no loan repayment, so an account with a loan cannot be deleted.