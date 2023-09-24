from django.http import HttpResponse
from django.template import loader
from django.views.static import serve
from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse
from django.core import serializers
from SpotifyAPI.main import get_song_queue, add_song, remove_song
from SpotifyAPI.track_wrapper import TrackWrapper



def get_array(request):
    print(get_song_queue)
    return JsonResponse(get_song_queue())

def songs(request):
    template = loader.get_template('display.html')
    return HttpResponse(template.render())


def styles(request):
    try:
        return serve(request, 'css/styles.css', document_root=settings.STATIC_ROOT)
    except Exception as e:
        return HttpResponse(e)

