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

        return "Invalid Email or Password"

    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "POST":

        email = request.form["email"]

        # Check if email already exists
        users = db.collection("Users").where("email", "==", email).stream()

        for user in users:
            return "Email already registered! Please login."

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

@app.route("/test")
def test():
    return "Firebase Connected Successfully!"

if __name__ == "__main__":
    app.run(debug=True)