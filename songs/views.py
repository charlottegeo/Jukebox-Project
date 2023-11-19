from django.http import HttpResponse
from django.template import loader
from django.views.static import serve
from django.conf import settings
from django.shortcuts import render
from django.http import JsonResponse
from django.core import serializers
from SpotifyAPI.main import *
from SpotifyAPI.track_wrapper import TrackWrapper



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

def add_to_queue(request):
    