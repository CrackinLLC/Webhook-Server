#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

TARGET=$1
BRANCH=$2

case $TARGET in
  crackin)
    cd /home/relic/web/crackin.com/app

    # Ensure we're on the correct branch
    git fetch origin $BRANCH
    git reset --hard origin/$BRANCH

    # Clean install
    rm -rf node_modules

    # Install dependencies
    npm install

    # Check if npm install was successful
    if [ $? -ne 0 ]; then
      echo "npm install failed"
      exit 1
    fi

    # Build the project
    npm run build

    # Check if build was successful
    if [ $? -ne 0 ]; then
      echo "npm run build failed"
      exit 1
    fi

    # Restart the application
    pm2 restart crackin
    ;;
  # ... other cases
  *)
    echo "Invalid argument"
    exit 1
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
