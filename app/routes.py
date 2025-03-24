from flask import Blueprint, redirect, render_template, abort, session, url_for, send_from_directory, jsonify, request
import os
from .util import csh_user_auth

display_user = None  # Global variable to track the active display user

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
        global display_user
        uid = session.get('uid')
        
        # Ensure only one active display session
        if display_user is None:
            display_user = uid  # Set current user as the active display user
            return render_template('display.html')
        elif display_user == uid:
            return render_template('display.html')
        else:
            # Redirect if another user tries to access the display page
            return redirect(url_for('main.index'))

    @main.route('/leave_display')
    def leave_display():
        global display_user
        uid = session.get('uid')
        
        # Free the display if the current user leaves
        if display_user == uid:
            display_user = None
        return redirect(url_for('main.index'))

    @main.route('/admin')
    @auth.oidc_auth('default')
    @csh_user_auth
    def admin(auth_dict=None):
        if not auth_dict.get('admin'):
            abort(403)
        return render_template('admin.html', auth_dict=auth_dict)

    @main.route("/logout")
    @auth.oidc_logout
    def logout():
        return redirect(url_for('main.index'))

    return main

def oidc_callback(auth_response):
    return redirect(url_for('main.index'))
