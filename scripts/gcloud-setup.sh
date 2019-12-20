#!/bin/bash

# Exit if any command fails
set -e

########################
# GCP PREREQS
########################
echo "*** GCP PREREQS ***"
gcloud components install alpha --quiet

########################
# GCP ACCOUNT
########################
echo -e "\n*** GPC ACCOUNT ***"
GCP_ACCOUNT=$(gcloud config get-value account)
if [ -z $GCP_ACCOUNT ]; then
  echo "No GCP account found. Follow instructions to log in..."
  gcloud auth login
fi
echo "Account: $GCP_ACCOUNT"

########################
# GCP PROJECT
########################
echo -e "\n*** GCP PROJECT ***"
GCP_PROJECTS=$(gcloud projects list | awk 'FNR==1 {next} {print $1}')
PS3='Please select your project:'
select GCP_PROJECT in "Create a new project" $GCP_PROJECTS
do
  if [[ ${GCP_PROJECTS[@]} =~ ${GCP_PROJECT} || ${GCP_PROJECT} == "Create a new project" ]]; then
    break
  fi
done

if [[ $GCP_PROJECT == "Create a new project" ]]; then
  echo "Creating a new project, please provide a project name (6 chars min):"
  read;
  GCP_PROJECT=$REPLY
  gcloud projects create $GCP_PROJECT
fi

gcloud config set project $GCP_PROJECT
echo "Project: $GCP_PROJECT"

########################
# GCP BILLING
########################
echo -e "\n*** GCP BILLING ***"

GCP_BILLING_DATA=$(gcloud alpha billing accounts list | awk 'FNR==1 {next} {printf $1} {$1=""; $NF=""; print $0}')
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

gcloud alpha billing projects link $GCP_PROJECT --billing-account $GCP_BILLING_ACCOUNT
echo "Billing account: $GCP_BILLING_ACCOUNT"
