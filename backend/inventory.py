"""Stock rules. Every function takes an open transaction (conn) so callers
can combine several steps and have them all roll back together."""

from fastapi import HTTPException


def audit(conn, action, entity, entity_id, details=""):
    conn.execute(
        "INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)",
        (action, entity, entity_id, details),
    )


def product_sku(conn, product_id):
    row = conn.execute("SELECT sku FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        raise HTTPException(400, f"Product {product_id} does not exist")
    return row["sku"]


def get_stock(conn, product_id, warehouse_id):
    """Return the stock row, creating an empty one if needed."""
    conn.execute(
        "INSERT OR IGNORE INTO stock (product_id, warehouse_id) VALUES (?, ?)",
        (product_id, warehouse_id),
    )
    return conn.execute(
        "SELECT * FROM stock WHERE product_id = ? AND warehouse_id = ?",
        (product_id, warehouse_id),
    ).fetchone()


def check_low_stock(conn, product_id, warehouse_id):
    """Open an alert when available stock hits the reorder level, resolve it when it recovers."""
    row = conn.execute(
        """SELECT s.on_hand - s.reserved AS available, p.reorder_level
           FROM stock s JOIN products p ON p.id = s.product_id
           WHERE s.product_id = ? AND s.warehouse_id = ?""",
        (product_id, warehouse_id),
    ).fetchone()
    open_alert = conn.execute(
        "SELECT id FROM alerts WHERE product_id = ? AND warehouse_id = ? AND status = 'OPEN'",
        (product_id, warehouse_id),
    ).fetchone()

    is_low = row["available"] <= row["reorder_level"]
    if is_low and not open_alert:
        conn.execute(
            "INSERT INTO alerts (product_id, warehouse_id, available) VALUES (?, ?, ?)",
            (product_id, warehouse_id, row["available"]),
        )
        audit(conn, "LOW_STOCK", "product", product_id, f"Available {row['available']} in warehouse {warehouse_id}")
    elif not is_low and open_alert:
        conn.execute("UPDATE alerts SET status = 'RESOLVED' WHERE id = ?", (open_alert["id"],))


def post_transaction(conn, product_id, warehouse_id, type, qty, reason="",
                     ref_type="", ref_id=None, reverses_id=None):
    """Write one ledger entry and apply it to on-hand stock. Returns the ledger id."""
    sku = product_sku(conn, product_id)
    stock = get_stock(conn, product_id, warehouse_id)
    if stock["on_hand"] + qty < stock["reserved"]:
        available = stock["on_hand"] - stock["reserved"]
        raise HTTPException(400, f"Not enough stock for {sku}: {available} available")

    conn.execute(
        "UPDATE stock SET on_hand = on_hand + ? WHERE product_id = ? AND warehouse_id = ?",
        (qty, product_id, warehouse_id),
    )
    cur = conn.execute(
        """INSERT INTO inventory_transactions
           (product_id, warehouse_id, type, qty, reason, ref_type, ref_id, reverses_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (product_id, warehouse_id, type, qty, reason, ref_type, ref_id, reverses_id),
    )
    check_low_stock(conn, product_id, warehouse_id)
    return cur.lastrowid


def reserve(conn, product_id, warehouse_id, qty):
    """Hold stock for a sales order so nobody else can sell it."""
    sku = product_sku(conn, product_id)
    stock = get_stock(conn, product_id, warehouse_id)
    available = stock["on_hand"] - stock["reserved"]
    if available < qty:
        raise HTTPException(400, f"Not enough stock for {sku}: {available} available, {qty} requested")
    conn.execute(
        "UPDATE stock SET reserved = reserved + ? WHERE product_id = ? AND warehouse_id = ?",
        (qty, product_id, warehouse_id),
    )
    check_low_stock(conn, product_id, warehouse_id)


def release(conn, product_id, warehouse_id, qty):
    """Give back reserved stock (order cancelled)."""
    conn.execute(
        "UPDATE stock SET reserved = reserved - ? WHERE product_id = ? AND warehouse_id = ?",
        (qty, product_id, warehouse_id),
    )
    check_low_stock(conn, product_id, warehouse_id)


def issue_reserved(conn, product_id, warehouse_id, qty, order_id):
    """Ship reserved stock: drop the reservation and write an ISSUE ledger entry."""
    conn.execute(
        "UPDATE stock SET reserved = reserved - ? WHERE product_id = ? AND warehouse_id = ?",
        (qty, product_id, warehouse_id),
    )
    return post_transaction(conn, product_id, warehouse_id, "ISSUE", -qty,
                            "Sales order shipped", "SALES_ORDER", order_id)
