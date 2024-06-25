from dotenv import load_dotenv
load_dotenv()
from app import socketio

if __name__ == '__main__':
    from app import create_app
    app = create_app()
    socketio.run(app, host='0.0.0.0', port=5000)
