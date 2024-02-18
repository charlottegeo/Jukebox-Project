#consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer
import json
import os
from SpotifyAPI.main import *
from .models import Song, Queue
import logging
from asgiref.sync import sync_to_async
#this script handles websocket connections
 
logger = logging.getLogger(__name__)
class SongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        await self.add_to_group()

    async def disconnect(self, code):
        await self.remove_from_group()

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data)
            action = data.get('action')

            match action:
                case 'ping':
                    await self.send(text_data=json.dumps({'action': 'pong'}))
                case 'getQueue':
                    await self.get_queue()
                case 'searchTracks':
                    await self.handle_search_tracks(data)
                case 'addSongToQueue':
                    await self.handle_add_song_to_queue(data)
                case 'verifyLogin':
                    await self.handle_verify_login(data)
                case 'skipSong':
                    await self.handle_skip_song()
                case 'removeFirstSong':
                    await self.handle_remove_first_song()
                case 'emptyQueue':
                    await self.handle_empty_queue()
                case _:
                    logger.error(f"Unknown action: {action}")
        except Exception as e:
            logger.error(f"Error in receive: {e}", exc_info=True)
            await self.send(text_data=json.dumps({'action': 'error', 'error': str(e)}))

    async def handle_search_tracks(self, data):
        track_name = data.get('track_name')
        if track_name:
            await self.search_tracks(track_name)
        else:
            logger.error("No track name provided for search")
            await self.send_error("No track name provided")

    async def handle_add_song_to_queue(self, data):
        track = data.get('track')
        if track:
            await self.add_song_to_queue(track)
        else:
            logger.error("No track data provided for adding to queue")
            await self.send_error("No track data provided")

    async def handle_verify_login(self, data):
        username = data.get('username')
        password = data.get('password')
        if username and password:
            await self.verify_login(username, password)
        else:
            logger.error("Login data incomplete")
            await self.send_error("Login data incomplete")

    async def handle_skip_song(self):
        await self.skip_song()

    async def handle_remove_first_song(self):
        await self.remove_first_song()

    async def handle_empty_queue(self):
        await self.empty_queue()

    async def verify_login(self, username, password):
        user = await sync_to_async(self.authenticate)(username, password)
        if user:
            await self.send_login_response(True)
        else:
            await self.send_login_response(False)

    async def send_login_response(self, success):
        result = 'success' if success else 'Invalid username or password'
        await self.send(text_data=json.dumps({
            'action': 'loginResponse',
            'result': result
        }))

    async def send_error(self, error_message):
        await self.send(text_data=json.dumps({
            'action': 'error',
            'error': error_message
        }))

    async def get_queue(self):
        queue = await sync_to_async(Queue.objects.all)()
        queue_data = [song.song.to_dict() for song in queue]
        await self.send(text_data=json.dumps({'action': 'updateQueue', 'queue': queue_data}))

    async def search_tracks(self, track_name):
        try:
            token = get_token()
            result_array = search_for_tracks(token, track_name, 3)
            response = {'action': 'searchResults', 'results': [track.to_dict() for track in result_array]}
            await self.send(text_data=json.dumps(response))
        except Exception as e:
            await self.send(text_data=json.dumps({'action': 'error', 'error': str(e)}))

    async def add_song_to_queue(self, track):
        await self.create_song_and_queue(track)
        await self.broadcast_updated_queue()

    async def create_song_and_queue(self, track):
        song = await sync_to_async(Song.objects.create)(**track)
        await sync_to_async(Queue.objects.create)(song=song)


    async def skip_song(self):
        try:
            song = await sync_to_async(Queue.objects.first)()
            if song:
                await sync_to_async(song.song.delete)()
            await self.broadcast_updated_queue()
        except Exception as e:
            await self.send(text_data=json.dumps({'action': 'error', 'error': str(e)}))

    async def remove_first_song(self):
        try:
            queue = await sync_to_async(Queue.objects.first)()
            if queue:
                await sync_to_async(queue.song.delete)()
            await self.broadcast_updated_queue()
        except Exception as e:
            await self.send(text_data=json.dumps({'action': 'error', 'error': str(e)}))

    async def empty_queue(self):
        await sync_to_async(Queue.objects.all().delete)()
        await self.broadcast_updated_queue()

    
    async def authenticate(self, username, password):
        ADMIN_ID = os.environ.get('ADMIN_ID')
        ADMIN_PW = os.environ.get('ADMIN_PW')
        if username == ADMIN_ID and password == ADMIN_PW:
            await self.send(text_data=json.dumps({
                'action': 'loginResponse',
                'result': 'success'
            }))
        else:
            await self.send(text_data=json.dumps({
                'action': 'loginResponse',
                'result': 'Invalid username or password'
            }))
            
    async def broadcast_updated_queue(self):
        queue = await sync_to_async(Queue.objects.all)()
        queue_json = json.dumps([await sync_to_async(item.to_dict)() for item in queue])
        await self.send(text_data=queue_json)
    async def add_to_group(self):
        await self.channel_layer.group_add('queue_viewers', self.channel_name)

    async def remove_from_group(self):
        await self.channel_layer.group_discard('queue_viewers', self.channel_name)


