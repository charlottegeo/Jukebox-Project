#app/routes.py

from flask import Blueprint, render_template

main = Blueprint('main', __name__)
@main.route('/')
def index():
    return render_template('search.html')

@main.route('/display')
def display():
    return render_template('display.html')