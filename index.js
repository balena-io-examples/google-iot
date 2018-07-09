// Required for connecting with Google Cloud IoT
const fs = require('fs');
const {google} = require('googleapis');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');

// Pull the Google Cloud IoY config from the device's env variables
const cloudRegion = process.env.GOOGLE_IOT_REGION;
const projectId = process.env.GOOGLE_IOT_PROJECT;
const registryId = process.env.GOOGLE_IOT_REGISTRY;
const deviceId = process.env.RESIN_DEVICE_NAME_AT_INIT;
// Private key file that was created the first time start.sh was run.
const privateKeyFile = '/data/rsa-priv.pem';

// MQTT server config for Google Cloud IoT, the server also supports port 443 if outgoing connections on 8883 are blocked
const mqttBridgeHostname = 'mqtt.googleapis.com';
const mqttBridgePort = '8883';
const messageType = 'events';
const tokenExpMins = '20';
const numMessages = '10';
const algorithm = 'RS256';

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

var cpuLoad = memoryUsage = 0;

// Create a Cloud IoT Core JWT for the given project id, signed with the given private key.
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

// Publish numMessages messages asynchronously, starting from message
// messagesSent.
function publishAsync() {

   // Publish and schedule the next publish.
   publishChainInProgress = true;
   var publishDelayMs = 0;
   if (shouldBackoff) {
      publishDelayMs = 1000 * (backoffTime + Math.random());
      if (backoffTime <= MAXIMUM_BACKOFF_TIME) {
         backoffTime *= 2;
      }
      console.log(`Backing off for ${publishDelayMs}ms before publishing.`);
   }

   setTimeout(function() {
      let cpuLoad = getCpuLoad();
      let memoryUsage = getMemoryInfo();
      const payload = {'deviceId' : deviceId, 'cpuLoad' : cpuLoad, 'memoryUsage' : memoryUsage };

      // Publish "payload" to the MQTT topic. qos=1 means at least once delivery.
      // Cloud IoT Core also supports qos=0 for at most once delivery.
      console.log('Publishing message:', payload);
      client.publish(mqttTopic, JSON.stringify(payload), {
         qos: 1
      }, function(err) {
         if (!err) {
            shouldBackoff = false;
            backoffTime = MINIMUM_BACKOFF_TIME;
         }
      });

      var schedulePublishDelayMs = messageType === 'events'
         ? 2000
         : 4000;
      setTimeout(function() {
         let secsFromIssue = parseInt(Date.now() / 1000) - iatTime;
         // Refresh the JWT token if it has expired, and re-connect the mqtt client
         if (secsFromIssue > tokenExpMins * 60) {
            iatTime = parseInt(Date.now() / 1000);
            console.log(`\tRefreshing token after ${secsFromIssue} seconds.`);

            client.end();
            connectionArgs.password = createJwt(projectId, privateKeyFile, algorithm);
            client = mqtt.connect(connectionArgs);

            client.on('connect', (success) => {
               console.log('connect');
               client.subscribe(mqttTopic);
               if (!success) {
                  console.log('Client not connected...');
               } else if (!publishChainInProgress) {
                  publishAsync();
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
         publishAsync();
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
client.subscribe(mqttTopic);

client.on('connect', (success) => {
   console.log('connect');
   if (!success) {
      console.log('Client not connected...');
   } else if (!publishChainInProgress) {
      client.subscribe(mqttTopic);
      publishAsync();
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

//
function getCpuLoad() {
   var text = fs.readFileSync("/proc/loadavg", "utf8");
   // get load for the last minute
   const load = parseFloat(text.match(/(\d+\.\d+)\s+/)[1]);
   return load.toString();
};

function getMemoryInfo() {
   var text = fs.readFileSync("/proc/meminfo", "utf8");
   // Parse total and free memory from /proc/meminfo, and calculate percentage used
   const matchTotal = text.match(/MemTotal:\s+([0-9]+)/);
   const matchFree = text.match(/MemAvailable:\s+([0-9]+)/);
   const total = parseInt(matchTotal[1], 10);
   const free = parseInt(matchFree[1], 10);
   const percentageUsed = Math.round((total - free) / total * 100);
   return percentageUsed.toString();
};
