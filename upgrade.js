#!/usr/bin/env node

/**
 * Loads firmware into the device using the BLE interface
 *
 * Use -h option for help
 *
 * In order to run this example you need to have run
 * npm install.
 *
 *
 */
// Include the BLE package to interface to bluetooth hardware
// The noble library throws an exception if there is no compatible bluetooth adapter found.
// this is a workaround as suggested by https://github.com/sandeepmistry/noble/issues/570
var ble;
try {
  ble = require('noble');
} catch (err) {

  console.error('Not compatible with this BLE hardware', err);
  process.exit(1);
  ble = {
    on: (function() {}),
    once: (function() {})
  };
}


// get application path
var path = require('path');

// misc utilities
var util = require('util');

// console text formatting
var chalk = require('chalk');
const error = chalk.bold.red;
const label = chalk.blue;

// progress bar utility
const _cliProgress = require('cli-progress');

// command-line options will be available in the args variable
var args = require('minimist')(process.argv.slice(2));

// An object type that represents the remote (periperal) Bluetooth device
const { Dongle, serviceId } = require('./lib/Dongle');

const Bootloader = require('@csllc/mb-loader');

const APP_NAME = path.basename(__filename, '.js');

const DONGLE_ID = 254;

// Command line arguments
let filename;
let mac;



let masterConfig = {
  "transport": {
    "type": "rtu",
    "eofTimeout": 40,
    "connection": {
      "type": "serial",
    }
  },
  "suppressTransactionErrors": true,
  "retryOnException": false,
  "maxConcurrentRequests": 1,
  "defaultUnit": 1,
  "defaultMaxRetries": 0,
  "defaultTimeout": 500
};

// handy function to update a single line showing progress
function printProgress(progress) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(progress.toFixed(0) + '%');
}

// If -h option, print help
if (args.h) {

  console.info('\r------------------');
  console.info('Bootloader Utility\r');
  console.info('\rCommand format:\r');
  console.info(APP_NAME +
    ' [-h -v] filename \r');

  console.info(chalk.underline('\rOptions\r'));
  console.info('    -h           This help output\r');
  console.info('    -v           Verbose output (for debugging)\r');
  console.info('    --port       MAC address of device to be updated\r');

  console.info(chalk.underline('\rResult\r'));
  console.info('Return value is 0 if successful\r');
  console.info(chalk.underline('Examples\r'));

  console.info(APP_NAME + ' --port=34:81:f4:51:ac:8a upgrade.hex \r');

  process.exit(0);
}

function parseArguments() {


  // Parse the arguments
  filename = args._[0] || '../dist/ble_dongle.X.production.hex';
  mac = /^[a-fA-F0-9:]{17}|[a-fA-F0-9]{12}$/.exec(args.port);

  if (Array.isArray(mac)) {
    mac = mac[0];
  } else {
    console.error(error('Invalid MAC address provided with --port option'));
    process.exit(1);
  }

}
parseArguments();


// Perform the firmware update
// assumes the dongle is connected and ready to start receiving bootloader commands
function update(dongle, file) {

  const bl = new Bootloader(dongle.master);

  let latestPercent = 0;
  let latestMsg = '';

  // define how we interact with the target
  let target = new bl.BootloaderTarget.Target({

    name: 'CS1816',
    supportsPassThru: false,
    code: 'any',
    type: '',

    enquireTimeout: 5000,
    selectTimeout: 5000,
    eraseTimeout: 5000,
    dataTimeout: 5000,
    verifyTimeout: 5000,
    finishTimeout: 5000,

  }, [
    // PIC18 COMM processor application
    new bl.BootloaderTarget.PIC18Application({
      hexBlock: 64,
      sendBlock: 64,
    }),

  ]);

  // Set up the bootloader config accordingly
  let config = {
    target: target,
    space: 0,
    unit: DONGLE_ID,
  };

  if (!args.v && !args.q) {
    // create a new progress bar instance and use shades_classic theme
    bar = new _cliProgress.Bar({
      format: '[{bar}] {percentage}% | ETA: {eta} {msg}',
      //clearOnComplete: true,
      etaBuffer: 30,
    }, _cliProgress.Presets.shades_classic);

    // start the progress bar
    bar.start(100, 0);

    // Catch progress counter
    bl.on('progress', function(percent) {

      latestPercent = percent;
      bar.update(latestPercent, {
        msg: latestMsg
      });

    });

    // Catch progress counter
    bl.on('status', function(status) {

      latestMsg = status;
      bar.update(latestPercent, {
        msg: latestMsg
      });
    });

  } else {
    // stub out the progress bar so it doesn't show
    bar = {
      update: function() {},
      stop: function() {}
    };
  }

  // If verbose, catch events from the bootloader and display them
  if (args.v) {
    // catch status message from bootloader for display
    bl.on('status', function(status) {
      console.log(status);
    });

    // Hook events for logging if verbose mode

    var connection = master.getConnection();

    connection.on('open', function() {
      console.log('[connection#open  ]');
    });

    connection.on('close', function() {
      console.log('[connection#close]');
    });

    connection.on('error', function(err) {
      console.log('Error: ', '[connection#error] ' + err.message);
    });

    connection.on('write', function(data) {
      console.log('[TX] ' + data.length, util.inspect(data));
    });

    connection.on('data', function(data) {
      if (data.dst !== 255) {
        console.log('[RX] ' + data.length, util.inspect(data));
      }
    });

    var transport = master.getTransport();

    // catch event when a transaction starts.  Hook the events for logging
    transport.on('request', function(transaction) {

      transaction.once('timeout', function() {
        console.log('[timeout]');
      });

      transaction.once('error', function(err) {
        console.log('[error] %s', err.message);
      });

      transaction.once('response', function(response) {
        if (response.isException()) {
          console.log('[response] ', response.toString());
        } else {
          console.log(response.toString());
        }
      });

      transaction.once('complete', function(err, response) {
        if (err) {
          console.log('[complete] ', err.message);
        } else {
          console.log('[complete] %s', response);
        }

      });

      transaction.once('cancel', function() {
        console.log('[cancel]');
      });


      console.log(transaction.getRequest().toString());
    });

  }

  // start trying to load the file
  bl.start(filename, config)
    .then(function() {

      bar.stop();
      if (!args.q) {
        console.log(chalk.green('Success!'));
      }

      process.exit(0);
    })
    .catch(function(err) {
      bar.stop();


      exit(1, err);

    });

}

// Wait for the bluetooth hardware to become ready
ble.once('stateChange', function(state) {

  if (state === 'poweredOff') {
    console.error(error('Bluetooth must be turned on before you run this example'));
    process.exit(1);
  } else if (state === 'poweredOn') {

    // Catch any 'discover' events which are emitted when a new dongle is detected
    ble.on('discover', function(peripheral) {

      // Check for the list ports option
      if (args.l) {

        console.log(label('Found ') + peripheral.advertisement.localName, label('MAC: ') + peripheral.address);
      } else {
        if (peripheral.address.toUpperCase() === mac.toUpperCase()) {

          ble.stopScanning();

          console.log(label('Connecting... '));

          // Create an object to manage the discovered peripheral
          var dongle = new Dongle(peripheral, {
            verbose: false,
          });


          dongle.on('status', function(slot, status) {
            console.log('STATUS: ', slot, status);
          });

          dongle.connect()
            .then(() => dongle.readDongleInfo())

            .then(info => {
              console.log(label('Connected.'));

              console.log(label('Dongle'));
              console.log(label('    Model.       :'), info.modelNumber);
              console.log(label('    Serial Number:'), info.serialNumber);
              console.log(label('    Fw Revision  :'), info.firmwareRevision);
              console.log(label('    Hw Revision  :'), info.hardwareRevision);
              console.log(label('    Sw Revision  :'), info.softwareRevision);
              console.log(label('    Manufacturer :'), info.manufacturerName);

              // do the update
              return update(dongle, filename);
            })

            .catch(err => {
              console.error(error('Error connecting to the dongle:'), err);
              process.exit(2);
            });
        } else {
          console.log(label('Found ') + peripheral.advertisement.localName, label('MAC: ') + peripheral.address + ' but looking for ' + mac);


        }
      }
    });

    // Capture the event that is emitted when bluetooth goes into scanning mode
    ble.on('scanStart', () => console.log(label('Scanning...')));

    // Last, put the bluetooth hardware into scan mode - which will cause
    // 'discover' events for each detected dongle.
    ble.startScanning([serviceId]);

  }

});

/*
else {

  parseArguments()
    .then(function() {

      let options = {
        baudRate: baud,
        autoOpen: false,
      };

      // Open the serial port we are going to use
      let port = new SerialPort(
        portName,
        options);

      // Make serial port instance available for the modbus master
      masterConfig.transport.connection.serialPort = port;

      createMaster();

      // port errors
      port.on('error', function(err) {
        console.error(chalk.underline.bold(err.message));
      });

      // Open the port
      // the 'open' event is triggered when complete
      if (args.v) {
        console.log('Opening ' + portName);
      }

      port.open(function(err) {
        if (err) {
          console.log(err);
          process.exit(1);
        }
      });
    })
    .catch(function(err) {
      console.error(chalk.red(err.message));
      process.exit(1);
    });


}


function createMaster() {

  // Create the MODBUS master
  master = Modbus.createMaster(masterConfig);


  // Attach event handler for the port opening
  master.once('connected', function() {

    // Start communicating with the bootloader
    const bl = new Bootloader(master);

    // Set up the bootloader config accordingly
    let target = new bl.BootloaderTarget.DefaultPic18Target();
    let config = {
      target: target,
      space: 0
    };

    // If verbose, catch events from the bootloader and display them
    if (args.v) {
      // catch status message from bootloader for display
      bl.on('status', function(status) {
        console.log(status);
      });

      // Catch progress counter
      bl.on('progress', function(percent) {
        printProgress(percent);
      });

    }

    // start trying to load the file
    bl.start(filename, config)
      .then(function() {

        if (args.v) {
          console.log(chalk.green('Success!'));
        }
        process.exit(0);
      })
      .catch(function(err) {
        if (args.v) {
          console.error(err.message);
        }
        process.exit(1);
      });

  });


  // Hook events for logging if verbose mode
  if (args.v) {

    var connection = master.getConnection();

    connection.on('open', function() {
      console.log('[connection#open  ]');
    });

    connection.on('close', function() {
      console.log('[connection#close]');
    });

    connection.on('error', function(err) {
      console.log('Error: ', '[connection#error] ' + err.message);
    });

    connection.on('write', function(data) {
      console.log('[TX] ', util.inspect(data));
    });

    connection.on('data', function(data) {
      console.log('[RX] ', util.inspect(data));
    });

    var transport = master.getTransport();

    // catch event when a transaction starts.  Hook the events for logging
    transport.on('request', function(transaction) {

      transaction.once('timeout', function() {
        console.log('[timeout]');
      });

      transaction.once('error', function(err) {
        console.log('[error] %s', err.message);
      });

      transaction.once('response', function(response) {
        if (response.isException()) {
          console.log('[response] ', response.toString());
        } else {
          console.log(response.toString());
        }
      });

      transaction.once('complete', function(err, response) {
        if (err) {
          console.log('[complete] ', err.message);
        } else {
          console.log('[complete] %s', response);
        }

      });

      transaction.once('cancel', function() {
        console.log('[cancel]');
      });


      console.log(transaction.getRequest().toString());
    });

  }
}

*/