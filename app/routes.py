from flask import Blueprint, render_template, abort
from app import auth
from .util import csh_user_auth

main = Blueprint('main', __name__)
@main.route('/')
@auth.oidc_auth('default')
@csh_user_auth
def index(auth_dict=None):
    return render_template('search.html')

@main.route('/display')
def display():
    return render_template('display.html')


@main.route('/admin')
@auth.oidc_auth('default')
@csh_user_auth
def admin(auth_dict=None):
    if not auth_dict['admin']:
        abort(403)
    return render_template('admin.html')

@main.route('/logout')
def logout():
    session.clear()
    return redirect(auth.oidc_client_provider.logout())