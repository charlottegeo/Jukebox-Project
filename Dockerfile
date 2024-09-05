FROM python:3.11-slim
LABEL maintainer="Charlotte George <cngg805@gmail.com>"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libc-dev \
    libldap2-dev \
    libsasl2-dev \
    ffmpeg \
    llvm \
    llvm-dev \
    make \
    && rm -rf /var/lib/apt/lists/*

# Verify ffmpeg and ffprobe installation
RUN ffmpeg -version && ffprobe -version

ENV LLVM_CONFIG=/usr/bin/llvm-config

RUN pip3 install --no-cache-dir numpy==2.0.1

COPY requirements.txt /app
RUN pip3 install --no-cache-dir --prefer-binary -r requirements.txt

COPY . /app

CMD ["gunicorn", "app:create_app()", "--bind=0.0.0.0:8080", "--worker-class=gevent", "--timeout=120", "--keep-alive=5"]
