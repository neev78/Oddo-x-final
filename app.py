from database.firebase import db
from flask import Flask, render_template, request, redirect

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/login")
def login():
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
    return render_template("dashboard.html")

@app.route("/test")
def test():
    return "Firebase Connected Successfully!"

if __name__ == "__main__":
    app.run(debug=True)