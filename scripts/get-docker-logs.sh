#!/bin/sh

set -e

container_name=$1

if [ -z "$container_name" ]; then
    echo "Usage: $0 <container_name>"
    exit 1
fi

container_id=$(docker ps -aq --filter "name=${container_name}")

if [ -z "$container_id" ]; then
    echo "❌ Container not found"
    exit 1
fi

docker logs "$container_id" --tail 100 -f
