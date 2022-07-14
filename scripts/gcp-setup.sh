#!/bin/bash

GCLOUD_COMMIT=TRUE

# Exit if any command fails
set -e

# To avoid hitting gcloud's api quota, we add 1 second delay between commands
shopt -s expand_aliases
alias gcloud_slow='sleep 1 && gcloud'

###################################
# GCP Prereqs: Install
###################################
echo "*** GCP Prereqs: Install ***"
gcloud_slow components install alpha --quiet # Required for billing API

###################################
# GCP Account: login
###################################
echo -e "\n*** GPC Account: Login ***"
GCP_ACCOUNT=$(gcloud_slow config get-value account)
if [ -z $GCP_ACCOUNT ]; then
  echo "No GCP account found. Follow instructions to log in..."
  gcloud_slow auth login --quiet
  GCP_ACCOUNT=$(gcloud_slow config get-value account)
  echo "Logged in, ignore previous messages."
fi
echo "Account: $GCP_ACCOUNT"

echo "Confirm account (y/N): "
read;
if [[ $REPLY != 'y' ]]; then
  gcloud_slow auth revoke --all
  echo "Please rerun script to change accounts"
  exit
fi

###################################
# GCP Project: Select or create
###################################
echo -e "\n*** GCP Project: Select or create ***"
GCP_PROJECTS=$(gcloud_slow projects list | awk 'FNR==1 {next} {print $1}')
PS3='Please select your project:'
select GCP_PROJECT in "Create a new project" $GCP_PROJECTS
do
  if [[ ${GCP_PROJECTS[@]} =~ ${GCP_PROJECT} || ${GCP_PROJECT} == "Create a new project" ]]; then
    break
  fi
done

if [[ $REPLY == 1 ]]; then
  echo "Creating a new project, please provide a project name (6 chars min):"
  read;
  GCP_PROJECT=$REPLY
  $GCLOUD_COMMIT && gcloud_slow config set project $GCP_PROJECT
  $GCLOUD_COMMIT && gcloud_slow projects create $GCP_PROJECT
fi

$GCLOUD_COMMIT && gcloud_slow config set project $GCP_PROJECT
echo "Project: $GCP_PROJECT"

###################################
# GCP Project: Link to billing
###################################
echo -e "\n*** GCP Project: Link to billing ***"

GCP_BILLING_DATA=$(gcloud_slow alpha billing accounts list | awk 'FNR==1 {next} {printf $1} {$1=""; $NF=""; print $0}')
GCP_BILLING_ACCOUNTS_ID=($(echo "$GCP_BILLING_DATA" | awk '{print $1}'))
GCP_BILLING_ACCOUNTS_NAME=($(echo "$GCP_BILLING_DATA" | awk '{OFS="-";$1=""; print $0}'))
if [ -z "$GCP_BILLING_DATA" ]
then
  echo "No billing details detected. Please enable at least one billing account before re-running this tool."
fi

PS3='Please select your billing account:'
select GCP_BILLING_ACCOUNT_NAME in "${GCP_BILLING_ACCOUNTS_NAME[@]}"
do
  if [[ ${GCP_BILLING_ACCOUNTS_NAME[@]} =~ ${GCP_BILLING_ACCOUNT_NAME} ]]; then
    GCP_BILLING_ACCOUNT=${GCP_BILLING_ACCOUNTS_ID[$REPLY-1]}
    break
  fi
done

$GCLOUD_COMMIT && gcloud_slow alpha billing projects link $GCP_PROJECT --billing-account $GCP_BILLING_ACCOUNT
echo "Billing account: $GCP_BILLING_ACCOUNT"

###################################
# GCP Project: Enable API's
###################################
echo -e "\n*** GCP Project: Enable API's ***"
echo "This operation might take some minutes..."
$GCLOUD_COMMIT && gcloud_slow services enable pubsub.googleapis.com
$GCLOUD_COMMIT && gcloud_slow services enable cloudiot.googleapis.com
$GCLOUD_COMMIT && gcloud_slow services enable compute.googleapis.com
echo "Enabled API's: compute, pubsub and cloudiotcore"

###################################
# GCP Region: Select
###################################
echo -e "\n*** GCP Region: Select ***"
GCP_REGIONS=("asia-east1" "europe-west1" "us-central1")
PS3='Please select your region:'
select GCP_REGION in "${GCP_REGIONS[@]}"
do
  if [[ ${GCP_REGIONS[@]} =~ ${GCP_REGION} ]]; then
    break
  fi
done

echo "Region: $GCP_REGION"

###################################
# GCP PubSub: Telemetry topic 
###################################
echo -e "\n*** GCP Project: PubSub telemetry topic ***"
GCP_TELEMETRY_TOPICS=("Create a new telemetry topic" "Use default name: balena-telemetry-topic")
PS3='Please select your choice:'
select GCP_TELEMETRY_TOPIC in "${GCP_TELEMETRY_TOPICS[@]}"
do
  echo "$GCP_TELEMETRY_TOPIC"
  if [[ ${GCP_TELEMETRY_TOPICS[@]} =~ ${GCP_TELEMETRY_TOPIC} ]]; then
    break
  fi
done

if [[ $REPLY == 1 ]]; then
  echo "Creating a new telemetry topic, please provide a name:"
  read;
  GCP_TELEMETRY_TOPIC=$REPLY
else
  GCP_TELEMETRY_TOPIC='balena-telemetry-topic'  
fi

$GCLOUD_COMMIT && gcloud_slow pubsub topics create $GCP_TELEMETRY_TOPIC
echo "Created PubSub telemetry topic: $GCP_TELEMETRY_TOPIC"

##################################
# GCP PubSub: State topic 
##################################
echo -e "\n*** GCP Project: PubSub state topic ***"
GCP_STATE_TOPICS=("Create a new state topic" "Use default name: balena-state-topic")
PS3='Please select your choice:'
select GCP_STATE_TOPIC in "${GCP_STATE_TOPICS[@]}"
do
  echo "$GCP_STATE_TOPIC"
  if [[ ${GCP_STATE_TOPICS[@]} =~ ${GCP_STATE_TOPIC} ]]; then
    break
  fi
done

if [[ $REPLY == 1 ]]; then
  echo "Creating a new telemetry topic, please provide a name:"
  read;
  GCP_STATE_TOPIC=$REPLY
else
  GCP_STATE_TOPIC='balena-state-topic'
fi

$GCLOUD_COMMIT && gcloud_slow pubsub topics create $GCP_STATE_TOPIC
echo "Created PubSub telemetry topic: $GCP_STATE_TOPIC"

##################################
# GCP PubSub: Test subscription 
##################################
echo -e "\n*** GCP PubSub: Create test subscription to telemetry topic ***"
GCP_SUB_TEST="balena-telemetry-test-sub"
$GCLOUD_COMMIT && gcloud_slow pubsub subscriptions create --topic $GCP_TELEMETRY_TOPIC $GCP_SUB_TEST
echo "Created PubSub test subscription: $GCP_SUB_TEST"

##################################
# GCP IoT Core: Create registry
##################################
echo -e "\n*** GCP IoT Core: Create registry ***"

GCP_REGISTRY_NAMES=("Enter name manually" "Use default name: balena-registry")
PS3='Please select your choice:'
select GCP_REGISTRY_NAME in "${GCP_REGISTRY_NAMES[@]}"
do
  if [[ ${GCP_REGISTRY_NAMES[@]} =~ ${GCP_REGISTRY_NAME} ]]; then
    break
  fi
done

if [[ $REPLY == 1 ]]; then
  echo "Please provide a name for the registry:"
  read;
  GCP_REGISTRY_NAME=$REPLY
else
  GCP_REGISTRY_NAME='balena-registry'
fi

$GCLOUD_COMMIT && gcloud_slow iot registries create $GCP_REGISTRY_NAME --region $GCP_REGION --event-notification-config=topic=$GCP_TELEMETRY_TOPIC --state-pubsub-topic=$GCP_STATE_TOPIC
echo "Created IoT Core registry: $GCP_REGISTRY_NAME"

##################################
# GCP IAM: Create service account
##################################
echo -e "\n*** GCP IAM: Create service account ***"
GCP_SERVICE_ACCOUNT='balena-service-account'
$GCLOUD_COMMIT && gcloud_slow iam service-accounts create $GCP_SERVICE_ACCOUNT --description "Balena service account" --display-name $GCP_SERVICE_ACCOUNT
echo "Created IAM service account: $GCP_SERVICE_ACCOUNT"

##################################
# GCP IAM: Add roles
##################################
echo -e "\n*** GCP IAM: Add roles to service account ***"
$GCLOUD_COMMIT && gcloud_slow projects add-iam-policy-binding $GCP_PROJECT --member serviceAccount:$GCP_SERVICE_ACCOUNT@$GCP_PROJECT.iam.gserviceaccount.com --role roles/cloudiot.provisioner
$GCLOUD_COMMIT && gcloud_slow projects add-iam-policy-binding $GCP_PROJECT --member serviceAccount:$GCP_SERVICE_ACCOUNT@$GCP_PROJECT.iam.gserviceaccount.com --role roles/pubsub.publisher
echo "Added pubsub publisher and cloudiot provisioner roles to service account: $GCP_SERVICE_ACCOUNT"

##################################
# GCP IAM: Create key
##################################
echo -e "\n*** GCP IAM: Get key for service account ***"
$GCLOUD_COMMIT && gcloud_slow iam service-accounts keys create key.json --iam-account $GCP_SERVICE_ACCOUNT@$GCP_PROJECT.iam.gserviceaccount.com
echo "Created service account key: key.json"
GCP_ACCOUNT_TOKEN=$(cat key.json | tr -s '\n' ' ')

##################################
# Export required variables
##################################

echo -e "\n*** Export env variables ***"
echo "Setup completed, add the following env variables to your target devices:"
echo "GOOGLE_IOT_PROJECT=$GCP_PROJECT"
echo "GOOGLE_IOT_REGION=$GCP_REGION"
echo "GOOGLE_IOT_REGISTRY=$GCP_REGISTRY_NAME"
echo "GOOGLE_IOT_SERVICE_ACCOUNT_TOKEN=$GCP_ACCOUNT_TOKEN"

