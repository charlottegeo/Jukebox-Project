from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from . import views
from django.urls import path


urlpatterns = [
    path('', views.songs, name='songs'),
    path('static/css/styles.css', views.styles, name='styles'),
    path('api/get_array/', views.get_array, name="get_array")
]

