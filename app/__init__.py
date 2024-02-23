from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from config import Config

db = SQLAlchemy()
socketio = SocketIO()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    socketio.init_app(app)

    # Import the blueprint and register it with the Flask application
    from app.routes import main as main_blueprint
    app.register_blueprint(main_blueprint)

    from app import models, events

    return app
