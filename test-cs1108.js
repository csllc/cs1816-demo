/**
 * Scan for the first dongle found, and run a bunch of repetitive tests
 * on the CS1108 connected to it
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

// For certain types of dongles, there can be more than one controller
// connected to them (eg when using CANBUS).  For now, we just
// deal with one controller, using the ID defined here
const CONTROLLER_ID = 1;


// the instance of the dongle communication object
var dongle;

// An object type that represents the remote (periperal) Bluetooth device
const { Dongle, serviceId } = require('./lib/Dongle');

// An object type that represents a single motor controller device
const MotorController = require('./lib/MotorController');

// An object type that represents a watcher
const Watcher = require('./lib/Watcher');

// For pretty printing
const chalk = require('chalk');
const error = chalk.bold.red;
const label = chalk.blue;

let watchers = [

  new Watcher(0, CONTROLLER_ID, 0x0056, 2, (value) => {
    console.log(label('VBAT: '), value);
  }),

  new Watcher(1, CONTROLLER_ID, 0x0066, 2, (value) => {
    console.log(label('Current: '), value);
  }),

  new Watcher(2, CONTROLLER_ID, 0x0029, (value) => {
    console.log(label('Throt: '), value);
  }),

  new Watcher(3, CONTROLLER_ID, 0x0025, (value) => {
    console.log(label('MscFlg5: '), value);
  }),

  new Watcher(4, CONTROLLER_ID, 113, (value) => {
    console.log(label('RAM 113: '), value);
  }),

  new Watcher(5, CONTROLLER_ID, 39, (value) => {
    console.log(label('RAM 39: '), value);
  }),

  new Watcher(6, CONTROLLER_ID, 98, 2, (value) => {
    console.log(label('RAM 98: '), value);
  }),

  new Watcher(7, CONTROLLER_ID, 96, 2, (value) => {
    console.log(label('RAM 96: '), value);
  }),

  new Watcher(8, CONTROLLER_ID, 42, 2, (value) => {
    console.log(label('RAM 42: '), value);
  }),

  new Watcher(9, CONTROLLER_ID, 46, (value) => {
    console.log(label('RAM 46: '), value);
  }),
];


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


/**
 * Shows reading and writing to CS1108 controller memory
 *
 * @class      Cs1108MemoryTest (name)
 * @param      {<type>}   dongle  The dongle
 * @return     {Promise}  { description_of_the_return_value }
 */
async function Cs1108MemoryTest() {

  // Currently the one and only CS1108 is addressed as device '1'
  let mc = new MotorController(CONTROLLER_ID, dongle);

  let data1, data2;

  console.log(label('Reading EEPROM as separate transactions '));
  console.time('Read Controller EEPROM');
  data1 = await mc.readMemory(0x0300, 128);
  data2 = await mc.readMemory(0x0380, 128);
  console.timeEnd('Read Controller EEPROM');

  printData(0x300, data1);
  printData(0x380, data2);

  // // This just writes the first byte back to the motor controller
  // console.log(label('Writing memory... '));
  // await mc.writeMemory(0x0300, Buffer.from([data[0]]));


  console.log(label('Reading EEPROM in 2 concurrent transactions... '));
  console.time('Read Controller EEPROM');
  [data1, data2] = await Promise.all([
    mc.readMemory(0x0300, 128),
    mc.readMemory(0x0380, 128),
  ]);
  console.timeEnd('Read Controller EEPROM');

  printData(0x300, data1);
  printData(0x380, data2);


  console.time('Read RAM consecutive');
  let mem1 = [];
  for (i = 0; i < 64; i++) {

    let byte = await mc.readMemory(i, 1);
    mem1.push(byte[0]);

  }
  console.timeEnd('Read RAM consecutive');
  printData(0x000, mem1);

  let mem2 = [];
  let todo = [];
  for (i = 0; i < 64; i++) {
    todo.push(mc.readMemory(i, 1));
  }
  console.time('Read RAM concurrent');
  mem2 = await Promise.all(todo);
  console.timeEnd('Read RAM concurrent');
  printData(0x000, mem2.map((e) => e[0]));


}

async function testReadControllerMemory() {

  let result;
  // Currently the one and only CS1108 is addressed as device '1'
  let mc = new MotorController(CONTROLLER_ID, dongle);

  while (1) {
    console.time('Read Controller RAM');
    result = await mc.readMemory(0x0000, 1);
    console.timeEnd('Read Controller RAM');
    console.log('Value: ', result);
  }

}


/**
 * Set up watchers for the CS1108 controller
 *
 * @param      {<type>}   dongle  The dongle
 * @return     {Promise}  { description_of_the_return_value }
 */
async function setCs1108Watchers() {

  console.log(label('Initializing watchers'));

  await dongle.unwatchAll();

  watchers.forEach(async function(watcher) {

    await dongle.setWatchers(watcher);

  });



  // // Watcher slot 0 looks for changes in the Charge Mode RAM variable
  // // You'll get a callback with the current value, and then another
  // // callback whenever the value changes
  // await dongle.watch(0, CONTROLLER_ID, 0x005F, (value) => {
  //   console.log(label('Charge Mode: '), value);

  //   // If you just wanted to read something once, you wouldn't do this
  //   // (set a watcher and then cancel it).  You'd use readMemory

  //   // This is just here to show how to stop watching a variable
  //   dongle.unwatch(0);
  // });

  // // Watcher slot 1 looks for changes in the Fault Code RAM variable
  // await dongle.watch(1, CONTROLLER_ID, 0x0038, (value) => {
  //   console.log(label('Fault Code: '), value);
  // });

  // // Watcher slot 2 looks for changes in the 16-bit voltage reading
  // await dongle.watch(2, CONTROLLER_ID, 0x0064, 2, (value) => {
  //   console.log(label('Voltage: '), value);
  // });

  // // Watcher slot 3 looks for changes in the PWM status
  // await dongle.watch(3, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM3: '), value);
  // });

  // // Put in more watchers, up to the limit
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

  // await dongle.watch(10, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM10: '), value);
  // });

  // await dongle.watch(11, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM11: '), value);
  // });

  // await dongle.watch(12, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM12: '), value);
  // });

  // await dongle.watch(13, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM13: '), value);
  // });

  // await dongle.watch(14, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM14: '), value);
  // });

  // await dongle.watch(15, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM15: '), value);
  // });

  // await dongle.watch(16, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM16: '), value);
  // });

  // await dongle.watch(17, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM17: '), value);
  // });

  // await dongle.watch(18, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM18: '), value);
  // });

  // await dongle.watch(19, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM19: '), value);
  // });

  // await dongle.watch(20, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM20: '), value);
  // });

  // await dongle.watch(21, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM21: '), value);
  // });

  // await dongle.watch(22, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM22: '), value);
  // });

  // await dongle.watch(23, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM23: '), value);
  // });

  // await dongle.watch(24, CONTROLLER_ID, 0x002E, 1, (value) => {
  //   console.log(label('PWM24: '), value);
  // });


}

async function clearAllCs1108Watchers() {

  console.log(label('Unwatch all... '));
  await dongle.unwatchAll();

}


async function setAllWatchersInOneGo() {

  console.log(label('Set All Watchers in one go.. '));



  await dongle.setWatchers(watchers);

}


async function clearAllWatchersInOneGo() {
  console.log(label('Clear all watchers in one go '));
  await dongle.clearWatchers(watchers);
}

// Wait for the bluetooth hardware to become ready
ble.once('stateChange', function(state) {

  if (state === 'poweredOff') {
    console.error(error('Bluetooth must be turned on before you run this example'));
    process.exit(1);
  } else if (state === 'poweredOn') {

    // Catch any 'discover' events which are emitted when a new dongle is detected
    ble.on('discover', function(peripheral) {

      // stop after the first found
      ble.stopScanning();

      console.log(label('Found ') + peripheral.advertisement.localName, label('MAC: ') + peripheral.address);

      console.log(label('Connecting... '));

      // Create an object to manage the discovered peripheral
      dongle = new Dongle(peripheral, {
        verbose: true,
      });


      dongle.on('status', function(slot, status) {
        console.log('STATUS: ', slot, status);
      });

      dongle.connect()
      .then(() => dongle.readDongleInfo())

      .then(info => {
        console.log(label('Connected.'));

        // The model number of the dongle determines what it is capable of
        // We only deal with one dongle model so far
        if ('CS1816' === info.modelNumber) {

          // Send configuration to the dongle
          console.log(label('Configuring... '));
          dongle.configure()

            //          .then(() => setCs1108Watchers())


            // .then(() => Cs1108MemoryTest())

            //.then(() => testReadControllerMemory())

            // .then(() => clearAllCs1108Watchers())

          .then(() => setAllWatchersInOneGo())

          // .then(() => clearAllWatchersInOneGo())


          // .then(() => {
          //   console.log(label('Success!'));
          //   process.exit(0);
          // })

          .catch((err) => {
            console.error(error('Error communicating with the dongle'), err);
            dongle.disconnect();
            process.exit(1);
          })
        } else {
          console.error(error('Unknown Dongle Model: '), info.modelNumber);
          dongle.disconnect();
          process.exit(3);
        }
      })

      .catch(err => {
        console.error(error('Error connecting to the dongle:'), err);
        process.exit(2);
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
