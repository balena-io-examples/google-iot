#!/bin/bash

# # Install alpha components
# gcloud components install alpha --quiet

# Billing accounts
echo "*** Billing accounts ***"
echo "Getting existing billing accounts..."
gcloud alpha billing accounts list

OPTIONS=$(gcloud alpha billing accounts list | awk 'FNR==1 {next} {print $1}')
if [ -z "$OPTIONS" ]
then
  echo "No billing accounts detected."
fi

PS3='Please select your billing account:'
select GCP_BILLING_ACCOUNT in $OPTIONS
do
  echo $GCP_BILLING_ACCOUNT
  echo $REPLY
done

