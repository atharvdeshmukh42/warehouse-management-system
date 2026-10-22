"""Realistic demo data: 90 days of purchasing, sales, transfers and adjustments
across four Indian warehouses.

Everything goes through the same functions the API uses, so stock, ledger,
alerts and the audit log always agree with each other.

Run `python seed.py` to wipe the database and fill it again.
"""

import heapq
import os
import random
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from db import DB_PATH, connect, init_db, query

IST = timezone(timedelta(hours=5, minutes=30))
DAYS = 90

WAREHOUSES = [
    ("MUM1", "Mumbai – Bhiwandi DC"),
    ("DEL1", "Delhi NCR – Gurugram Hub"),
    ("BLR1", "Bengaluru – Hoskote FC"),
    ("CHN1", "Chennai – Sriperumbudur Depot"),
]
# How busy each warehouse is (same order as WAREHOUSES)
DEMAND = [1.0, 0.85, 0.7, 0.5]

SUPPLIERS = [
    ("pack", "Shree Ganesh Packaging Pvt Ltd", "sales@shreeganeshpack.example"),
    ("poly", "Bharat Polymers", "orders@bharatpolymers.example"),
    ("tech", "Techlink Electronics Distributors", "b2b@techlink.example"),
    ("office", "Nexa Office Supplies", "sales@nexaoffice.example"),
    ("kitchen", "Kitchen Kraft Industries", "orders@kitchenkraft.example"),
    ("agro", "Annapurna Agro Foods", "supply@annapurnaagro.example"),
    ("care", "Sunrise Home Care LLP", "sales@sunrisehomecare.example"),
]

# sku, name, selling price (₹), reorder level, supplier
PRODUCTS = [
    ("PKG-BOX-S", "Corrugated Box 12×10×8 in", 38, 200, "pack"),
    ("PKG-BOX-L", "Corrugated Box 18×14×12 in", 72, 150, "pack"),
    ("PKG-TAPE", "BOPP Packing Tape 48 mm × 65 m", 55, 200, "pack"),
    ("PKG-LABL", "Thermal Labels 4×6 in (500/roll)", 420, 30, "pack"),
    ("PKG-BUBL", "Bubble Wrap Roll 1 m × 50 m", 890, 20, "poly"),
    ("PKG-FILM", "Stretch Film Roll 18 in", 640, 25, "poly"),
    ("ELE-CBL-C", "USB-C Cable 1 m", 249, 80, "tech"),
    ("ELE-CHG-25", "USB-C Fast Charger 25 W", 899, 40, "tech"),
    ("ELE-MOU-W", "Wireless Optical Mouse", 649, 40, "tech"),
    ("ELE-KEY-USB", "USB Keyboard, Full Size", 1199, 25, "tech"),
    ("ELE-PEN-32", "32 GB USB Pen Drive", 399, 60, "tech"),
    ("ELE-PWB-10K", "Power Bank 10,000 mAh", 1499, 25, "tech"),
    ("ELE-EAR-BT", "Bluetooth Earbuds", 1999, 20, "tech"),
    ("ELE-LED-9W", "LED Bulb 9 W, Cool Daylight", 99, 150, "tech"),
    ("ELE-EXT-4", "Extension Board, 4 Sockets", 549, 40, "tech"),
    ("OFF-A4-500", "A4 Copier Paper 75 gsm (500 sheets)", 310, 100, "office"),
    ("OFF-PEN-50", "Blue Ball Pens (box of 50)", 250, 60, "office"),
    ("OFF-STPL", "Stapler No. 10", 180, 40, "office"),
    ("OFF-MRK-10", "Whiteboard Markers (pack of 10)", 220, 50, "office"),
    ("OFF-FILE", "Box File, Foolscap", 95, 80, "office"),
    ("KIT-BTL-1L", "Steel Water Bottle 1 L", 450, 40, "kitchen"),
    ("KIT-LBX", "Steel Lunch Box, 3 Tier", 699, 30, "kitchen"),
    ("KIT-PCK-5L", "Pressure Cooker 5 L", 1850, 15, "kitchen"),
    ("KIT-TAWA", "Non-stick Tawa 28 cm", 799, 20, "kitchen"),
    ("GRO-RICE-5", "Basmati Rice 5 kg", 625, 60, "agro"),
    ("GRO-DAL-1", "Toor Dal 1 kg", 165, 100, "agro"),
    ("GRO-OIL-1", "Sunflower Oil 1 L", 145, 120, "agro"),
    ("GRO-TEA-500", "Assam Tea 500 g", 280, 60, "agro"),
    ("HOM-HW-250", "Hand Wash 250 ml", 95, 100, "care"),
    ("HOM-DET-1", "Detergent Powder 1 kg", 180, 80, "care"),
    ("HOM-FLR-1", "Floor Cleaner 1 L", 199, 60, "care"),
]

# These products have had no deliveries for 6 weeks, so they run low
SUPPLY_PROBLEMS = {"ELE-EAR-BT", "KIT-PCK-5L", "PKG-BUBL"}

CUSTOMERS = [
    "Patel Retail Mart", "Kumar Electronics", "Sharma Office Solutions", "Green Basket Supermarket",
    "Iyer & Sons Traders", "Metro Kirana Stores", "Deccan Home Needs", "Royal Stationers",
    "QuickCart Online Pvt Ltd", "Hotel Saffron Inn", "Nair Distributors", "Gupta General Store",
    "Sai Krupa Enterprises", "Bluewave Coworking",
]

# reason, smallest change, biggest change
ADJUSTMENTS = [
    ("Damaged in transit", -6, -1),
    ("Cycle count variance", -8, 8),
    ("Found during stock take", 1, 6),
    ("Water damage in storage", -10, -2),
    ("Customer return, resaleable", 1, 4),
]

# Tables whose created_at we set to the simulated time
DATED_TABLES = ["purchase_orders", "sales_orders", "inventory_transactions", "alerts", "audit_log"]


# ---------- Simulated clock ----------

def last_ids():
    return {t: query(f"SELECT COALESCE(MAX(id), 0) AS n FROM {t}")[0]["n"] for t in DATED_TABLES}


def backdate(since, when):
    """Stamp every row created after `since` with the simulated time `when`."""
    stamp = when.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    conn = connect()
    conn.execute("BEGIN")
    for table in DATED_TABLES:
        conn.execute(f"UPDATE {table} SET created_at = ? WHERE id > ?", (stamp, since[table]))
    conn.execute("COMMIT")
    conn.close()


def business_hours(when):
    """Move a time into working hours (9:30 to 19:00, Monday to Saturday)."""
    if when.hour >= 19:
        when = (when + timedelta(days=1)).replace(hour=9, minute=30)
    elif when.hour < 9 or (when.hour == 9 and when.minute < 30):
        when = when.replace(hour=9, minute=30)
    if when.weekday() == 6:  # Sunday
        when = (when + timedelta(days=1)).replace(hour=9, minute=30)
    return when + timedelta(minutes=random.randint(0, 50))


def later(when, min_hours, max_hours):
    return business_hours(when + timedelta(hours=random.uniform(min_hours, max_hours)))


def random_time(day):
    return day.replace(hour=random.randint(9, 18), minute=random.randint(0, 59))


class Timeline:
    """Runs events in time order. Events can schedule more events (e.g. ship an order later)."""

    def __init__(self):
        self.queue = []
        self.count = 0

    def add(self, when, action, *args):
        heapq.heappush(self.queue, (when, self.count, action, args))
        self.count += 1

    def run(self, until):
        while self.queue:
            when, _, action, args = heapq.heappop(self.queue)
            if when > until:
                continue  # still in the future: leave the order open
            before = last_ids()
            try:
                action(when, *args)
            except HTTPException:
                pass  # e.g. stock ran out before this happened; skip it like a real warehouse would
            backdate(before, when)


def available(warehouse_id, product_id):
    rows = query("SELECT on_hand - reserved AS n FROM stock WHERE warehouse_id = ? AND product_id = ?",
                 (warehouse_id, product_id))
    return rows[0]["n"] if rows else 0


# ---------- The simulation ----------

def fill():
    import main  # imported here so main.py can call fill() while it starts up

    random.seed(7)
    now = datetime.now(IST)
    start = (now - timedelta(days=DAYS)).replace(hour=9, minute=0, second=0, microsecond=0)
    timeline = Timeline()
    incoming = {}  # (warehouse_id, product_id) -> units on open purchase orders

    # Backdating needs to edit created_at, so lift the "no update" rules while seeding
    conn = connect()
    conn.execute("DROP TRIGGER IF EXISTS ledger_no_update")
    conn.execute("DROP TRIGGER IF EXISTS audit_no_update")
    conn.close()

    # --- Master data ---
    before = last_ids()
    warehouse_ids = [main.create_warehouse(main.WarehouseIn(code=c, name=n))["id"] for c, n in WAREHOUSES]
    supplier_ids = {key: main.create_supplier(main.PartnerIn(name=n, email=e))["id"] for key, n, e in SUPPLIERS}
    customer_ids = []
    for name in CUSTOMERS:
        email = "purchase@" + name.lower().replace("&", "and").replace(" ", "").replace(".", "") + ".example"
        customer_ids.append(main.create_customer(main.PartnerIn(name=name, email=email))["id"])
    products = []
    for sku, name, price, reorder, supplier in PRODUCTS:
        new = main.create_product(main.ProductIn(sku=sku, name=name, price=price, reorder_level=reorder))
        products.append({"id": new["id"], "sku": sku, "price": price, "reorder": reorder, "supplier": supplier})
    backdate(before, start)

    # --- Opening stock ---
    before = last_ids()
    for warehouse_id in warehouse_ids:
        for p in products:
            qty = random.randint(p["reorder"] * 2, p["reorder"] * 4)
            main.create_adjustment(main.AdjustmentIn(
                product_id=p["id"], warehouse_id=warehouse_id, qty=qty, reason="Opening stock"))
    backdate(before, start + timedelta(minutes=40))

    # --- Sales ---
    def sell(when, warehouse_id):
        lines = []
        for p in random.sample(products, random.randint(1, 4)):
            qty = random.randint(1, max(2, p["reorder"] // 2))
            if available(warehouse_id, p["id"]) >= qty:
                lines.append(main.ItemIn(product_id=p["id"], qty=qty, price=p["price"]))
        if not lines:
            return
        order = main.create_sales_order(main.SalesOrderIn(
            customer_id=random.choice(customer_ids), warehouse_id=warehouse_id, items=lines))
        if random.random() < 0.07:
            timeline.add(later(when, 1, 30), cancel_sale, order["id"])
        else:
            timeline.add(later(when, 3, 60), ship, order["id"])

    def ship(when, order_id):
        main.ship_sales_order(order_id)

    def cancel_sale(when, order_id):
        main.cancel_sales_order(order_id)

    # --- Purchasing: every morning, reorder anything running low ---
    def replenish(when, warehouse_id):
        lines_by_supplier = {}
        for p in products:
            if p["sku"] in SUPPLY_PROBLEMS and when > now - timedelta(days=42):
                continue
            stock_coming = available(warehouse_id, p["id"]) + incoming.get((warehouse_id, p["id"]), 0)
            if stock_coming <= p["reorder"] * 1.5:
                qty = p["reorder"] * random.randint(3, 5)
                cost = round(p["price"] * 0.7, 2)
                line = main.ItemIn(product_id=p["id"], qty=qty, price=cost)
                lines_by_supplier.setdefault(p["supplier"], []).append(line)

        for supplier, lines in lines_by_supplier.items():
            order = main.create_purchase_order(main.PurchaseOrderIn(
                supplier_id=supplier_ids[supplier], warehouse_id=warehouse_id, items=lines))
            for line in lines:
                key = (warehouse_id, line.product_id)
                incoming[key] = incoming.get(key, 0) + line.qty
            if random.random() < 0.05:
                timeline.add(later(when, 2, 24), cancel_purchase, order["id"], warehouse_id, lines)
            else:
                timeline.add(later(when, 2, 30), approve, order["id"], warehouse_id, lines)

    def approve(when, order_id, warehouse_id, lines):
        main.approve_purchase_order(order_id)
        timeline.add(later(when, 48, 140), receive, order_id, warehouse_id, lines)

    def receive(when, order_id, warehouse_id, lines):
        main.receive_purchase_order(order_id)
        no_longer_incoming(warehouse_id, lines)

    def cancel_purchase(when, order_id, warehouse_id, lines):
        main.cancel_purchase_order(order_id)
        no_longer_incoming(warehouse_id, lines)

    def no_longer_incoming(warehouse_id, lines):
        for line in lines:
            incoming[(warehouse_id, line.product_id)] -= line.qty

    # --- Weekly transfers from the fullest warehouse to the emptiest ---
    def rebalance(when):
        moves = 0
        for p in random.sample(products, len(products)):
            levels = {w: available(w, p["id"]) for w in warehouse_ids}
            fullest = max(levels, key=levels.get)
            emptiest = min(levels, key=levels.get)
            if levels[emptiest] < p["reorder"] and levels[fullest] > p["reorder"] * 3:
                main.create_transfer(main.TransferIn(
                    product_id=p["id"], from_warehouse_id=fullest, to_warehouse_id=emptiest,
                    qty=p["reorder"], reason="Weekly stock rebalancing"))
                moves += 1
            if moves == 3:
                break

    # --- Day-to-day adjustments ---
    def adjust(when):
        p = random.choice(products)
        reason, smallest, biggest = random.choice(ADJUSTMENTS)
        qty = random.randint(smallest, biggest) or 1
        main.create_adjustment(main.AdjustmentIn(
            product_id=p["id"], warehouse_id=random.choice(warehouse_ids), qty=qty, reason=reason))

    # --- A typo that gets reversed, then entered correctly ---
    def typo(when):
        p = random.choice(products)
        warehouse_id = random.choice(warehouse_ids)
        right = random.randint(3, 9)
        wrong = main.create_adjustment(main.AdjustmentIn(
            product_id=p["id"], warehouse_id=warehouse_id, qty=right * 10, reason="Found during stock take"))
        timeline.add(when + timedelta(minutes=random.randint(15, 60)), fix_typo,
                     wrong["transaction_id"], p, warehouse_id, right)

    def fix_typo(when, transaction_id, p, warehouse_id, right):
        main.reverse_transaction(transaction_id, main.ReasonIn(reason="Typed an extra zero"))
        main.create_adjustment(main.AdjustmentIn(
            product_id=p["id"], warehouse_id=warehouse_id, qty=right, reason="Found during stock take"))

    # --- Plan the 90 days ---
    for day_number in range(1, DAYS + 1):
        day = start + timedelta(days=day_number)
        if day.weekday() == 6:
            continue  # closed on Sundays
        for warehouse_id, demand in zip(warehouse_ids, DEMAND):
            timeline.add(day.replace(hour=10, minute=5), replenish, warehouse_id)
            for _ in range(random.randint(2, round(7 * demand))):
                timeline.add(random_time(day), sell, warehouse_id)
        if day.weekday() == 0:
            timeline.add(day.replace(hour=11, minute=30), rebalance)
        if random.random() < 0.4:
            timeline.add(random_time(day), adjust)
    for day_number in random.sample(range(10, DAYS - 3), 3):
        timeline.add(random_time(start + timedelta(days=day_number)), typo)

    timeline.run(until=now)
    init_db()  # put the read-only rules back


if __name__ == "__main__":
    for path in (DB_PATH, DB_PATH + "-journal"):
        if os.path.exists(path):
            os.remove(path)
    print("Generating 90 days of demo data…")
    import main  # starting the app on an empty database calls fill()
    for table in ["warehouses", "products", "customers", "suppliers", "purchase_orders",
                  "sales_orders", "inventory_transactions", "alerts", "audit_log"]:
        print(f"  {table}: {query(f'SELECT COUNT(*) AS n FROM {table}')[0]['n']}")
