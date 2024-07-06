FROM python:3.11.5-alpine
LABEL maintainer="Charlotte George <cngg805@gmail.com>"

WORKDIR /app

RUN apk update && apk add --no-cache \
    gcc \
    libc-dev \
    libldap \
    openldap-dev \
    cyrus-sasl-dev \
    chrony
COPY requirements.txt /app
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . /app

CMD ["gunicorn", "app:create_app()", "--bind=0.0.0.0:8080", "--worker-class=gevent", "--timeout=120", "--keep-alive=5"]