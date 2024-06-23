from flask import Blueprint, redirect, render_template, abort, session, url_for
from .util import csh_user_auth

def create_main_blueprint(auth):
    main = Blueprint('main', __name__)
    
    @main.route('/')
    @auth.oidc_auth('default')
    @csh_user_auth
    def index(auth_dict=None):
        if auth_dict is None:
            return "Something went wrong with the authentication, please try to login again.", 400
        return render_template('search.html', auth_dict=auth_dict)
    
    @main.route('/display')
    def display():
        return render_template('display.html')
    
    @main.route('/admin')
    @auth.oidc_auth('default')
    @csh_user_auth
    def admin(auth_dict=None):
        if not auth_dict['admin']:
            abort(403)
        return render_template('admin.html', auth_dict=auth_dict)
    
    @main.route("/logout")
    @auth.oidc_logout
    def logout():
        return redirect(url_for('main.index'))

    return main

def oidc_callback(auth_response):
    return redirect(url_for('main.index'))
