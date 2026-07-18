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

        user_data = {

            "name": request.form["name"],
            "employee_id": request.form["employee_id"],
            "email": request.form["email"],
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

@app.route("/test")
def test():
    return "Firebase Connected Successfully!"

if __name__ == "__main__":
    app.run(debug=True)