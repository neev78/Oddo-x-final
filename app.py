from database.firebase import db
from flask import Flask, render_template, request, redirect, session, jsonify
from google.cloud.firestore_v1 import transactional
from google.cloud import firestore as firestore_module
import datetime
import uuid

app = Flask(__name__)
app.secret_key = "hackathon_secret_key"

# ─────────────────────────────────────────────
# Helper: get current user's Firestore doc ref
# ─────────────────────────────────────────────
def get_user_ref():
    """Return (doc_ref, doc_dict) for the logged-in user, or (None, None)."""
    if "user" not in session:
        return None, None
    email = session["user"]
    users = db.collection("Users").where("email", "==", email).stream()
    for u in users:
        return db.collection("Users").document(u.id), u.to_dict()
    return None, None


def get_user_ref_by_email(email):
    """Return doc_ref for a user by email."""
    users = db.collection("Users").where("email", "==", email).stream()
    for u in users:
        return db.collection("Users").document(u.id)
    return None


# ─────────────────────────────────────────────
# Existing Routes (unchanged)
# ─────────────────────────────────────────────
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        email = request.form["email"]
        password = request.form["password"]

        users = db.collection("Users").stream()

        for user in users:

            data = user.to_dict()

            if data["email"] == email and data["password"] == password:

                session["user"] = email

                return redirect("/dashboard")

        return render_template("login.html", error="Invalid Email or Password")

    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "POST":

        email = request.form["email"]

        # Check if email already exists
        users = db.collection("Users").where("email", "==", email).stream()

        for user in users:
            return render_template("register.html", error="Email already registered! Please login.")

        user_data = {
            "name": request.form["name"],
            "employee_id": request.form["employee_id"],
            "email": email,
            "phone": request.form["phone"],
            "password": request.form["password"],
            "gender": request.form.get("gender", "other"),
            "walletBalance": 500  # Default wallet balance for demo
        }

        db.collection("Users").add(user_data)

        return redirect("/login")

    return render_template("register.html")

@app.route("/dashboard")
def dashboard():

    if "user" not in session:

        return redirect("/login")

    return render_template("dashboard.html")

@app.route("/logout")
def logout():

    session.clear()

    return redirect("/")

@app.route("/create_ride", methods=["GET", "POST"])
def create_ride():

    if "user" not in session:
        return redirect("/login")

    if request.method == "POST":

        ride = {

            "pickup": request.form["pickup"],
            "destination": request.form["destination"],
            "date": request.form["date"],
            "time": request.form["time"],
            "seats": request.form["seats"],
            "vehicle": request.form["vehicle"],
            "price": request.form["price"],
            "driver": session["user"]

        }

        db.collection("Rides").add(ride)

        return redirect("/dashboard")

    return render_template("create_ride.html")

@app.route("/find_ride")
def find_ride():

    if "user" not in session:
        return redirect("/login")

    rides = []

    docs = db.collection("Rides").stream()

    for doc in docs:

        ride = doc.to_dict()
        ride["id"] = doc.id
        rides.append(ride)

    return render_template("find_ride.html", rides=rides)

@app.route("/commute_buddy")
def commute_buddy():
    if "user" not in session:
        return redirect("/login")

    current_email = session["user"]
    _, user_data = get_user_ref()

    # Check if the current user already has a buddy profile
    my_profile = None
    my_docs = db.collection("CommuteBuddies").where("email", "==", current_email).stream()
    for doc in my_docs:
        my_profile = doc.to_dict()
        my_profile["id"] = doc.id

    # Get filter params from query string
    women_only = request.args.get("women_only", "")
    search_area = request.args.get("area", "").strip().lower()

    # Fetch all buddy profiles except the current user
    all_buddies = []
    docs = db.collection("CommuteBuddies").stream()
    for doc in docs:
        buddy = doc.to_dict()
        buddy["id"] = doc.id
        if buddy.get("email") == current_email:
            continue
        # Apply Women Only filter
        if women_only == "yes" and buddy.get("gender") != "female":
            continue
        # Apply area search filter
        if search_area:
            pickup_match = search_area in buddy.get("area", "").lower()
            dest_match = search_area in buddy.get("destination", "").lower()
            if not pickup_match and not dest_match:
                continue
        all_buddies.append(buddy)

    return render_template("commute_buddy.html",
                           buddies=all_buddies,
                           my_profile=my_profile,
                           user_data=user_data,
                           women_only=women_only,
                           search_area=request.args.get("area", ""))

@app.route("/create_buddy", methods=["POST"])
def create_buddy():
    """Create or update a commute buddy profile in Firebase."""
    if "user" not in session:
        return redirect("/login")

    current_email = session["user"]
    _, user_data = get_user_ref()

    # Delete existing profile if any (one profile per user)
    existing = db.collection("CommuteBuddies").where("email", "==", current_email).stream()
    for doc in existing:
        db.collection("CommuteBuddies").document(doc.id).delete()

    buddy_data = {
        "name": user_data.get("name", "Unknown") if user_data else request.form.get("name", "Unknown"),
        "email": current_email,
        "phone": user_data.get("phone", "") if user_data else "",
        "gender": user_data.get("gender", "other") if user_data else request.form.get("gender", "other"),
        "area": request.form["area"],
        "destination": request.form["destination"],
        "schedule": request.form["schedule"],
        "department": request.form.get("department", ""),
        "note": request.form.get("note", ""),
        "women_only_preference": "yes" if request.form.get("women_only_pref") else "no"
    }

    db.collection("CommuteBuddies").add(buddy_data)
    return redirect("/commute_buddy")

@app.route("/delete_buddy/<buddy_id>", methods=["POST"])
def delete_buddy(buddy_id):
    """Remove your commute buddy listing."""
    if "user" not in session:
        return redirect("/login")

    doc_ref = db.collection("CommuteBuddies").document(buddy_id)
    doc = doc_ref.get()
    if doc.exists and doc.to_dict().get("email") == session["user"]:
        doc_ref.delete()

    return redirect("/commute_buddy")

@app.route("/sos")
def sos():
    if "user" not in session:
        return redirect("/login")
    return render_template("sos.html")

@app.route("/book_ride/<ride_id>", methods=["POST"])
def book_ride(ride_id):
    if "user" not in session:
        return redirect("/login")
    
    # 1. Fetch ride details
    ride_ref = db.collection("Rides").document(ride_id)
    ride_doc = ride_ref.get()
    
    if not ride_doc.exists:
        return "Ride not found", 404
        
    ride = ride_doc.to_dict()
    
    # 2. Check if seats are available
    try:
        available_seats = int(ride.get("seats", 0))
    except (ValueError, TypeError):
        available_seats = 0
        
    if available_seats <= 0:
        return "No seats available on this ride", 400
        
    # 3. Create booking record in Bookings collection
    booking = {
        "customer": session["user"],
        "pickup": ride.get("pickup"),
        "destination": ride.get("destination"),
        "vehicle": ride.get("vehicle"),
        "date": ride.get("date"),
        "time": ride.get("time"),
        "price": ride.get("price"),
        "driver": ride.get("driver"),
        "ride_id": ride_id,
        "status": "booked",
        "paymentStatus": "not_applicable"
    }
    db.collection("Bookings").add(booking)
    
    # 4. Decrement available seats by 1
    ride_ref.update({
        "seats": str(available_seats - 1)
    })
    
    return redirect("/ride_history")

@app.route("/ride_history")
def ride_history():
    if "user" not in session:
        return redirect("/login")
    
    current_user = session["user"]
    bookings = []

    # Get bookings where user is the customer
    customer_docs = db.collection("Bookings").where("customer", "==", current_user).stream()
    for doc in customer_docs:
        b = doc.to_dict()
        b["id"] = doc.id
        b["user_role"] = "rider"
        bookings.append(b)

    # Get bookings where user is the driver
    driver_docs = db.collection("Bookings").where("driver", "==", current_user).stream()
    for doc in driver_docs:
        b = doc.to_dict()
        b["id"] = doc.id
        b["user_role"] = "driver"
        # Avoid duplicates if user is both driver and customer (self-ride)
        if not any(existing["id"] == b["id"] for existing in bookings):
            bookings.append(b)
        
    return render_template("ride_history.html", bookings=bookings, current_user=current_user)


# ─────────────────────────────────────────────
# WALLET FEATURE ROUTES
# ─────────────────────────────────────────────

@app.route("/wallet")
def wallet():
    """Render wallet page. Auto-initialize walletBalance if missing."""
    if "user" not in session:
        return redirect("/login")

    user_ref, user_data = get_user_ref()
    if user_ref is None:
        return redirect("/login")

    # Auto-initialize walletBalance if it doesn't exist
    if "walletBalance" not in user_data or user_data["walletBalance"] is None:
        user_ref.update({"walletBalance": 500})

    return render_template("wallet.html")


@app.route("/api/wallet/balance")
def api_wallet_balance():
    """JSON endpoint returning current wallet balance."""
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_ref, user_data = get_user_ref()
    if user_ref is None:
        return jsonify({"error": "User not found"}), 404

    balance = user_data.get("walletBalance", 0)
    name = user_data.get("name", "User")
    return jsonify({"balance": balance, "name": name})


@app.route("/api/wallet/recharge", methods=["POST"])
def api_wallet_recharge():
    """Recharge wallet using Firestore transaction for atomicity."""
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401

    data = request.get_json()
    amount = data.get("amount", 0)
    method = data.get("method", "UPI")

    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid amount"}), 400

    if amount <= 0:
        return jsonify({"error": "Amount must be positive"}), 400

    if amount > 10000:
        return jsonify({"error": "Maximum recharge is ₹10,000"}), 400

    user_ref, _ = get_user_ref()
    if user_ref is None:
        return jsonify({"error": "User not found"}), 404

    # Atomic recharge using Firestore transaction
    transaction = db.transaction()

    @firestore_module.transactional
    def recharge_in_transaction(txn, ref, amt, mth):
        snapshot = ref.get(transaction=txn)
        current_balance = snapshot.get("walletBalance") or 0
        new_balance = current_balance + amt

        txn.update(ref, {"walletBalance": new_balance})

        # Log transaction in subcollection
        txn_ref = ref.collection("transactions").document()
        txn.set(txn_ref, {
            "type": "recharge",
            "amount": amt,
            "method": mth,
            "relatedRideId": None,
            "timestamp": firestore_module.SERVER_TIMESTAMP,
            "status": "success"
        })

        return new_balance

    try:
        new_balance = recharge_in_transaction(transaction, user_ref, amount, method)
        return jsonify({"success": True, "newBalance": new_balance})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/wallet/transactions")
def api_wallet_transactions():
    """Return recent transactions for the current user."""
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_ref, _ = get_user_ref()
    if user_ref is None:
        return jsonify({"error": "User not found"}), 404

    txns = []
    docs = user_ref.collection("transactions").order_by(
        "timestamp", direction=firestore_module.Query.DESCENDING
    ).limit(50).stream()

    for doc in docs:
        t = doc.to_dict()
        t["id"] = doc.id
        # Convert timestamp to string for JSON serialization
        if t.get("timestamp"):
            t["timestamp"] = t["timestamp"].isoformat()
        else:
            t["timestamp"] = None
        txns.append(t)

    return jsonify({"transactions": txns})


@app.route("/api/wallet/pending-payments")
def api_wallet_pending_payments():
    """Return bookings with status=completed and paymentStatus=pending for the current rider."""
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401

    current_user = session["user"]
    pending = []

    docs = db.collection("Bookings").where("customer", "==", current_user).where(
        "status", "==", "completed"
    ).where("paymentStatus", "==", "pending").stream()

    for doc in docs:
        b = doc.to_dict()
        b["id"] = doc.id
        pending.append(b)

    return jsonify({"pending": pending})


@app.route("/api/wallet/pay-ride", methods=["POST"])
def api_wallet_pay_ride():
    """Atomic Firestore transaction: deduct from rider, credit driver, log both."""
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401

    data = request.get_json()
    booking_id = data.get("booking_id")
    method = data.get("method", "UPI")

    if not booking_id:
        return jsonify({"error": "Missing booking_id"}), 400

    # Fetch booking
    booking_ref = db.collection("Bookings").document(booking_id)
    booking_doc = booking_ref.get()

    if not booking_doc.exists:
        return jsonify({"error": "Booking not found"}), 404

    booking = booking_doc.to_dict()

    if booking.get("paymentStatus") == "paid":
        return jsonify({"error": "Already paid"}), 400

    try:
        fare = float(booking.get("price", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid fare amount"}), 400

    rider_email = booking.get("customer")
    driver_email = booking.get("driver")

    rider_ref = get_user_ref_by_email(rider_email)
    driver_ref = get_user_ref_by_email(driver_email)

    if rider_ref is None or driver_ref is None:
        return jsonify({"error": "Rider or driver not found"}), 404

    # Atomic payment transaction
    transaction = db.transaction()

    @firestore_module.transactional
    def pay_in_transaction(txn, r_ref, d_ref, b_ref, fare_amount, ride_id, mth):
        # Read both balances inside the transaction
        rider_snap = r_ref.get(transaction=txn)
        driver_snap = d_ref.get(transaction=txn)

        rider_balance = rider_snap.get("walletBalance") or 0
        driver_balance = driver_snap.get("walletBalance") or 0

        if rider_balance < fare_amount:
            raise ValueError(f"Insufficient balance. You have ₹{rider_balance} but need ₹{fare_amount}")

        # Deduct from rider, credit driver
        txn.update(r_ref, {"walletBalance": rider_balance - fare_amount})
        txn.update(d_ref, {"walletBalance": driver_balance + fare_amount})

        # Log ride_payment_sent in rider's subcollection
        rider_txn_ref = r_ref.collection("transactions").document()
        txn.set(rider_txn_ref, {
            "type": "ride_payment_sent",
            "amount": fare_amount,
            "method": mth,
            "relatedRideId": ride_id,
            "timestamp": firestore_module.SERVER_TIMESTAMP,
            "status": "success"
        })

        # Log ride_payment_received in driver's subcollection
        driver_txn_ref = d_ref.collection("transactions").document()
        txn.set(driver_txn_ref, {
            "type": "ride_payment_received",
            "amount": fare_amount,
            "method": mth,
            "relatedRideId": ride_id,
            "timestamp": firestore_module.SERVER_TIMESTAMP,
            "status": "success"
        })

        # Mark booking as paid
        txn.update(b_ref, {"paymentStatus": "paid"})

        return rider_balance - fare_amount

    try:
        new_balance = pay_in_transaction(
            transaction, rider_ref, driver_ref, booking_ref,
            fare, booking.get("ride_id", booking_id), method
        )
        return jsonify({"success": True, "newBalance": new_balance})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ride/complete/<booking_id>", methods=["POST"])
def api_ride_complete(booking_id):
    """Driver marks a ride as completed, triggering payment-pending status."""
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401

    booking_ref = db.collection("Bookings").document(booking_id)
    booking_doc = booking_ref.get()

    if not booking_doc.exists:
        return jsonify({"error": "Booking not found"}), 404

    booking = booking_doc.to_dict()

    # Only the driver can mark as completed
    if booking.get("driver") != session["user"]:
        return jsonify({"error": "Only the driver can complete a ride"}), 403

    if booking.get("status") == "completed":
        return jsonify({"error": "Ride already completed"}), 400

    booking_ref.update({
        "status": "completed",
        "paymentStatus": "pending"
    })

    return jsonify({"success": True})


@app.route("/test")
def test():
    return "Firebase Connected Successfully!"

@app.route("/map")
def map_page():
    if "user" not in session:
        return redirect("/login")
    return render_template("map.html")    

if __name__ == "__main__":
    app.run(debug=True)