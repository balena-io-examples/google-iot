const fs = require('fs');
const express = require('express');
const app = express();
const {google} = require('googleapis');
const util = require('util');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');

// Config
const serviceAccountJson = '/data/service.json';
const cloudRegion = process.env.GOOGLE_IOT_REGION;
const projectId = process.env.GOOGLE_IOT_PROJECT;
const registryId = process.env.GOOGLE_IOT_REGISTRY;
const deviceId = process.env.RESIN_DEVICE_NAME_AT_INIT;

const mqttBridgeHostname = 'mqtt.googleapis.com';
const mqttBridgePort = '8883';
const messageType = 'events';
const tokenExpMins = '20';
const numMessages = '10';
const algorithm = 'RS256';
const privateKeyFile = '/data/rsa-priv.pem';

// The initial backoff time after a disconnection occurs, in seconds.
var MINIMUM_BACKOFF_TIME = 1;

// The maximum backoff time before giving up, in seconds.
var MAXIMUM_BACKOFF_TIME = 32;

// Whether to wait with exponential backoff before publishing.
var shouldBackoff = false;

// The current backoff time.
var backoffTime = 1;

// Whether an asynchronous publish chain is in progress.
var publishChainInProgress = false;

// Create a Cloud IoT Core JWT for the given project id, signed with the given
// private key.
// [START iot_mqtt_jwt]
function createJwt(projectId, privateKeyFile, algorithm) {
   // Create a JWT to authenticate this device. The device will be disconnected
   // after the token expires, and will have to reconnect with a new token. The
   // audience field should always be set to the GCP project id.
   const token = {
      'iat': parseInt(Date.now() / 1000),
      'exp': parseInt(Date.now() / 1000) + 20 * 60, // 20 minutes
      'aud': projectId
   };
   const privateKey = fs.readFileSync(privateKeyFile);
   return jwt.sign(token, privateKey, {algorithm: algorithm});
}
// [END iot_mqtt_jwt]

// Publish numMessages messages asynchronously, starting from message
// messagesSent.
// [START iot_mqtt_publish]
function publishAsync(messagesSent, numMessages) {
   // If we have published enough messages or backed off too many times, stop.
   if (messagesSent > numMessages || backoffTime >= MAXIMUM_BACKOFF_TIME) {
      if (backoffTime >= MAXIMUM_BACKOFF_TIME) {
         console.log('Backoff time is too high. Giving up.');
      }
      //console.log('Closing connection to MQTT. Goodbye!');
      //client.end();
      publishChainInProgress = false;
      return;
   }

   // Publish and schedule the next publish.
   publishChainInProgress = true;
   var publishDelayMs = 0;
   if (shouldBackoff) {
      publishDelayMs = 1000 * (backoffTime + Math.random());
      backoffTime *= 2;
      console.log(`Backing off for ${publishDelayMs}ms before publishing.`);
   }

   setTimeout(function() {
      const payload = `${registryId}/${deviceId}-payload-${messagesSent}`;

      // Publish "payload" to the MQTT topic. qos=1 means at least once delivery.
      // Cloud IoT Core also supports qos=0 for at most once delivery.
      console.log('Publishing message:', payload);
      client.publish(mqttTopic, payload, {
         qos: 1
      }, function(err) {
         if (!err) {
            shouldBackoff = false;
            backoffTime = MINIMUM_BACKOFF_TIME;
         }
      });

      var schedulePublishDelayMs = messageType === 'events'
         ? 1000
         : 2000;
      setTimeout(function() {
         // [START iot_mqtt_jwt_refresh]
         let secsFromIssue = parseInt(Date.now() / 1000) - iatTime;
         if (secsFromIssue > tokenExpMins * 60) {
            iatTime = parseInt(Date.now() / 1000);
            console.log(`\tRefreshing token after ${secsFromIssue} seconds.`);

            client.end();
            connectionArgs.password = createJwt(projectId, privateKeyFile, algorithm);
            client = mqtt.connect(connectionArgs);

            client.on('connect', (success) => {
               console.log('connect');
               client.subscribe(subs);
               if (!success) {
                  console.log('Client not connected...');
               } else if (!publishChainInProgress) {
                  publishAsync(1, numMessages);
               }
            });

            client.on('close', () => {
               console.log('close');
               shouldBackoff = true;
            });

            client.on('error', (err) => {
               console.log('error', err);
            });

            client.on('message', (topic, message, packet) => {
               console.log('message received: ', Buffer.from(message, 'base64').toString('ascii'));
            });

            client.on('packetsend', () => {
               // Note: logging packet send is very verbose
            });
         }
         // [END iot_mqtt_jwt_refresh]
         publishAsync(messagesSent + 1, numMessages);
      }, schedulePublishDelayMs);
   }, publishDelayMs);
}
// [END iot_mqtt_publish]

// The MQTT topic that this device will publish data to. The MQTT
// topic name is required to be in the format below. The topic name must end in
// 'state' to publish state and 'events' to publish telemetry. Note that this is
// not the same as the device registry's Cloud Pub/Sub topic.
const mqttTopic = `/devices/${deviceId}/${messageType}`;

// [START iot_mqtt_run]
// The mqttClientId is a unique string that identifies this device. For Google
// Cloud IoT Core, it must be in the format below.
const mqttClientId = `projects/${projectId}/locations/${cloudRegion}/registries/${registryId}/devices/${deviceId}`;

// With Google Cloud IoT Core, the username field is ignored, however it must be
// non-empty. The password field is used to transmit a JWT to authorize the
// device. The "mqtts" protocol causes the library to connect using SSL, which
// is required for Cloud IoT Core.
let connectionArgs = {
   host: mqttBridgeHostname,
   port: mqttBridgePort,
   clientId: mqttClientId,
   username: 'unused',
   password: createJwt(projectId, privateKeyFile, algorithm),
   protocol: 'mqtts',
   secureProtocol: 'TLSv1_2_method'
};

// Create a client, and connect to the Google MQTT bridge.
let iatTime = parseInt(Date.now() / 1000);
let client = mqtt.connect(connectionArgs);
var subs = [];
subs[mqttTopic] = 1;
subs[`/devices/${deviceId}/config`] = 1;
subs[`/projects/resinio-451e8/topics/info`] = 1;
client.subscribe(subs);

client.on('connect', (success) => {
   console.log('connect');
   if (!success) {
      console.log('Client not connected...');
   } else if (!publishChainInProgress) {
      // Subscribe to the /devices/{device-id}/config topic to receive config updates.
      client.subscribe(subs);
      publishAsync(1, numMessages);
   }
});

client.on('close', () => {
   console.log('close');
   shouldBackoff = true;
});

client.on('error', (err) => {
   console.log('error', err);
});

client.on('message', (topic, message, packet) => {
   console.log('message received: ', Buffer.from(message, 'base64').toString('ascii'));
});

client.on('packetsend', () => {
   // Note: logging packet send is very verbose
});

/*app.get('/', function(req, res) {
   res.send('Messages in buffer:<br><pre>' + messageBuffer + '</pre>');
});

//start a web server on port 80 and log its start to our console
var server = app.listen(80, function() {
   var port = server.address().port;
   console.log('Google IoT core example app listening on port ', port);
});
*/
