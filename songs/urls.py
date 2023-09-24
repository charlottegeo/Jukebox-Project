from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from . import views

urlpatterns = [
    path('', views.songs, name='songs'),
    path('static/css/styles.css', views.styles, name='styles'),
]

