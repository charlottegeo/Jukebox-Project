from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from . import views
from django.urls import path


# URL patterns for songs app, all views are in views.py
#Use this to add functions you want to be able to call from the front end
urlpatterns = [
    path('', views.songs, name='songs'),
    path('static/css/styles.css', views.styles, name='styles'),
    path('api/get_array/', views.get_array, name="get_array"),
    path('search_for_tracks/', views.get_search_results, name='search_results_view'),
    path('add_to_queue/', views.add_to_queue, name='add_to_queue'),
    path('get_song_queue/', views.get_song_queue, name='get_song_queue'),
    path('empty_queue/', views.empty_queue, name='empty_queue'),
    path('verify_login/', views.verify_login, name='verify_login'),
    path('display/', views.display, name='display'),
    path('skip_song/', views.skip_song, name='skip_song'),
    path('get_first_song/', views.get_first_song, name='get_first_song'),
    path('remove_first_song/', views.remove_first_song, name='remove_first_song'),
    path('seconds_to_minutes/', views.seconds_to_minutes, name='seconds_to_minutes'),
]

