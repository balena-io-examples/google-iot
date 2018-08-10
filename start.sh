#!/bin/bash

if [ ! -f /data/service.json ]; then

   # Make sure all the required environment variables are set
   if [ -z "$GOOGLE_IOT_SERVICE_JSON" ]; then
   	echo "Missing GOOGLE_IOT_SERVICE_JSON environment variable, login to https://dashboard.resin.io/ to create it"
   	exit
   elif [ -z "$RESIN_DEVICE_UUID" ]; then
   	echo "No device name supplied, are you running this in ResinOS?"
   	exit
   elif [ -z "$GOOGLE_IOT_PROJECT" ]; then
   	echo "Missing GOOGLE_IOT_PROJECT environment variable, login to https://dashboard.resin.io/ to set it"
   	exit
   elif [ -z "$GOOGLE_IOT_REGION" ]; then
   	echo "Missing GOOGLE_IOT_REGION environment variable, login to https://dashboard.resin.io/ to set it"
   	exit
   elif [ -z "$GOOGLE_IOT_REGISTRY" ]; then
   	echo "Missing GOOGLE_IOT_REGISTRY environment variable, login to https://dashboard.resin.io/ to set it"
   	exit
   fi

   # Create service credentials file and configure gcloud
   echo "Authenticating service account"
   echo $GOOGLE_IOT_SERVICE_JSON > /data/service.json
   gcloud config set disable_prompts true
   gcloud auth activate-service-account --key-file=/data/service.json
   gcloud config set project $GOOGLE_IOT_PROJECT
   gcloud config set compute/zone $GOOGLE_IOT_REGION

   # Create keys and register device with the configured Google IoT registry
   echo "Creating device keys and registering device"

   # Create the keys in the persistent storage space mounted on /data
   cd /data

   # Create keys
   openssl req -x509 -newkey rsa:2048 -keyout rsa-priv.pem -nodes -out rsa-cert.pem -subj "/CN=unused"
   openssl ecparam -genkey -name prime256v1 -noout -out rsa-ec_private.pem
   openssl ec -in rsa-ec_private.pem -pubout -out rsa-ec_public.pem

   # Register as Google IoT device with the keys created above
   gcloud iot devices create $RESIN_DEVICE_UUID \
         --project=$GOOGLE_IOT_PROJECT \
         --region=$GOOGLE_IOT_REGION \
         --registry=$GOOGLE_IOT_REGISTRY \
         --public-key path=rsa-cert.pem,type=rs256

   cd -
fi

node index.js
