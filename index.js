const GoogleIoT = require('./lib/GoogleIoT.js')
const MQTTBridge = require('./lib/MQTTBridge.js')
const fs = require('fs')

let google = new GoogleIoT({
  device: process.env.RESIN_DEVICE_UUID,
  gcpProject: process.env.GOOGLE_IOT_PROJECT,
  gcpRegion: process.env.GOOGLE_IOT_REGION,
  gcpRegistry: process.env.GOOGLE_IOT_REGISTRY,
  gcpServiceAccount: process.env.GOOGLE_IOT_SERVICE_ACCOUNT_TOKEN,
})

let mqtt = new MQTTBridge({
  device: process.env.RESIN_DEVICE_UUID,
  gcpProject: process.env.GOOGLE_IOT_PROJECT
})

async function start () {
  // Ensure our device is properly registered and configured on Google IoT Core cloud service.
  await google.registerDevice()

  // Configure MQTT client before connecting to IoT Core server
  mqtt.setClientId(google.getDevicePath())  // Get full path to device on IoT Core
  await mqtt.connect()

  // Optional callback, fired every time we receive a message on any topic
  mqtt.setMessageCallback((topic, message) => {
    console.log(`Received message --- Topic: ${topic} - Message: `, Buffer.from(message, 'base64').toString('ascii'))

    // Update the device state upon receiving a config message
    // A good practise is to update the device state to reflect that the device got the config.
    if (topic.endsWith('config')) {
      mqtt.publishState({ deviceId: mqtt.device.id, timestamp: new Date().toString() })
    }
  })

  // Publish device data every X seconds to Google IoT Core
  setInterval(() => {
    mqtt.publishTelemetry({
      cpuLoad: getCpuLoad(),
      memoryInfo: getMemoryInfo(),
    })
  }, 30 * 1000)


  console.log('Startup completed!')
}

function getCpuLoad () {
  // Will probably fail for non Pi systems
  try {
    var text = fs.readFileSync("/proc/loadavg", "utf8")
    // get load for the last minute
    const load = parseFloat(text.match(/(\d+\.\d+)\s+/)[ 1 ])
    return load.toString()
  } catch (error) {
    return "Error getting CPU load"
  }
}

function getMemoryInfo () {
  // Will probably fail for non Pi systems
  try {
    var text = fs.readFileSync("/proc/meminfo", "utf8")
    // Parse total and free memory from /proc/meminfo, and calculate percentage used
    const matchTotal = text.match(/MemTotal:\s+([0-9]+)/)
    const matchFree = text.match(/MemAvailable:\s+([0-9]+)/)
    const total = parseInt(matchTotal[ 1 ], 10)
    const free = parseInt(matchFree[ 1 ], 10)
    const percentageUsed = Math.round((total - free) / total * 100)
    return percentageUsed.toString()
  } catch (error) {
    return "Error getting Memory Info"
  }
}

start()
