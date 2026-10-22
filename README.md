# Warehouse Management System

Multi-warehouse inventory, purchase and sales order management.
React (Vite) frontend + FastAPI backend, SQLite through Python's built-in `sqlite3` (no SQLAlchemy).

## Run it

Backend (http://localhost:8000, API docs at /docs):
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend (http://localhost:5173):
```bash
cd frontend
npm install
npm run dev
```

The first start creates `backend/warehouse.db` and fills it with 90 days of realistic demo data:
4 warehouses (Mumbai, Delhi NCR, Bengaluru, Chennai), 31 products priced in rupees, 7 suppliers,
14 customers, about 1,150 sales orders, 170 purchase orders, transfers, adjustments and reversals.
A few products have supplier delays, so there are live low-stock alerts.

To wipe the database and generate fresh data (stop the backend first):
```bash
cd backend && .venv/bin/python seed.py
```

## Sign in
Default user: **admin** / **Pass@123**. To choose a different password, set it before the
first start (when the database is created): `ADMIN_PASSWORD='something' uvicorn main:app --reload`.

Passwords are stored as salted PBKDF2 hashes (Python's `hashlib`). Signing in creates a
session token valid for 7 days; every API route except `/login` requires it.

## Features
- **Warehouses, products, suppliers, customers**
- **Stock per warehouse** with on hand / reserved / available
- **Sales orders**: create (reserves stock) -> ship (issues stock) or cancel (releases it)
- **Purchase orders**: draft -> approve -> receive (adds stock) or cancel
- **Adjustments** (with a reason) and **transfers** between warehouses
- **Stock ledger**: every stock change is a record with type, reason and source document
- **Reversals**: mistakes are fixed by adding an opposite entry, never by editing history
- **Low-stock alerts** open automatically at the reorder level and close when stock recovers
- **Audit log** of every action
- **Sign in** with sessions; prices shown in Indian rupees (₹)

## How the backend keeps data correct
| File | What it does |
|---|---|
| `backend/db.py` | Tables, `transaction()` helper, read-only triggers |
| `backend/auth.py` | Password hashing, session tokens, `require_user` check |
| `backend/seed.py` | Demo data generator (simulates 90 days through the real business functions) |
| `backend/inventory.py` | Stock rules: reserve, release, post ledger entry, low-stock check |
| `backend/main.py` | API routes |

- Every action runs inside `with transaction() as conn:`. If any step fails (for example
  one line of a sales order is short on stock), everything rolls back.
- `BEGIN IMMEDIATE` takes the write lock at the start, so two orders can't reserve the same units.
- Database `CHECK` rules stop stock from going negative or reserved going above on hand.
- Triggers block `UPDATE`/`DELETE` on `inventory_transactions` and `audit_log`.
