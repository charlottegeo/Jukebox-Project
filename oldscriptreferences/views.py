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
from django.views.decorators.csrf import csrf_exempt
import os

#Views here are called from the front end through urls.py

#Gets the array of songs in the queue
def get_array(request):
    return JsonResponse(get_song_queue())

#Loads the search page
def songs(request):
    template = loader.get_template('songs/search.html')
    context = {}
    return HttpResponse(template.render(context, request))

#Loads the styles.css file
def styles(request):
    try:
        return serve(request, 'css/styles.css', document_root=settings.STATIC_ROOT)
    except Exception as e:
        return HttpResponse(e)

#Gets the search results from the Spotify API
def get_search_results(request):
    if request.method == 'GET':
        token = get_token()
        track_name = request.GET.get('track_name', '')
        result_array = search_for_tracks(token, track_name, 3)
        for i in range(len(result_array)):
            print(result_array[i].getTrackName())
        result_array = [track.to_dict() for track in result_array]
        return JsonResponse({'result': result_array})

#Adds a song to the queue
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
        bpm = data.get('bpm', '')
        song = Song(track_name=track_name, artist_name=artist_name, length=length, cover_url=cover_url, track_id=track_id, uri=uri, bpm=bpm)
        song.save()
        queue = Queue(song=song)
        queue.save()
        return JsonResponse({'result': 'success'})

#Skip the current song by deleting it from the queue
@csrf_exempt  
def skip_song(request):
    try:
        if request.method == 'POST':
            song = Queue.objects.first().song
            song.delete()
            return JsonResponse({'result': 'success'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

#Remove the first song in the queue
@csrf_exempt
def remove_first_song(request):
    try:
        if request.method == 'POST':
            queue = Queue.objects.first()
            if queue is not None:
                song = queue.song
                song.delete()
                return JsonResponse({'result': 'success'})
            else:
                return JsonResponse({'error': 'Queue is empty'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)
    
#Empty the queue
@csrf_exempt
def empty_queue(request):
    try:
        if request.method == 'POST':
            Queue.objects.all().delete()
            return JsonResponse({'result': 'success'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

#return the entire queue
def get_song_queue(request):
    queue = Queue.objects.all()
    return JsonResponse({'result': [song.song.to_dict() for song in queue]})

#Return the first song in the queue as a JSON object
def get_first_song(request):
    try:
        if request.method == 'GET':
            if Queue.objects.count() == 0:
                return JsonResponse({'result': None})
            song = Queue.objects.first().song
            return JsonResponse({'result': song.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

#Return true if the username and password are correct
#Return false otherwise
@csrf_exempt
def verify_login(request):
    if request.method == 'POST':
        if request.content_type == 'application/json':
            try:
                data = json.loads(request.body.decode('utf-8'))
                print(data)
            except json.JSONDecodeError:
                return JsonResponse({'result': 'failure', 'reason': 'Invalid JSON'})
        else:
            data = request.POST
            print(data)
            print(os.environ.get('ADMIN_ID'))
            print(os.environ.get('ADMIN_PW'))
        ADMIN_ID = os.environ.get('ADMIN_ID')
        ADMIN_PW = os.environ.get('ADMIN_PW')
        if data['username'] == ADMIN_ID and data['password'] == ADMIN_PW:
            return JsonResponse({'result': 'success'})
        else:
            return JsonResponse({'result': 'failure'})
    else:
        return JsonResponse({'error': 'Invalid request method'})

#Display the queue
def display(request):
    template = loader.get_template('songs/display.html')
    context = {}
    return HttpResponse(template.render(context, request))

#Convert seconds to minutes (used for displaying song length)
@csrf_exempt
def seconds_to_minutes(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        seconds = data.get('seconds', '')
        return JsonResponse({'result': formatTime(seconds)})
    else:
        return JsonResponse({'error': 'Invalid request method'})