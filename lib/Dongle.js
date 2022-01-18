/**
 * Object representing a Dongle
 *
 * This object is created when a
 * 'peripheral' is scanned; it allows inspection of the peripheral and interaction with its
 * services.
 *
 * At a minimum, it expects the peripheral to support the controller service, with
 * command, response, product, serial number, status(5) and fault characteristics.
 *
 * Events are emitted as follows:
 *
 * connect:
 * Emitted when the BLE connection is made to the peripheral.
 * This is NOT the same as being ready to use the controller, as it occurs
 * BEFORE the device is interrogated and validated.  Use the 'ready' event
 * or the resolution of the connect() promise to determine when the controller is ready
 * to use.
 *
 * disconnect:
 * Emitted when the BLE connection to the peripheral is lost.  You can basically
 * delete this object at this point and create another one when a connection is
 * (re) established
 *
 */


// include class that allows us to emit events
const EventEmitter = require('events').EventEmitter;

// utiity library
const _ = require('underscore');

// The service advertised by the dongle, so we can find it
const SERVICE_ID = '6765ed1f4de149e14771a14380c90000';


// Super watcher slot
const SLOT_SUPERWATCH = 0x10;

// Op codes we send to the dongle as commands
const OP_CONFIGURE = 0;
const OP_KEYSWITCH = 1;
const OP_WATCH = 2;
const OP_UNWATCH = 3;
const OP_UNWATCH_ALL = 4;
const OP_SUPERWATCH = 5;

// the object id of the flash memory page and its length in bytes
const OBJECT_INFO = 0;
const OBJECT_INFO_SIZE = 128;


// a library that, among other things, sends and receives messages
const Modbus = require('@csllc/cs-modbus');

const Watcher = require('./Watcher');

/**
 * Constructor
 *
 * @param {[type]} peripheral [description]
 */
class Dongle extends EventEmitter {

  constructor(peripheral, options) {

    super();

    this.options = Object.assign({

      // whether to output a bunch of debug
      verbose: true,

      // Default number of milliseconds to wait for replies from the remote end
      defaultTimeout: 10000,

    }, options);

    //------------------------------------//---------------------------------------
    // Definitions for BLE UUIDs


    // Device Information Service
    this.uuidDeviceInformation = '180a';
    this.uuidSystemId = '2a23';
    this.uuidModelNumber = '2a24';
    this.uuidDongleSerialNumber = '2a25';
    this.uuidFirmwareRevision = '2a26';
    this.uuidHardwareRevision = '2a27';
    this.uuidSoftwareRevision = '2a28';
    this.uuidManufacturerName = '2a29';


    // UUID for the transparent data (UART) service
    this.uuidUartService = '49535343fe7d4ae58fa99fafd205e455';
    this.uuidRx = '495353431e4d4bd9ba6123c647249616';
    this.uuidTx = '49535343884143f4a8d4ecbe34729bb3';
    this.uuidUartControl = '495353434c8a39b32f49511cff073b7e';

    // UUID for the CSLLC private controller service
    // this.uuidLocationService = '7765ed1f4de149e14771a14380c90000';
    // the characteristics for the Location service
    // this.uuidPosition = '7765ed1f4de149e14771a14380c90001';


    // UUID for the CSLLC private controller service
    this.uuidControllerService = SERVICE_ID;

    // the characteristics for the Controller service
    // this.uuidCommand = '6765ed1f4de149e14771a14380c90001';
    // this.uuidResponse = '6765ed1f4de149e14771a14380c90002';
    this.uuidProduct = '6765ed1f4de149e14771a14380c90003';
    this.uuidSerial = '6765ed1f4de149e14771a14380c90004';
    this.uuidFault = '6765ed1f4de149e14771a14380c90005';

    this.uuidStatus = [
      '6765ed1f4de149e14771a14380c90006',
      '6765ed1f4de149e14771a14380c90007',
      '6765ed1f4de149e14771a14380c90008',
      '6765ed1f4de149e14771a14380c90009',
      '6765ed1f4de149e14771a14380c9000a',
      '6765ed1f4de149e14771a14380c9000b',
      '6765ed1f4de149e14771a14380c9000c',
      '6765ed1f4de149e14771a14380c9000d',
      '6765ed1f4de149e14771a14380c9000e',
      '6765ed1f4de149e14771a14380c9000f',

      '6765ed1f4de149e14771a14380c90010',
      '6765ed1f4de149e14771a14380c90011',
      '6765ed1f4de149e14771a14380c90012',
      '6765ed1f4de149e14771a14380c90013',
      '6765ed1f4de149e14771a14380c90014',
      '6765ed1f4de149e14771a14380c90015',
      '6765ed1f4de149e14771a14380c90016',
      '6765ed1f4de149e14771a14380c90017',
      '6765ed1f4de149e14771a14380c90018',
      '6765ed1f4de149e14771a14380c90019',


      // '6765ed1f4de149e14771a14380c9001B',
      // '6765ed1f4de149e14771a14380c9001C',
      // '6765ed1f4de149e14771a14380c9001D',
      // '6765ed1f4de149e14771a14380c9001E',
    ];   
    this.numStatus = this.uuidStatus.length;

    this.uuidSuperwatch = '6765ed1f4de149e14771a14380c9001a';

    // UART service characteristics
    this.rxCharacteristic = null;
    this.txCharacteristic = null;
    this.uartCharacteristic = null;

    this.commandChar = null;
    this.responseChar = null;
    this.productChar = null;
    this.serialChar = null;
    this.faultChar = null;

    this.statusChar = [];

    this.superwatchChar = null;

    // this.StatusChar = null;
    // this.Status2Char = null;
    // this.Status3Char = null;
    // this.Status4Char = null;
    // this.Status5Char = null;

    // this.positionChar = null;

    // Info about this device that is discovered when connected
    this.deviceType = null;
    this.serial = null;
    this.fault = null;

    // whether or not we are fully connected.  the peripheral object
    // keeps track of the BLE connected state, but we use this to make sure
    // we have also registered for the right characteristics,etc
    this.connected = false;

    // store the whole peripheral reference
    this.peripheral = peripheral;

    // service needs to be discovered upon connecting
    this.controllerService = null;
    this.uartService = null;

    // the fd member indicates whether the 'serial port' is open or not
    this.fd = null;

    // Queue for outgoing commands
    this.commandQueue = [];

    // Counter to help match device responses with commands
    this.commandSequence = 0;

    // Pass noble BLE events through to our user
    this.peripheral.on('connect', this.emit.bind(this, 'connect'));
    this.peripheral.on('disconnect', this.emit.bind(this, 'disconnect'));

    // Create a modbus master that can be used to send and receive
    // messages through the 'transparent UART' characteristics

    this.defaultTimeout = 5000;

    this.master = Modbus.createMaster({
      transport: {
        type: 'ip',
        eofTimeout: 10,
        connection: {
          type: 'generic',
          device: this
        }
      },
      suppressTransactionErrors: true,
      retryOnException: false,
      maxConcurrentRequests: 2,
      defaultUnit: 1,
      defaultMaxRetries: 0,
      defaultTimeout: this.options.defaultTimeout,
    });

    if (this.options.verbose) {
      this.hookLogEvents();
    }

    // The 'ID' we use to send messages directed at the dongle itself
    // This is hardcoded in the dongle
    this.id = 254;

  }

  // Returns a promise that resolves when the configure command is complete
  configure(options) {
    return this.command(this.id, OP_CONFIGURE, Buffer.from([]));
  }

  // Returns a promise that resolves when the state of the keyswitch is set
  keyswitch(state) {

    return this.command(this.id, OP_KEYSWITCH, Buffer.from([(state) ? 1 : 0]));
  }


  // Send a command PDU to the device
  command(dest, id, values, options) {

    let me = this;

    return new Promise(function(resolve, reject) {

      options = options || {};

      options.onComplete = function(err, response) {
        if (response && response.exceptionCode) {
          // i'm not sure how to catch exception responses from the
          // slave in a better way than this
          err = new Error('Exception ' + response.exceptionCode);
        }
        if (err) {
          reject(err);
        } else {
          if (response.values && response.values[0] === 0) {
            resolve();
          } else {
            reject('Error issuing command ' + id);
          }
        }
      };

      options.unit = dest;

      me.master.command(id, values, options);

    });
  }

  // Read device memory using the MODBUS read memory function code
  // returns a Promise that resolves when the write is complete
  readMemory(dest, address, length, options) {

    let me = this;

    return new Promise(function(resolve, reject) {

      options = options || {};

      options.onComplete = function(err, response) {
        if (response && response.exceptionCode) {
          // i'm not sure how to catch exception responses from the
          // slave in a better way than this
          err = new Error('Exception ' + response.exceptionCode);
        }
        if (err) {
          reject(err);
        } else {
          resolve(response.values);
        }
      };

      //options.onError = reject;
      options.unit = dest;

      me.master.readMemory(address, length, options);

    });
  }

  // Write to device memory using the MODBUS write memory function code
  // returns a Promise that resolves when the write is complete
  writeMemory(dest, address, data, options) {

    let me = this;

    return new Promise(function(resolve, reject) {

      options = options || {};

      options.onComplete = function(err, response) {
        if (response && response.exceptionCode) {
          // i'm not sure how to catch exception responses from the
          // slave in a better way than this
          err = new Error('Exception ' + response.exceptionCode);
        }
        if (err) {
          reject(err);
        } else {
          if (response.status === 0) {
            resolve();
          } else {
            reject('Error writing to device ');
          }
        }
      };

      options.unit = dest;

      me.master.writeMemory(address, data, options);

    });
  }


  // Read data object from device
  // returns a Promise that resolves when the read is complete
  readObject(dest, objectId, options) {

    let me = this;

    return new Promise(function(resolve, reject) {

      options = options || {};

      options.onComplete = function(err, response) {
        if (response && response.exceptionCode) {
          // i'm not sure how to catch exception responses from the
          // slave in a better way than this
          err = new Error('Exception ' + response.exceptionCode);
        }
        if (err) {
          reject(err);
        } else {
          resolve(response.values);
        }
      };

      //options.onError = reject;
      options.unit = dest;

      me.master
      .readObject(objectId, options);

    });
  }

  // Write a data object in the device
  // returns a Promise that resolves when the write is complete
  writeObject(dest, objectId, data, options) {

    let me = this;

    return new Promise(function(resolve, reject) {

      options = options || {};

      options.onComplete = function(err, response) {
        if (response && response.exceptionCode) {
          // i'm not sure how to catch exception responses from the
          // slave in a better way than this
          err = new Error('Exception ' + response.exceptionCode);
        }
        if (err) {
          reject(err);
        } else {
          if (response.status === 0) {
            resolve(true);
          } else {
            reject('Error writing to device ');
          }
        }
      };

      options.unit = dest;

      me.master.writeObject(objectId, data, options);

    });
  }


  watch(slot, id, address, length, cb) {

    // if the length was not supplied, default it to 1
    if ('function' === typeof(length)) {
      cb = length;
      length = 1;
    }

    let me = this;

    if (slot < me.numStatus) {

      me.watcherCb[slot] = cb;
      return me.unsubscribe(me.statusChar[slot])
      .then(() => me.command(me.id, OP_WATCH, Buffer.from([slot, id, (address >> 8), (address & 0xFF), length])))
      .then(() => me.subscribe(me.statusChar[slot]))

    } else {
      return Promise.reject('watch requested for invalid slot number');
    }


  }

  superwatch(id, addresses, cb) {
    let me = this;

    // addresses is an array of 16 bit addresses

    // Length 1 is assumed for each location used by the super-watcher.
    // Slot is fixed at 0xFF for the super-watcher.

    me.watcherCb[SLOT_SUPERWATCH] = cb;

    let commandArray = [SLOT_SUPERWATCH, id];

    addresses.forEach((address) => {
      commandArray.push(address >> 8);
      commandArray.push(address & 0xFF);
    });

    console.log("superwatch commandArray", commandArray);

    return me.unsubscribe(me.superwatchChar)
    .then(() => {
      me.command(me.id, OP_SUPERWATCH, Buffer.from(commandArray));

    })
    .then(() => me.subscribe(me.superwatchChar))
         
  }

  async setWatchers(watchers) {
    let me = this;

    let unsub = [];
    let list = [];
    let sub = [];

    if (watchers instanceof Watcher) {
      watchers = [watchers];
    }

    // unsubscribe from all
    watchers.forEach((watcher) => {

      unsub.push(me.unsubscribe(me.statusChar[watcher.slot]));

      me.watcherCb[watcher.slot] = watcher.cb;

      list.push(watcher.slot, watcher.id, watcher.address >> 8, (watcher.address & 0xFF), watcher.length);
    });

    await Promise.all(unsub);

    // configure the watchers
    await me.command(me.id, OP_WATCH, Buffer.from(list));


    // subscribe to the status chars
    watchers.forEach((watcher) => {

      sub.push(me.subscribe(me.statusChar[watcher.slot]));

    });

    await Promise.all(sub);

  }


  async clearWatchers(watchers) {
    let me = this;

    let unsub = [];
    let list = [];

    watchers.forEach((watcher) => {

      if (watcher.slot < me.numStatus) {
        me.watcherCb[watcher.slot] = null;

        unsub.push(me.unsubscribe(me.statusChar[watcher.slot]));

        list.push(watcher.slot);
      }
    });

    // send the stop to the dongle
    await me.command(me.id, OP_UNWATCH, Buffer.from(list));


  }

  unwatch(slot) {

    let me = this;

    if (slot < me.numStatus) {
      me.watcherCb[slot] = null;

      return me.unsubscribe(me.statusChar[slot])
      .then(() => me.command(me.id, OP_UNWATCH, Buffer.from([slot])));

    } else {
      return Promise.reject('unwatch requested for invalid slot number');
    }
  }

  unwatchAll(slot) {

    for (let i = 0; i < this.numStatus; i++) {
      this.unsubscribe(this.statusChar[i]);
    }

    return this.command(this.id, OP_UNWATCH_ALL);

  }

  // Hook events for logging
  hookLogEvents() {

    // Catch an event if the port gets disconnected
    this.master.on('disconnected', function() {
      console.log('[master#disconnected]');
    });

    // Catch an event if the port gets disconnected
    this.master.on('connected', function() {
      console.log('[master#connected]');
    });

    let connection = this.master.getConnection();

    connection.on('open', function() {
      console.info('[connection#open]');
    });

    connection.on('close', function() {
      console.info('[connection#close]');
    });

    connection.on('error', function(err) {
      console.error('Error: ', '[connection#error] ' + err.message);
    });

    connection.on('write', function(data) {
      console.info('[TX] ', data);
    });

    connection.on('data', function(data) {
      console.info('[RX] ', data);
    });
  }

  /**
   * Test to see if we are connected to a device
   *
   * @return {Boolean} true if connnected
   */
  isConnected() {

    return (this.peripheral &&
      this.peripheral.state === 'connected' &&
      this.connected === true);

  }

  isOpen() {
    return this.isConnected();
  }

  /**
   * Read a characteristic and return its value
   *
   * @return {Promise} resolves when the characteristic is read
   */
  readCharacteristic(characteristic) {

    var me = this;

    return new Promise(function(resolve, reject) {

      // If there is a controller service, we are connected
      if (me.peripheral && me.peripheral.state === 'connected') {

        characteristic.read(function(err, data) {

          resolve(data);

        });

      } else {
        reject();
      }
    });

  }


  /**
   * Write a characteristic to the specified value
   *
   * @return {Promise} resolves when the write is finished
   */
  writeCharacteristic(characteristic, value) {

    var me = this;

    return new Promise(function(resolve, reject) {

      // If there is a controller service, we are connected
      if (me.isConnected()) {

        characteristic.write(value, function(err, data) {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }

        });

      } else {
        reject();
      }
    });

  }


  /**
   * Subscribe for notification on updates for a characteristic
   *
   *
   *
   *
   * @return {Promise} resolves when the subscription is complete
   */
  subscribe(characteristic) {

    return new Promise(function(resolve, reject) {

      characteristic.subscribe(function(err) {
        if (err) {
          reject(new Error('Failed to subscribe to characteristic'));
        } else {
          resolve();
        }
      });
    });

  }

  /**
   * Unsubscribe from notification on updates for a characteristic
   *
   * @return {Promise} resolves when the unsubscription is complete
   */
  unsubscribe(characteristic) {

    return new Promise(function(resolve, reject) {

      if (characteristic) {

        characteristic.unsubscribe(function(err) {
          if (err) {
            reject(new Error('Failed to unsubscribe characteristic'));
          } else {
            resolve();
          }
        });
      } else {
        console.error("Unknown characterstic");
      }
    });

  }

  onResponse(response) {

  }


  /**
   * Query the characteristics of the connected device
   */
  inspectDevice() {

    var me = this;

    return new Promise(function(resolve, reject) {

      me.productChar = null;
      me.serialChar = null;
      me.faultChar = null;
      me.statusChar = [];
      me.superwatchChar = null;
      me.watcherCb = [];
      //
      // Once the peripheral has been connected, then inspect the
      // services and characteristics

      var serviceUUIDs = [
        me.uuidControllerService,
        // me.uuidLocationService,
        me.uuidUartService,
        me.uuidDeviceInformation,
      ];

      var characteristicUUIDs = [];

      // interrogate the device for the stuff we care about
      // We could also use me.peripheral.discoverServices([ ], function(err, services)
      // Which would just read all without filtering
      //me.peripheral.discoverServices([ ], function(err, services) {

      //me.peripheral.discoverAllServicesAndCharacteristics( function(err, services, characteristics) {

      me.peripheral.discoverSomeServicesAndCharacteristics(
        serviceUUIDs, characteristicUUIDs,
        function(err, services, characteristics) {

          if (err) {
            reject(err);
          } else {

            me.controllerService = _.findWhere(services, { uuid: me.uuidControllerService });
            me.uartService = _.findWhere(services, { uuid: me.uuidUartService });


            // me.commandChar = _.findWhere(characteristics, {uuid: me.uuidCommand });
            // me.responseChar = _.findWhere(characteristics, {uuid: me.uuidResponse });
            me.productChar = _.findWhere(characteristics, { uuid: me.uuidProduct });
            me.serialChar = _.findWhere(characteristics, { uuid: me.uuidSerial });
            me.faultChar = _.findWhere(characteristics, { uuid: me.uuidFault });

            for (let i = 0; i < me.numStatus; i++) {
              me.statusChar[i] = _.findWhere(characteristics, { uuid: me.uuidStatus[i] });
              console.log(`me.statusChar[${i}] = ${me.statusChar[i]}`);

            }

            me.superwatchChar = _.findWhere(characteristics, { uuid: me.uuidSuperwatch });
            console.log("me.superwatchChar", me.superwatchChar);

            me.txCharacteristic = _.findWhere(characteristics, { uuid: me.uuidTx });
            me.rxCharacteristic = _.findWhere(characteristics, { uuid: me.uuidRx });
            me.uartCharacteristic = _.findWhere(characteristics, { uuid: me.uuidUartControl });

            // me.positionChar = _.findWhere(characteristics, {uuid: me.uuidPosition });

            me.systemIdChar = _.findWhere(characteristics, { uuid: me.uuidSystemId });
            me.modelNumberChar = _.findWhere(characteristics, { uuid: me.uuidModelNumber });
            me.dongleSerialNumberChar = _.findWhere(characteristics, { uuid: me.uuidDongleSerialNumber });
            me.firmwareRevisionChar = _.findWhere(characteristics, { uuid: me.uuidFirmwareRevision });
            me.hardwareRevisionChar = _.findWhere(characteristics, { uuid: me.uuidHardwareRevision });
            me.softwareRevisionChar = _.findWhere(characteristics, { uuid: me.uuidSoftwareRevision });
            me.manufacturerNameChar = _.findWhere(characteristics, { uuid: me.uuidManufacturerName });


            // Make sure the device has all the expected characteristics
            if (
              me.controllerService &&
              me.productChar &&
              me.serialChar &&
              me.faultChar &&
              me.txCharacteristic &&
              me.rxCharacteristic &&
              me.uartCharacteristic
            ) {

              // read the characteristics
              me.readCharacteristic(me.productChar)
              .then(function(product) {

                me.deviceType = product.toString();
              })
              .then(function() { return me.readCharacteristic(me.serialChar); })
              .then(function(serial) {
                me.serial = serial.toString();
              })
              .then(function() { return me.readCharacteristic(me.faultChar); })
              .then(function(fault) {
                me.fault = fault;
              })
              .then(function() {

                // Catch emitted events from this controller
                for (let i = 0; i < me.numStatus; i++) {
                  if (me.statusChar[i]) {
                    me.watcherCb[i] = null;
                    // me.statusChar[i].on('data', me.emit.bind(me, 'status', i ));
                    me.statusChar[i].on('data', me.onStatus.bind(me, i));
                    // me.subscribe( me.statusChar[i] );


                  }
                }

                // me.statusChar.on('data', me.emit.bind(me, 'status'));
                // me.status2Char.on('data', me.emit.bind(me, 'status2'));
                // me.status3Char.on('data', me.emit.bind(me, 'status3'));
                // me.status4Char.on('data', me.emit.bind(me, 'status4'));
                // me.status5Char.on('data', me.emit.bind(me, 'status5'));
                me.faultChar.on('data', me.emit.bind(me, 'fault'));

                // This is what sends received data to the modbus master
                // for processing
                me.rxCharacteristic.on('data', me.emit.bind(me, 'data'));

                // me.responseChar.on('data', me.onResponse.bind(me));

              })
              // .then( function() { return me.subscribe( me.responseChar ); })
              .then(function() { return me.subscribe(me.faultChar); })
              // .then( function() { return me.subscribe( me.statusChar ); })
              // .then( function() { return me.subscribe( me.status2Char ); })
              // .then( function() { return me.subscribe( me.status3Char ); })
              // .then( function() { return me.subscribe( me.status4Char ); })
              // .then( function() { return me.subscribe( me.status5Char ); })
              .then(function() { return me.subscribe(me.uartCharacteristic); })
              .then(function() { return me.subscribe(me.rxCharacteristic); })

              .then(function() {
                resolve();
              })

              .catch(function(err) {

                reject(err);
              });


            } else {
              reject(new Error('Device services/characteristics are not compatible'));
            }
          }

        });
    });

  }

  /**
   * Write a new cloud service access key to the dongle
   *
   * @param      {string}   key     The new key
   * @return     {Promise}  Resolves when complete
   */
  async writeAccessKey(key) {

    let buf = Buffer(OBJECT_INFO_SIZE).full(0xFF);

    await this.writeObject(this.id, OBJECT_INFO, buf);

  }

  /**
   * Read the cloud access key from the dongle
   *
   * @return     {Promise}  resolves with the key when complete
   */
  async readAccessKey() {

    let buf = await this.readObject(this.id, OBJECT_INFO);

    return buf;

  }

  onStatus(slot, data) {

    //console.log('onStatus', slot, data, this.watcherCb[slot]);

    if (slot < this.numStatus && 'function' === typeof(this.watcherCb[slot])) {
      this.watcherCb[slot](data, slot);
    }
  }

  readDongleInfo() {

    let me = this;

    return Promise.all([
        me.readCharacteristic(me.systemIdChar),
        me.readCharacteristic(me.modelNumberChar),
        me.readCharacteristic(me.dongleSerialNumberChar),
        me.readCharacteristic(me.firmwareRevisionChar),
        me.readCharacteristic(me.hardwareRevisionChar),
        me.readCharacteristic(me.softwareRevisionChar),
        me.readCharacteristic(me.manufacturerNameChar),
      ])
    .then(function(results) {

      return {
        systemId: results[0],
        modelNumber: results[1].toString(),
        serialNumber: results[2].toString(),
        firmwareRevision: results[3].toString(),
        hardwareRevision: results[4].toString(),
        softwareRevision: results[5].toString(),
        manufacturerName: results[6].toString(),
      }
    });

  }

  /**
   * Write data to the transparent UART characteristic
   * This function signature is compatible with the cs-modbus library
   */
  write(data) {

    var me = this;

    if (me.txCharacteristic) {

      var writes = [];

      var index = 0;
      var chunkSize = 20;

      while (index < data.length) {
        var bytes = Math.min(data.length - index, chunkSize);
        var chunk = data.slice(index, index + chunkSize);

        writes.push(me.writeCharacteristic(me.txCharacteristic, chunk));
        index += chunkSize;
      }

      Promise.all(writes)
      .then(function() {

        //resolve( result);
      })
      .catch(function() {

        //reject( err );
      });

    }

  }



  /**
   * Attempt to connect to the device
   *
   * If a bluetooth connection is established, the device is inspected
   * and its type, serial number, and memory map are determined.
   *
   * @return {[Promise]} resolves when the device is connected
   */
  connect() {


    var me = this;

    return new Promise(function(resolve, reject) {

      // Make a bluetooth connection to the device
      me.peripheral.connect(function(err) {

        if (err) {
          reject(err);
        } else {

          // interrogate the device type, etc and register for events
          me.inspectDevice()
          .then(function() {

            if (me.deviceType) {
              me.connected = true;
              me.emit('open');
              resolve();
            } else {
              reject(new Error('Unknown Device Type'));
            }
          })
          .catch(function(err) {
            reject(err);
          });

        }
      });
    });

  };

  /**
   * Disconnects from the peripheral
   *
   * @return {[type]} [description]
   */
  disconnect() {

    var me = this;

    return new Promise(function(resolve, reject) {

      me.peripheral.disconnect(function(err) {

        me.rxCharacteristic = null;
        me.txCharacteristic = null;
        me.deviceType = null;
        me.peripheral = null;
        me.controllerService = null;
        me.connected = false;

        if (err) {
          reject(err);
        } else {

          me.emit('disconnected');

          resolve();
        }
      });

    });

  }



  sendNextCommand() {

    var me = this;

    if (me.commandQueue.length > 0) {

      var command = me.commandQueue[0];

      if (0) {
        console.log('send cmd: ', command);
      }

      // Emit what is being sent (probably mostly for diagnostics)
      me.emit('sendCommand', command.command);

      me.writeCharacteristic(me.commandChar, command.command, function(err) {

        if (err) {
          command.callback(err);
          me.commandQueue.shift();
          setImmediate(me.sendNextCommand());

        } else {

          //if( me.queue[0].response ) {
          // wait for a response
          command.responseTimer = setTimeout(me.handleResponseTimeout.bind(this), command.options.timeout);
          //}
          //else {
          //  me.queue[0].callback( null, null );
          //  me.queue.shift();
          //  setImmediate( me.sendNextCommand.bind(me) );
          //}

        }

      });
    }
  }


  handleResponseTimeout(timer) {

    var me = this;

    if (me.commandQueue.length > 0) {

      var command = me.commandQueue[0];

      if (command.responseTimer === timer) {
        // the command timed out, fail it
        command.callback(new Error('Timeout'));

        me.commandQueue.shift();
        me.sendNextCommand();
      }

    }

  }


  /**
   * Sends a command to the controller, using the command/response characteristics
   *
   * The command is queued and is read as soon as earlier commands are completed.
   * A device command consists of 4 bytes (sequence, function, addrHi, addrLow)
   * followed by up to 16 bytes of data
   *
   * @param  {[type]}   command  [description]
   * @param  {[type]}   data     [description]
   * @param  {Function} callback [description]
   * @param  {[type]}   options  [description]
   * @return {[type]}            [description]
   */
  __command(command, callback, options) {

    var me = this;

    options = options || {};
    options.timeout = options.timeout || me.options.defaultTimeout;

    me.commandQueue.push({
      command: command,
      sequence: me.commandSequence,
      responseTimer: null,
      options: options,
      callback: callback
    });

    // increment the sequence number to help us match the response from the device
    // with the command we sent
    me.commandSequence = (me.commandSequence + 1) & 0xFF;

    if (me.commandQueue.length === 1) {
      // try to start the command
      me.sendNextCommand();
    }

  }


}

/**
 * Exports
 *
 * @ignore
 */
module.exports = {
  Dongle: Dongle,
  serviceId: SERVICE_ID
};
