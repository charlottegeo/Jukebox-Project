from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from . import views
from django.urls import path


urlpatterns = [
    path('', views.songs, name='songs'),
    path('static/css/styles.css', views.styles, name='styles'),
    path('api/get_array/', views.get_array, name="get_array"),
    path('search_for_tracks/', views.get_search_results, name='search_results_view'),
    path('add_to_queue/', views.add_to_queue, name='add_to_queue'),
    path('get_song_queue/', views.get_song_queue, name='get_song_queue')
]

