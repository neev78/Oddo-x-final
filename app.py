from database.firebase import db
from flask import Flask, render_template, request, redirect, session

app = Flask(__name__)
app.secret_key = "hackathon_secret_key"

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
            "password": request.form["password"]
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
    return render_template("commute_buddy.html")

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
        "ride_id": ride_id
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
        
    bookings = []
    docs = db.collection("Bookings").where("customer", "==", session["user"]).stream()
    for doc in docs:
        b = doc.to_dict()
        b["id"] = doc.id
        bookings.append(b)
        
    return render_template("ride_history.html", bookings=bookings)

@app.route("/test")
def test():
    return "Firebase Connected Successfully!"

if __name__ == "__main__":
    app.run(debug=True)