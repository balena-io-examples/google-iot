const iot = require('@google-cloud/iot')
const shell = require('shelljs')
const fs = require('fs')

class GoogleIoT {
  constructor (config = {}) {
    let options = Object.assign({
      credentialsPath: '/data'
    }, config)

    if (!options.device) {
      throw new Error("[Google IoT] No device name supplied, are you running this in balenaOS?")
    }

    if (!options.gcpProject) {
      throw new Error("[Google IoT] Google project not set.")
    }

    if (!options.gcpRegion) {
      throw new Error("[Google IoT] Google region not set.")
    }

    if (!options.gcpRegistry) {
      throw new Error("[Google IoT] Google registry not set.")
    }

    if (!options.gcpServiceAccount) {
      throw new Error("[Google IoT] Google service account not set.")
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
    console.log('aaaa')
    console.log(options.gcpServiceAccount)
    console.log('bbbb')
    console.log(options.gcpServiceAccount.replace(/\n/g, '\\n'))
    console.log('cccc')

    // Google IoT Core configuration
    this.google = {
      project: options.gcpProject,
      region: options.gcpRegion,
      registry: options.gcpRegistry,
      service: JSON.parse(options.gcpServiceAccount.replace(/\n/g, '\\n'))
    }

    console.log(this.google.service)

    // Connect to Google IoT Core
    console.log('[Google IoT] Connecting to Google IoT Core ...')
    console.log(`[Google IoT] Device ID: ${this.device.id}`)
    console.log(`[Google IoT] Project: ${this.google.project}`)
    console.log(`[Google IoT] Region: ${this.google.region}`)
    console.log(`[Google IoT] Registry: ${this.google.registry}`)
    this.client = new iot.DeviceManagerClient({ projectId: this.google.project, credentials: this.google.service })
  }

  async getDevices () {
    return await this.client.listDevices({ parent: this.getRegistryPath() })
  }

  getRegistryPath () {
    return this.client.registryPath(this.google.project, this.google.region, this.google.registry)
  }

  getDevicePath () {
    return this.client.devicePath(this.google.project, this.google.region, this.google.registry, this.device.id)
  }

  getProjectName () {
    return this.google.project
  }

  async isDeviceRegistered () {
    try {
      let devices = await this.getDevices()
      return devices[ 0 ].some(device => device.id === this.device.id)
    } catch (e) {
      console.log(e.message)
      return false
    }
  }

  async registerDevice () {
    try {
      if (!(await this.isDeviceRegistered())) {
        console.log(`[Google IoT] Device with name ${this.device.id} not registered. Attempting to register...`)
        this.iotRegistration()
      } else {
        console.log(`[Google IoT] Device with name ${this.device.id} already registered!`)
        if (!fs.existsSync(this.device.key.cert) || !fs.existsSync(this.device.key.file)) {
          console.log(`[Google IoT] WARNING: Missing key files - Will not be able to connect to Google IoT Core.`)
          console.log(`[Google IoT] Attempting to regenerate keys and register them on device...`)
          this.iotRegenKeys()
        }
      }
    } catch (e) {
      console.log(e.message)
    }
  }

  async iotRegistration () {
    // Create RSA keys
    let rsaCmd = shell.exec(this.device.key.command)

    if (rsaCmd.code === 0) {
      let deviceObject = {
        id: this.device.id,
        credentials: [ { publicKey: { format: 'RSA_X509_PEM', key: fs.readFileSync(this.device.key.cert).toString() } } ]
      }

      // Create the device on Google IoT Core
      await this.client.createDevice({ parent: this.getRegistryPath(), device: deviceObject })
    }
  }

  async iotRegenKeys () {
    // Create RSA keys
    let rsaCmd = shell.exec(this.device.key.command)

    if (rsaCmd.code === 0) {
      let deviceObject = {
        name: this.getDevicePath(),
        credentials: [ { publicKey: { format: 'RSA_X509_PEM', key: fs.readFileSync(this.device.key.cert).toString() } } ]
      }

      // Create the device on Google IoT Core
      await this.client.updateDevice({ device: deviceObject, updateMask: { paths: [ 'credentials' ] } })
    }
  }
}
module.exports = GoogleIoT
