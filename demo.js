/**
 * Scan for the first controller found, and inspect it, then monitor status changes
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

// An object type that represents the remote (periperal) Bluetooth device
const { Dongle, serviceId } = require('./lib/Dongle');

// An object type that represents a single motor controller device
const MotorController = require('./lib/MotorController');

// command-line options will be available in the args variable
let args = require('minimist')(process.argv.slice(2));

// For pretty printing
const chalk = require('chalk');
const error = chalk.bold.red;
const label = chalk.blue;

// For certain types of dongles, there can be more than one controller
// connected to them (eg when using CANBUS).  For now, we just
// deal with one controller, using the ID defined here
const CONTROLLER_ID = 1;

let dongleConfig = parseCommandLine();

// returns a string with prepended zeros to the requested length
function zeroPad(number, length) {
  var pad = new Array(length + 1).join('0');
  return (pad + number).slice(-pad.length);
}


// Prints a nicely formatted Buffer of data
function printData(address, buf) {

  const lineLen = 16;
  let displayIndex = Math.floor(address / lineLen) * lineLen;
  let offset = address % lineLen;
  let index = 0;
  let str;

  str = (chalk.green(zeroPad(displayIndex.toString(16), 4) + ': '));
  while (offset > 0) {
    str += ('   ');
    offset--;
    displayIndex++;
  }

  while (index < buf.length) {

    str += (' ' + zeroPad(buf[index].toString(16), 2));
    index++;
    displayIndex++;

    if ((displayIndex) % lineLen === 0 || index === buf.length) {
      console.log(str);
      str = (chalk.green(zeroPad(displayIndex.toString(16), 4) + ': '));
    }

  }

}

if (args.h || args.help) {

  console.info('\r-------- CS1816 ----------');
  console.info('Demo Utility Version ' + require('./package.json').version + '\r');
  console.info('\rCommand format:\r');
  console.info(require('path').basename(__filename, '.js') +
    ' <options> \r');

  console.info(chalk.underline('\rOptions\r'));
  console.info('    -h           This help output\r');
  console.info('    --mode       Operating mode [i2c|can]\r');

  console.info('    --mode       Operating mode [i2c|can]\r');
  console.info(chalk.bold('For --mode=can'));
  console.info('    --canrate    Bus speed [250000|500000|1000000]\r');

  process.exit(0);
}

// parse the command line arguments and set up the dongle configuration
// returns an object suitable for sending to the dongle.configuration method
function parseCommandLine() {

  let result = {};

  switch (args.mode) {
    case 'can':
      result.mode = 'can';
      result.modeOptions = {
        baud: args.canrate || 500000,
        myId: args.myid || 0xFE
      };
      break;

    case 'boot':
      result.mode = 'boot';
      break;

    case 'i2c':
    default:
      result.mode = 'i2c';
      break;

  }

  return result;
}

// Connect, configure, and get relevant info from the dongle
async function connect(dongle) {

  await dongle.connect();

  let info = await dongle.readDongleInfo();

  console.log(label('Connected.'));

  console.log(label('Dongle'));
  console.log(label('    Model.       :'), info.modelNumber);
  console.log(label('    Serial Number:'), info.serialNumber);
  console.log(label('    Fw Revision  :'), info.firmwareRevision);
  console.log(label('    Hw Revision  :'), info.hardwareRevision);
  console.log(label('    Sw Revision  :'), info.softwareRevision);
  console.log(label('    Manufacturer :'), info.manufacturerName);

  // The model number of the dongle determines what it is capable of
  // We only deal with one dongle model so far
  if ('CS1816' === info.modelNumber) {

    // Send configuration to the dongle
    console.log(label('Configuring... '));
    await dongle.configure(dongleConfig);

    // Turn power on to the controller
    await dongle.keyswitch(true);

    // retrieve our cloud access key
    //let cloudAccessKey = await dongle.readAccessKey();

  } else {
    console.error(error('Unknown Dongle Model: '), info.modelNumber);
    dongle.disconnect();
    process.exit(3);
  }
}

/**
 * Set up watchers for the CS1108 controller
 *
 * @param      {<type>}   dongle  The dongle
 * @return     {Promise}  { description_of_the_return_value }
 */
async function setCs1108Watchers(dongle) {

  console.log(label('Initializing watchers'));

  await dongle.unwatchAll();

  // Watcher slot 0 looks for changes in the Charge Mode RAM variable
  // You'll get a callback with the current value, and then another
  // callback whenever the value changes
  await dongle.watch(0, CONTROLLER_ID, 0x005F, (value) => {
    console.log(label('Charge Mode: '), value);

    // If you just wanted to read something once, you wouldn't do this
    // (set a watcher and then cancel it).  You'd use readMemory

    // This is just here to show how to stop watching a variable
    dongle.unwatch(0);
  });

  // Watcher slot 1 looks for changes in the Fault Code RAM variable
  await dongle.watch(1, CONTROLLER_ID, 0x0038, (value) => {
    console.log(label('Fault Code: '), value);
  });

  // Watcher slot 2 looks for changes in the 16-bit voltage reading
  await dongle.watch(2, CONTROLLER_ID, 0x0064, 2, (value) => {
    console.log(label('Voltage: '), value);
  });

  // Watcher slot 3 looks for changes in the PWM status
  await dongle.watch(3, CONTROLLER_ID, 0x002E, 1, (value) => {
    console.log(label('PWM3: '), value);
  });

  // Put in more watchers, up to the limit
  // await dongle.watch(4, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM4: '), value);
  // });
  // await dongle.watch(5, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM5: '), value);
  // });
  // await dongle.watch(6, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM6: '), value);
  // });
  // await dongle.watch(7, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM7: '), value);
  // });
  // await dongle.watch(8, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM8: '), value);
  // });
  // await dongle.watch(9, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM9: '), value);
  // });

  // Add superwatcher
  // TODO: Only do this if reported dongle version is > some value
  await dongle.superwatch(CONTROLLER_ID, [0x002E, 0x0064, 0x0038], (value) => {
    // TODO: Won't there be two parameters for this callback?
    // One for address (16 bit), other for value?
    console.log(label('SuperWatcher: '), value);
  });

}

/**
 * Shows reading and writing to CS1108 controller memory
 *
 * @class      Cs1108MemoryTest (name)
 * @param      {<type>}   dongle  The dongle
 * @return     {Promise}  { description_of_the_return_value }
 */
async function Cs1108MemoryTest(dongle) {

  // Currently the one and only CS1108 is addressed as device '1'
  let mc = new MotorController(CONTROLLER_ID, dongle);

  // write '1' to bank 3(EEPROM) offset 0x00
  console.log(label('Writing EEPROM address 0'));
  await mc.writeMemory(0x0300, Buffer.from([1]));

  let data;

  console.log(label('Reading Memory... '));
  data = await mc.readMemory(0x0300, 128);
  printData(0x300, data);

  console.log(label('Reading more memory... '));
  data = await mc.readMemory(0x0380, 128);
  printData(0x380, data);

  // This just writes the first byte back to the motor controller
  console.log(label('Writing memory... '));
  await mc.writeMemory(0x0300, Buffer.from([data[0]]));

  console.log(label('Success!'));

}

// Wait for the bluetooth hardware to become ready
ble.once('stateChange', function(state) {

  if (state === 'poweredOff') {
    console.error(error('Bluetooth must be turned on before you run this example'));
    process.exit(1);
  } else if (state === 'poweredOn') {

    let dongleConfig = parseCommandLine();

    // Catch any 'discover' events which are emitted when a new dongle is detected
    ble.on('discover', function(peripheral) {

      // stop after the first found
      ble.stopScanning();

      console.log(label('Found ') + peripheral.advertisement.localName, label('MAC: ') + peripheral.address);

      console.log(label('Connecting... '));

      // Create an object to manage the discovered peripheral
      var dongle = new Dongle(peripheral, {
        verbose: true,
      });


      dongle.on('status', function(slot, status) {
        console.log('STATUS: ', slot, status);
      });

      connect(dongle)
      .then(() => setCs1108Watchers(dongle))

      .then(() => Cs1108MemoryTest(dongle))

      .catch((err) => {
        console.log(err);
        console.error(err.message);
        dongle.disconnect();
        process.exit(1);
      });

    });

    // Capture the event that is emitted when bluetooth goes into scanning mode
    ble.on('scanStart', () => console.log(label('Scanning...')));

    // Capture the event emitted when scan mode ends
    ble.on('scanStop', () => console.log(label('Stopped Scanning')));

    // Last, put the bluetooth hardware into scan mode - which will cause
    // 'discover' events for each detected dongle.
    ble.startScanning([serviceId]);

  }

});
