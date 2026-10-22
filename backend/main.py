import os
import sqlite3

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import check_password, create_session, hash_password, require_user, token_from_header
from db import init_db, query, transaction
from inventory import audit, issue_reserved, post_transaction, release, reserve

app = FastAPI(title="Warehouse Management System")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Every route on this router needs a valid sign-in token
router = APIRouter(dependencies=[Depends(require_user)])


@app.exception_handler(sqlite3.IntegrityError)
def integrity_error(request: Request, exc: sqlite3.IntegrityError):
    # e.g. duplicate SKU, unknown supplier id, or trying to edit the ledger
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# ---------- Request bodies ----------

class LoginIn(BaseModel):
    username: str
    password: str


class WarehouseIn(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=1)


class ProductIn(BaseModel):
    sku: str = Field(min_length=1)
    name: str = Field(min_length=1)
    price: float = Field(default=0, ge=0)
    reorder_level: int = Field(default=10, ge=0)


class PartnerIn(BaseModel):
    name: str = Field(min_length=1)
    email: str = ""


class ItemIn(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    price: float = Field(default=0, ge=0)


class PurchaseOrderIn(BaseModel):
    supplier_id: int
    warehouse_id: int
    items: list[ItemIn] = Field(min_length=1)


class SalesOrderIn(BaseModel):
    customer_id: int
    warehouse_id: int
    items: list[ItemIn] = Field(min_length=1)


class AdjustmentIn(BaseModel):
    product_id: int
    warehouse_id: int
    qty: int  # positive adds stock, negative removes it
    reason: str = Field(min_length=1)


class TransferIn(BaseModel):
    product_id: int
    from_warehouse_id: int
    to_warehouse_id: int
    qty: int = Field(gt=0)
    reason: str = "Transfer"


class ReasonIn(BaseModel):
    reason: str = Field(min_length=1)


# ---------- Small helpers ----------

def insert(conn, table, data):
    """INSERT a dict into a table and return the new id."""
    columns = ", ".join(data)
    marks = ", ".join("?" for _ in data)
    cur = conn.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", list(data.values()))
    return cur.lastrowid


def get_order(conn, table, order_id, allowed_statuses):
    order = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (order_id,)).fetchone()
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in allowed_statuses:
        raise HTTPException(400, f"Order is {order['status']}, expected {' or '.join(allowed_statuses)}")
    return order


def set_status(conn, table, order_id, status):
    conn.execute(f"UPDATE {table} SET status = ? WHERE id = ?", (status, order_id))


def order_items(conn, items_table, order_id):
    return conn.execute(f"SELECT * FROM {items_table} WHERE order_id = ?", (order_id,)).fetchall()


def add_items_and_total(orders, items_table):
    # Load every line in one query, then hand each line to its order
    by_id = {}
    for order in orders:
        order["items"] = []
        by_id[order["id"]] = order
    lines = query(f"SELECT i.*, p.sku, p.name FROM {items_table} i JOIN products p ON p.id = i.product_id")
    for line in lines:
        if line["order_id"] in by_id:
            by_id[line["order_id"]]["items"].append(line)
    for order in orders:
        order["total"] = sum(item["qty"] * item["price"] for item in order["items"])
    return orders


# ---------- Sign in ----------

@app.post("/login")
def login(body: LoginIn):
    with transaction() as conn:
        user = conn.execute("SELECT * FROM users WHERE username = ?", (body.username,)).fetchone()
        if not user or not check_password(body.password, user["password_hash"]):
            raise HTTPException(401, "Wrong username or password")
        token = create_session(conn, user["id"])
        audit(conn, "LOGIN", "user", user["id"], user["username"])
    return {"token": token, "username": user["username"]}


@router.get("/me")
def me(user=Depends(require_user)):
    return user


@router.post("/logout")
def logout(authorization: str = Header(default="")):
    with transaction() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token_from_header(authorization),))
    return {"ok": True}


# ---------- Dashboard ----------

def number(sql):
    return query(sql)[0]["n"]


@router.get("/dashboard")
def dashboard():
    return {
        "products": number("SELECT COUNT(*) AS n FROM products"),
        "warehouses": number("SELECT COUNT(*) AS n FROM warehouses"),
        "units_on_hand": number("SELECT COALESCE(SUM(on_hand), 0) AS n FROM stock"),
        "stock_value": number(
            "SELECT COALESCE(SUM(s.on_hand * p.price), 0) AS n FROM stock s JOIN products p ON p.id = s.product_id"
        ),
        "open_purchase_orders": number(
            "SELECT COUNT(*) AS n FROM purchase_orders WHERE status IN ('DRAFT', 'APPROVED')"
        ),
        "open_sales_orders": number("SELECT COUNT(*) AS n FROM sales_orders WHERE status = 'RESERVED'"),
        "sales_last_7_days": sales_between(7, 0),
        "sales_previous_7_days": sales_between(14, 7),
        "orders_last_7_days": number(
            "SELECT COUNT(*) AS n FROM sales_orders WHERE status != 'CANCELLED' AND created_at >= datetime('now', '-7 days')"
        ),
        "sales_by_day": sales_by_day(30),
        "stock_by_warehouse": query("""
            SELECT w.code, w.name, COALESCE(SUM(s.on_hand * p.price), 0) AS value, COALESCE(SUM(s.on_hand), 0) AS units
            FROM warehouses w
            LEFT JOIN stock s ON s.warehouse_id = w.id
            LEFT JOIN products p ON p.id = s.product_id
            GROUP BY w.id ORDER BY value DESC
        """),
        "top_products": query("""
            SELECT p.sku, p.name, SUM(i.qty) AS units, SUM(i.qty * i.price) AS revenue
            FROM sales_order_items i
            JOIN sales_orders o ON o.id = i.order_id
            JOIN products p ON p.id = i.product_id
            WHERE o.status != 'CANCELLED' AND o.created_at >= datetime('now', '-30 days')
            GROUP BY p.id ORDER BY revenue DESC LIMIT 6
        """),
        "alerts": list_alerts(),
        "recent_activity": query("SELECT * FROM audit_log WHERE action != 'LOGIN' ORDER BY id DESC LIMIT 8"),
    }


# Times are stored in UTC; these shift them to India time so "a day" means an Indian day
IST = "+330 minutes"


def sales_between(days_ago_start, days_ago_end):
    """Value of sales orders (not cancelled) created between two points, in days before now."""
    return number(f"""
        SELECT COALESCE(SUM(i.qty * i.price), 0) AS n
        FROM sales_order_items i JOIN sales_orders o ON o.id = i.order_id
        WHERE o.status != 'CANCELLED'
          AND o.created_at >= datetime('now', '-{days_ago_start} days')
          AND o.created_at < datetime('now', '-{days_ago_end} days')
    """)


def sales_by_day(days):
    """Order value per day for the last `days` days, including days with no sales."""
    rows = query(f"""
        SELECT date(o.created_at, '{IST}') AS day, SUM(i.qty * i.price) AS value, COUNT(DISTINCT o.id) AS orders
        FROM sales_order_items i JOIN sales_orders o ON o.id = i.order_id
        WHERE o.status != 'CANCELLED' AND date(o.created_at, '{IST}') > date('now', '{IST}', '-{days} days')
        GROUP BY day
    """)
    by_day = {row["day"]: row for row in rows}
    result = []
    for n in range(days - 1, -1, -1):
        day = query(f"SELECT date('now', '{IST}', '-{n} days') AS d")[0]["d"]
        row = by_day.get(day, {"value": 0, "orders": 0})
        result.append({"day": day, "value": row["value"], "orders": row["orders"]})
    return result


@router.get("/counts")
def counts():
    """Small numbers for the sidebar badges."""
    return {
        "sales_orders": number("SELECT COUNT(*) AS n FROM sales_orders WHERE status = 'RESERVED'"),
        "purchase_orders": number("SELECT COUNT(*) AS n FROM purchase_orders WHERE status IN ('DRAFT', 'APPROVED')"),
        "alerts": number("SELECT COUNT(*) AS n FROM alerts WHERE status = 'OPEN'"),
    }


# ---------- Master data ----------

@router.get("/warehouses")
def list_warehouses():
    return query("SELECT * FROM warehouses ORDER BY code")


@router.post("/warehouses")
def create_warehouse(body: WarehouseIn):
    with transaction() as conn:
        new_id = insert(conn, "warehouses", body.model_dump())
        audit(conn, "CREATE", "warehouse", new_id, body.code)
    return {"id": new_id}


@router.get("/products")
def list_products():
    return query("""
        SELECT p.*,
               COALESCE(SUM(s.on_hand), 0) AS on_hand,
               COALESCE(SUM(s.on_hand - s.reserved), 0) AS available
        FROM products p LEFT JOIN stock s ON s.product_id = p.id
        GROUP BY p.id ORDER BY p.sku
    """)


@router.post("/products")
def create_product(body: ProductIn):
    with transaction() as conn:
        new_id = insert(conn, "products", body.model_dump())
        audit(conn, "CREATE", "product", new_id, body.sku)
    return {"id": new_id}


@router.get("/suppliers")
def list_suppliers():
    return query("SELECT * FROM suppliers ORDER BY name")


@router.post("/suppliers")
def create_supplier(body: PartnerIn):
    with transaction() as conn:
        new_id = insert(conn, "suppliers", body.model_dump())
        audit(conn, "CREATE", "supplier", new_id, body.name)
    return {"id": new_id}


@router.get("/customers")
def list_customers():
    return query("SELECT * FROM customers ORDER BY name")


@router.post("/customers")
def create_customer(body: PartnerIn):
    with transaction() as conn:
        new_id = insert(conn, "customers", body.model_dump())
        audit(conn, "CREATE", "customer", new_id, body.name)
    return {"id": new_id}


# ---------- Stock ----------

@router.get("/stock")
def list_stock(warehouse_id: int | None = None):
    sql = """
        SELECT s.*, s.on_hand - s.reserved AS available,
               p.sku, p.name, p.reorder_level, w.code AS warehouse
        FROM stock s
        JOIN products p ON p.id = s.product_id
        JOIN warehouses w ON w.id = s.warehouse_id
    """
    if warehouse_id:
        return query(sql + " WHERE s.warehouse_id = ? ORDER BY p.sku", (warehouse_id,))
    return query(sql + " ORDER BY w.code, p.sku")


@router.post("/adjustments")
def create_adjustment(body: AdjustmentIn):
    if body.qty == 0:
        raise HTTPException(400, "Quantity cannot be zero")
    with transaction() as conn:
        tx_id = post_transaction(conn, body.product_id, body.warehouse_id, "ADJUSTMENT",
                                 body.qty, body.reason, "MANUAL")
        audit(conn, "ADJUST", "inventory_transaction", tx_id, f"{body.qty:+d} ({body.reason})")
    return {"transaction_id": tx_id}


@router.post("/transfers")
def create_transfer(body: TransferIn):
    if body.from_warehouse_id == body.to_warehouse_id:
        raise HTTPException(400, "Pick two different warehouses")
    with transaction() as conn:
        out_id = post_transaction(conn, body.product_id, body.from_warehouse_id, "TRANSFER_OUT",
                                  -body.qty, body.reason, "TRANSFER")
        post_transaction(conn, body.product_id, body.to_warehouse_id, "TRANSFER_IN",
                         body.qty, body.reason, "TRANSFER", out_id)
        audit(conn, "TRANSFER", "inventory_transaction", out_id,
              f"{body.qty} units, warehouse {body.from_warehouse_id} -> {body.to_warehouse_id}")
    return {"transaction_id": out_id}


# ---------- Ledger ----------

@router.get("/transactions")
def list_transactions():
    return query("""
        SELECT t.*, p.sku, p.name, w.code AS warehouse,
               (SELECT r.id FROM inventory_transactions r WHERE r.reverses_id = t.id) AS reversed_by
        FROM inventory_transactions t
        JOIN products p ON p.id = t.product_id
        JOIN warehouses w ON w.id = t.warehouse_id
        ORDER BY t.id DESC LIMIT 200
    """)


@router.post("/transactions/{tx_id}/reverse")
def reverse_transaction(tx_id: int, body: ReasonIn):
    with transaction() as conn:
        original = conn.execute("SELECT * FROM inventory_transactions WHERE id = ?", (tx_id,)).fetchone()
        if not original:
            raise HTTPException(404, "Transaction not found")
        if original["type"] not in ("RECEIPT", "ISSUE", "ADJUSTMENT"):
            raise HTTPException(400, "Only receipts, issues and adjustments can be reversed")
        if conn.execute("SELECT id FROM inventory_transactions WHERE reverses_id = ?", (tx_id,)).fetchone():
            raise HTTPException(400, "This transaction was already reversed")

        new_id = post_transaction(conn, original["product_id"], original["warehouse_id"], "REVERSAL",
                                  -original["qty"], body.reason, original["ref_type"], original["ref_id"],
                                  reverses_id=tx_id)
        audit(conn, "REVERSE", "inventory_transaction", tx_id, f"Reversed by #{new_id}: {body.reason}")
    return {"transaction_id": new_id}


# ---------- Purchase orders ----------

@router.get("/purchase-orders")
def list_purchase_orders():
    orders = query("""
        SELECT po.*, s.name AS supplier, w.code AS warehouse
        FROM purchase_orders po
        JOIN suppliers s ON s.id = po.supplier_id
        JOIN warehouses w ON w.id = po.warehouse_id
        ORDER BY po.id DESC
    """)
    return add_items_and_total(orders, "purchase_order_items")


@router.post("/purchase-orders")
def create_purchase_order(body: PurchaseOrderIn):
    with transaction() as conn:
        order_id = insert(conn, "purchase_orders", {
            "supplier_id": body.supplier_id, "warehouse_id": body.warehouse_id, "status": "DRAFT",
        })
        for item in body.items:
            insert(conn, "purchase_order_items", {"order_id": order_id, **item.model_dump()})
        audit(conn, "CREATE", "purchase_order", order_id, f"{len(body.items)} line(s)")
    return {"id": order_id}


@router.post("/purchase-orders/{order_id}/approve")
def approve_purchase_order(order_id: int):
    with transaction() as conn:
        get_order(conn, "purchase_orders", order_id, ["DRAFT"])
        set_status(conn, "purchase_orders", order_id, "APPROVED")
        audit(conn, "APPROVE", "purchase_order", order_id)
    return {"ok": True}


@router.post("/purchase-orders/{order_id}/receive")
def receive_purchase_order(order_id: int):
    with transaction() as conn:
        order = get_order(conn, "purchase_orders", order_id, ["APPROVED"])
        for item in order_items(conn, "purchase_order_items", order_id):
            post_transaction(conn, item["product_id"], order["warehouse_id"], "RECEIPT", item["qty"],
                             "Purchase order received", "PURCHASE_ORDER", order_id)
        set_status(conn, "purchase_orders", order_id, "RECEIVED")
        audit(conn, "RECEIVE", "purchase_order", order_id)
    return {"ok": True}


@router.post("/purchase-orders/{order_id}/cancel")
def cancel_purchase_order(order_id: int):
    with transaction() as conn:
        get_order(conn, "purchase_orders", order_id, ["DRAFT", "APPROVED"])
        set_status(conn, "purchase_orders", order_id, "CANCELLED")
        audit(conn, "CANCEL", "purchase_order", order_id)
    return {"ok": True}


# ---------- Sales orders ----------

@router.get("/sales-orders")
def list_sales_orders():
    orders = query("""
        SELECT so.*, c.name AS customer, w.code AS warehouse
        FROM sales_orders so
        JOIN customers c ON c.id = so.customer_id
        JOIN warehouses w ON w.id = so.warehouse_id
        ORDER BY so.id DESC
    """)
    return add_items_and_total(orders, "sales_order_items")


@router.post("/sales-orders")
def create_sales_order(body: SalesOrderIn):
    # Everything below is one transaction: if any line is short on stock, nothing is saved
    with transaction() as conn:
        order_id = insert(conn, "sales_orders", {
            "customer_id": body.customer_id, "warehouse_id": body.warehouse_id, "status": "RESERVED",
        })
        for item in body.items:
            reserve(conn, item.product_id, body.warehouse_id, item.qty)
            insert(conn, "sales_order_items", {"order_id": order_id, **item.model_dump()})
        audit(conn, "CREATE", "sales_order", order_id, f"{len(body.items)} line(s), stock reserved")
    return {"id": order_id}


@router.post("/sales-orders/{order_id}/ship")
def ship_sales_order(order_id: int):
    with transaction() as conn:
        order = get_order(conn, "sales_orders", order_id, ["RESERVED"])
        for item in order_items(conn, "sales_order_items", order_id):
            issue_reserved(conn, item["product_id"], order["warehouse_id"], item["qty"], order_id)
        set_status(conn, "sales_orders", order_id, "SHIPPED")
        audit(conn, "SHIP", "sales_order", order_id)
    return {"ok": True}


@router.post("/sales-orders/{order_id}/cancel")
def cancel_sales_order(order_id: int):
    with transaction() as conn:
        order = get_order(conn, "sales_orders", order_id, ["RESERVED"])
        for item in order_items(conn, "sales_order_items", order_id):
            release(conn, item["product_id"], order["warehouse_id"], item["qty"])
        set_status(conn, "sales_orders", order_id, "CANCELLED")
        audit(conn, "CANCEL", "sales_order", order_id, "Reserved stock released")
    return {"ok": True}


# ---------- Alerts and audit ----------

@router.get("/alerts")
def list_alerts(status: str = "OPEN"):
    return query("""
        SELECT a.id, a.product_id, a.warehouse_id, a.status, a.created_at,
               a.available AS available_when_raised,
               s.on_hand - s.reserved AS available,
               p.sku, p.name, p.reorder_level, w.code AS warehouse
        FROM alerts a
        JOIN products p ON p.id = a.product_id
        JOIN warehouses w ON w.id = a.warehouse_id
        JOIN stock s ON s.product_id = a.product_id AND s.warehouse_id = a.warehouse_id
        WHERE a.status = ? ORDER BY available, a.id DESC
    """, (status,))


@router.get("/audit")
def list_audit():
    return query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 200")


# ---------- Startup ----------

def seed_admin():
    """Create the first user. Set ADMIN_PASSWORD before the first start to choose another password."""
    if query("SELECT id FROM users LIMIT 1"):
        return
    password = os.environ.get("ADMIN_PASSWORD", "Pass@123")
    with transaction() as conn:
        conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ("admin", hash_password(password)))
        audit(conn, "CREATE", "user", None, "admin")


app.include_router(router)

init_db()
seed_admin()

# A brand-new database gets 90 days of demo data (see seed.py)
if not query("SELECT id FROM warehouses LIMIT 1"):
    import seed
    seed.fill()
