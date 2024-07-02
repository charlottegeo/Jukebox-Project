FROM redis:7.2.5-alpine

RUN apk add --no-cache chrony

COPY redis.conf /usr/local/etc/redis/redis.conf

CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
