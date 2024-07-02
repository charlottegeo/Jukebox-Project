FROM python:3.11.5-alpine
WORKDIR /app

RUN apk update && apk add --no-cache \
    gcc \
    libc-dev \
    libldap \
    openldap-dev \
    cyrus-sasl-dev

COPY requirements.txt /app
RUN pip3 install -r requirements.txt --no-cache-dir

COPY . /app

CMD ["gunicorn", "app:create_app()", "--bind=0.0.0.0:5000", "--worker-class=eventlet", "--workers=1"]
