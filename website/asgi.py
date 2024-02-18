import os
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.urls import path
from songs.consumers import SongConsumer

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'website.settings')
django.setup()
application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter([
            path('ws/songs/', SongConsumer.as_asgi()),
        ])
    ),
})