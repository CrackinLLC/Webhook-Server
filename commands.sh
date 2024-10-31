#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

TARGET=$1
BRANCH=$2

# Check if TARGET and BRANCH are provided
if [ -z "$TARGET" ] || [ -z "$BRANCH" ]; then
  echo "Usage: $0 [application_name] [branch]"
  exit 1
fi

# Define valid targets and branches
VALID_TARGETS=("crackin" "rentalguru" "webhooks")
VALID_BRANCHES=("main" "staging")

# Check if TARGET is valid
if [[ ! " ${VALID_TARGETS[@]} " =~ " $TARGET " ]]; then
  echo "Invalid application name: $TARGET"
  exit 1
fi

# Check if BRANCH is valid
if [[ ! " ${VALID_BRANCHES[@]} " =~ " $BRANCH " ]]; then
  echo "Invalid branch: $BRANCH"
  exit 1
fi

# Define the base directory
BASE_DIR="/home/relic/web"

# Set application-specific variables
case "$TARGET" in
  crackin)
    if [ "$BRANCH" = "main" ]; then
      APP_DIR="$BASE_DIR/crackin.com/app"
      PM2_APP_NAME="crackin"
    # elif [ "$BRANCH" = "staging" ]; then
    #   APP_DIR="$BASE_DIR/crackin-staging/app"
    #   PM2_APP_NAME="crackin-staging"
    else
      echo "Unsupported branch for crackin: $BRANCH"
      exit 1
    fi
    ;;
  rentalguru)
    if [ "$BRANCH" = "main" ]; then
      APP_DIR="$BASE_DIR/my.rentalguru.ai/app"
      PM2_APP_NAME="rentalGuru"
    else
      echo "Unsupported branch for rentalguru: $BRANCH"
      exit 1
    fi
    ;;
  webhooks)
    if [ "$BRANCH" = "main" ]; then
      APP_DIR="$BASE_DIR/webhooks"
      PM2_APP_NAME="webhooks"
    else
      echo "Unsupported branch for webhooks: $BRANCH"
      exit 1
    fi
    ;;
  missioncrit)
    cd /home/relic/web/missioncritical.us.com/repo

    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"

    cp -a ./missioncritical/. ../public_html/
    cp -a ./jrsupply/. ../../jrsupply.us.com/public_html/
    exit 1
    ;;
  *)
    echo "Invalid application name: $TARGET"
    exit 1
    ;;
esac

# Navigate to the application directory
cd "$APP_DIR"

# Stop the PM2 process
sudo /home/relic/web/pm2_actions.sh stop "$PM2_APP_NAME"

# Ensure we're on the correct branch
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# Remove existing node_modules
rm -rf node_modules

# Install dependencies and build
npm install
npm run build

# Restart the PM2 process
sudo /home/relic/web/pm2_actions.sh start "$PM2_APP_NAME"
