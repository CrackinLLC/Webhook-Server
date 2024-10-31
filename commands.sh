#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

TARGET=$1
BRANCH=$2

env > /tmp/webhook_env.log # DEBUGGING
echo "Node version: $(node -v)" # DEBUGGING

echo "Starting deployment for $TARGET on branch $BRANCH" # DEBUGGING
echo "User: $(whoami)" # DEBUGGING
echo "Home Directory: $HOME" # DEBUGGING
echo "Current Directory: $(pwd)" # DEBUGGING
echo "Node Version: $(node -v)" # DEBUGGING
echo "NPM Version: $(npm -v)" # DEBUGGING
echo "PATH: $PATH" # DEBUGGING

case $TARGET in
  crackin)
    cd /home/relic/web/crackin.com/app

    # Ensure we're on the correct branch
    git fetch origin $BRANCH
    git reset --hard origin/$BRANCH
    pm2 stop crackin

    # Remove existing node_modules
    rm -rf node_modules

    npm install
    npm run build
    pm2 restart crackin
    ;;
  rentalguru)
    cd /home/relic/web/my.rentalguru.ai/app
    git checkout --quiet $BRANCH
    git pull origin $BRANCH
    npm install
    npm run build
    pm2 restart rentalGuru
    ;;
  missioncrit)
    cd /home/relic/web/missioncritical.us.com/repo

    git fetch origin $BRANCH
    git reset --hard origin/$BRANCH

    cp -a ./missioncritical/. ../public_html/
    cp -a ./jrsupply/. ../../jrsupply.us.com/public_html/
    ;;
  *)
    echo "Invalid argument"
    exit 1
    ;;
esac
