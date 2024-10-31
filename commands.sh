#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

TARGET=$1
BRANCH=$2

# Debugging Information
env > /tmp/webhook_env.log # DEBUGGING
echo "Node version: $(node -v)" # DEBUGGING
echo "Starting deployment for $TARGET on branch $BRANCH" # DEBUGGING
echo "User: $(whoami)" # DEBUGGING
echo "Home Directory: $HOME" # DEBUGGING
echo "Current Directory: $(pwd)" # DEBUGGING
echo "PATH: $PATH" # DEBUGGING

case "$TARGET" in
  webhooks|crackin|rentalguru)
    sudo /home/relic/web/pm2_actions.sh stop "$TARGET"

    case "$TARGET" in
      webhooks)
        cd /home/relic/web/webhooks
        ;;
      crackin)
        cd /home/relic/web/crackin.com/app
        ;;
      rentalguru)
        cd /home/relic/web/my.rentalguru.ai/app
        ;;
      *)
        echo "Invalid application name: $TARGET"
        exit 1
        ;;
    esac

    # Ensure we're on the correct branch
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"

    # Remove existing node_modules
    rm -rf node_modules

    npm install
    npm run build
    sudo /home/relic/web/pm2_actions.sh start "$TARGET"
    ;;
  missioncrit)
    cd /home/relic/web/missioncritical.us.com/repo

    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"

    cp -a ./missioncritical/. ../public_html/
    cp -a ./jrsupply/. ../../jrsupply.us.com/public_html/
    ;;
  *)
    echo "Invalid argument"
    exit 1
    ;;
esac
