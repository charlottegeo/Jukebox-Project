from channels.generic.websocket import AsyncWebsocketConsumer
import json

class SongQueueConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

        # send the initial song list to the client
        song_list = get_song_list() # replace with your own function to get the song list
        await self.send(json.dumps(song_list))

        # add the client to the song queue group
        await self.channel_layer.group_add('song_queue', self.channel_name)

    async def disconnect(self, close_code):
        # remove the client from the song queue group
        await self.channel_layer.group_discard('song_queue', self.channel_name)

    async def receive(self, text_data):
        # ignore any incoming messages
        pass

    async def song_added(self, event):
        # send the updated song list to the client
        song_list = event['song_list']
        await self.send(json.dumps(song_list))
