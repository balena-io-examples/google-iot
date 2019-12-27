const jwt = require('jsonwebtoken')
const mqtt = require('mqtt')
const fs = require('fs')

class MQTTBridge {
  constructor (config = {}) {
    let options = Object.assign({
      credentialsPath: '/data',
      mqttHost: 'mqtt.googleapis.com',
      mqttPort: 8883, // Google IoT Core server exposed on port 8883 (also supports port 443 if outgoing connections on 8883 are blocked)
      mqttProtocol: 'mqtts',
      mqttSecureProtocol: 'TLSv1_2_method'
    }, config)

    if (!options.device) {
      throw new Error("[MQTT] No device name supplied, are you running this in balenaOS?")
    }

    if (!options.gcpProject) {
      throw new Error("[Google IoT] Google project not set.")
    }

    // Device configuration
    this.device = {
      id: `balena-${options.device}`, // Google IoT Core no longer allows device ID's that start with a number
      path: options.credentialsPath,
      key: {
        file: `${options.credentialsPath}/rsa-priv.pem`,
        cert: `${options.credentialsPath}/rsa-cert.pem`,
        algorithm: 'RS256',
        command: `cd ${options.credentialsPath} && openssl req -x509 -newkey rsa:2048 -keyout rsa-priv.pem -nodes -out rsa-cert.pem -subj "/CN=unused" && openssl ecparam -genkey -name prime256v1 -noout -out rsa-ec_private.pem && openssl ec -in rsa-ec_private.pem -pubout -out rsa-ec_public.pem`
      }
    }

    // mqtt configuration
    this.mqtt = {
      host: options.mqttHost,
      port: options.mqttPort,
      clientId: null,
      username: 'unused',
      password: null,
      protocol: options.mqttProtocol,
      secureProtocol: options.mqttSecureProtocol,
      project: options.gcpProject
    }

    // The MQTT topics that this device will publish and subscribe to. The MQTT
    // MQTT topic names are required to be in the format below. The topic name must end in
    // 'state' to publish state and 'events' to publish telemetry. To receive configuration
    // events from the server the topic must end in 'config'
    // Note that this is not the same as the device registry's Cloud Pub/Sub topic.
    this.topics = {
      config: `/devices/${this.device.id}/config`,
      state: `/devices/${this.device.id}/state`,
      telemetry: `/devices/${this.device.id}/events`
    }

    this.client = null
  }

  setClientId (clientId) {
    this.mqtt.clientId = clientId
  }

  async connect () {
    await this.closeConnection()
    await this.openConnection()

    setInterval(async () => {
      console.log('[MQTT] Reconnecting due to token expiry ...')
      await this.closeConnection()
      await this.openConnection()
    }, 1000 * 60 * 18)
  }

  openConnection () {
    return new Promise((resolve, reject) => {
      // Don't attempt to connect if clientId or project were not set
      if (this.mqtt.clientId === null || this.mqtt.project === null) reject('ClientId or Project are not set.')

      // Refresh JWT
      console.log('[MQTT] Refreshing jwt token ...')
      this.mqtt.password = this.createJWT()

      // Open connection
      console.log('[MQTT] Opening connection ...')
      this.client = mqtt.connect(this.mqtt)

      this.client.on('connect', (success) => {
        console.log('[MQTT] MQTT Connection successful!')
        // QoS=0 - message received at most once. No ACK.
        // QoS=1 - message received at least once. Can be duplicates.
        // QoS=2 - not supported by Google IoT Core
        this.client.subscribe(this.topics.config, { qos: 1 })
        this.client.subscribe(this.topics.state, { qos: 1 })
        this.client.subscribe(this.topics.telemetry, { qos: 1 })
        resolve()
      })

      this.client.on('close', () => {
        console.log('[MQTT] MQTT Connection closed.')
      })

      this.client.on('error', (err) => {
        console.log('[MQTT] MQTT error', err)
        reject(err)
      })

      this.client.on('message', async (topic, message, packet) => {
        if (this.messageCallback) {
          this.messageCallback(topic, message, packet)
        } else {
          console.log(`[MQTT] Topic: ${topic} - Message: `, Buffer.from(message, 'base64').toString('ascii'))
        }
      })
    })
  }

  setMessageCallback (callback) {
    this.messageCallback = callback
  }

  closeConnection () {
    return new Promise((resolve, reject) => {
      if (this.client && this.client.connected) {
        this.client.end(false, () => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  publish (data, topic) {
    return new Promise((resolve, reject) => {
      try {
        if (this.client && this.client.connected) {
          this.client.publish(topic, JSON.stringify(data), {}, function (err) {
            if (err) {
              console.log('[MQTT] error!!')
              console.log(err)
              reject({ message: `${err}`, statusCode: 500 })
            } else {
              console.log(`[MQTT] Data published successfully on topic ${topic}!`)
              resolve({ message: `[MQTT] Data published successfully on topic ${topic}!`, statusCode: 200 })
            }
          })
        } else {
          console.log('[MQTT] MQTT Client not connected')
          reject('[MQTT] MQTT Client not connected.')
        }
      } catch (e) {
        console.log('error!')
        console.log(e.message)
        reject({ message: `[MQTT] ${e.message}`, statusCode: 500 })
      }
    })
  }

  async publishTelemetry (data) {
    return await this.publish(data, this.topics.telemetry)
  }

  async publishState (data) {
    return await this.publish(data, this.topics.state)
  }

  // Create a JWT to authenticate this device. The device will be disconnected
  // after the token expires, and will have to reconnect with a new token. The
  // audience field should always be set to the GCP project id.
  createJWT () {
    const token = {
      iat: parseInt(Date.now() / 1000),
      exp: parseInt(Date.now() / 1000) + 20 * 60, // 20 minutes
      aud: this.mqtt.project
    }
    return jwt.sign(token, fs.readFileSync(this.device.key.file), { algorithm: this.device.key.algorithm })
  }

}

module.exports = MQTTBridge
