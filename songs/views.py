from django.http import HttpResponse
from django.http import JsonResponse
from django.template import loader
from django.views.static import serve
from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse
from django.core import serializers
from SpotifyAPI.main import *
from SpotifyAPI.track_wrapper import TrackWrapper
from .models import Song
from .models import Queue
import json
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.csrf import csrf_exempt
def get_array(request):
    return JsonResponse(get_song_queue())

def songs(request):
    template = loader.get_template('search.html')
    return HttpResponse(template.render())


def styles(request):
    try:
        return serve(request, 'css/styles.css', document_root=settings.STATIC_ROOT)
    except Exception as e:
        return HttpResponse(e)

def get_search_results(request):
    if request.method == 'GET':
        token = get_token()
        track_name = request.GET.get('track_name', '')
        result_array = search_for_tracks(token, track_name, 3)
        for i in range(len(result_array)):
            print(result_array[i].getTrackName())
        result_array = [track.to_dict() for track in result_array]
        return JsonResponse({'result': result_array})

@csrf_exempt
def add_to_queue(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        track_name = data.get('track_name', '')
        artist_name = data.get('artist_name', '')
        length = data.get('track_length', '')
        cover_url = data.get('cover_url', '')
        track_id = data.get('track_id', '')
        uri = data.get('uri', '')
        song = Song(track_name=track_name, artist_name=artist_name, length=length, cover_url=cover_url, track_id=track_id, uri=uri)
        song.save()
        queue = Queue(song=song)
        queue.save()
        return JsonResponse({'result': 'success'})
def remove_from_queue(request):
    #Remove the first song from the queue
    #Return success
    if request.method == 'POST':
        song = Queue.objects.first().song
        song.delete()
        return JsonResponse({'result': 'success'})
def empty_queue(request):
    #Remove all songs from the queue
    #Return success
    if request.method == 'POST':
        queue = Queue.objects.all()
        for song in queue:
            song.delete()
        return JsonResponse({'result': 'success'})
def get_song_queue(request):
    #Return the queue as a JSON array
    queue = Queue.objects.all()
    return JsonResponse({'result': [song.song.to_dict() for song in queue]})
def get_next_song(request):
    #Return the first song in the queue
    return Queue.objects.first().song