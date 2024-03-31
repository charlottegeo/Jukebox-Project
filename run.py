from app import app, socketio

# Export the Flask application wrapped by SocketIO for Gunicorn
application = socketio.WSGIApp(socketio, app)

if __name__ == '__main__':
    socketio.run(app, debug=True)
