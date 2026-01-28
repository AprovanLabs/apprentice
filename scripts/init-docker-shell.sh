#!/bin/sh

set -e

container_name=$1

if [ -z "$container_name" ]; then
    echo "Usage: $0 <container_name>"
    exit 1
fi

container_id=$(docker ps -q --filter "name=${container_name}")

if [ -z "$container_id" ]; then
    echo "❌ Container is not running. Please start it with 'docker-compose up -d'."
    exit 1
fi

docker exec -it "$container_id" /bin/sh
