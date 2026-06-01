#!/bin/sh
# Inject runtime env vars into the static HTML before nginx starts.
# HELP_SERVICE_URL — URL of the CHM Viewer Service (must be reachable FROM THE BROWSER).

: "${HELP_SERVICE_URL:=http://localhost:8085}"

sed -i "s|%%HELP_SERVICE_URL%%|${HELP_SERVICE_URL}|g" /usr/share/nginx/html/index.html

echo "Navigator started. HELP_SERVICE_URL=${HELP_SERVICE_URL}"
exec nginx -g "daemon off;"
