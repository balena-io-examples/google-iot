## How to create and configure Google Cloud Platform (GCP) project - Manually

### Create a GCP project, enable billing and required API's

1. In the GCP Console, go to the [Manage resources page](https://console.cloud.google.com/cloud-resource-manager) and select or create a new project. The project name will be your `GOOGLE_IOT_PROJECT` variable.

2. Make sure that [billing is enabled](https://cloud.google.com/billing/docs/how-to/modify-project) for your project.

3. [Enable the Cloud IoT Core, Compute and Cloud Pub/Sub APIs](https://console.cloud.google.com/flows/enableapi?apiid=cloudiot.googleapis.com,pubsub,compute).

### Create a device registry

1. Go to the [Google Cloud IoT Core page](https://console.cloud.google.com/iot) in GCP Console.
2. Click Create a registry.
3. Enter `balena-registry` for the Registry ID (this will be your `GOOGLE_IOT_REGISTRY` variable).
4. Select `us-central1` for the Cloud region (this will be your `GOOGLE_IOT_REGION` variable).
5. Select `MQTT` for the Protocol.
6. In the Telemetry topic dropdown list, select Create a topic.
7. In the Create a topic dialog, enter `balena-telemetry-topic` in the Name field.
8. Click Create in the Create a topic dialog.
9. In the State topic dropdown list, select Create a topic.
9. In the Create a topic dialog, enter `balena-state-topic` in the Name field.
10. Click Create in the Create a topic dialog.
11. Click Create on the Cloud IoT Core page.

You've just created a device registry with a Cloud Pub/Sub topic for publishing device telemetry events.

## Create service account and credentials

1. Go to the [GCP IAM service accounts page](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click Create service account
3. Name it `balena-service-account`
4. Click Create
5. On the Roles dropdown add the following: Cloud IoT Provisioner and Pub/Sub Publisher
6. Click Continue
7. Click Create Key to create JSON keys for your service account.
8. Download the credentials JSON file and click Done to complete te setup.

The contents of the credentials JSON file will be your `GOOGLE_IOT_SERVICE_ACCOUNT_TOKEN` variable. 