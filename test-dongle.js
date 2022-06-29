/**
 * Scan for the first dongle found, and run a bunch of tests
 * on it
 *
 */

// Include the BLE package to interface to bluetooth hardware
// The noble library throws an exception if there is no compatible bluetooth adapter found.
// this is a workaround as suggested by https://github.com/sandeepmistry/noble/issues/570
var ble;
try {
  ble = require('@abandonware/noble');
} catch (err) {

  console.error('Not compatible with this BLE hardware', err);
  process.exit(1);
  ble = {
    on: (function() {}),
    once: (function() {})
  };
}

// the instance of the dongle communication object
var dongle;

// An object type that represents the remote (periperal) Bluetooth device
const { Dongle, serviceId } = require('./lib/Dongle');

// For pretty printing
const chalk = require('chalk');
const error = chalk.bold.red;
const label = chalk.blue;


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
 * Read and write to the flash page
 *
 * This is potentially destructive to the flash page
 * We try to put back the original values, but if the
 * write fails, we may not be able to
 *
 * @return     {Promise}  { description_of_the_return_value }
 */
async function testFlashPage() {

  let result;


  // Now let's demonstrate reading and writing the dongle's flash page
  console.log(label('Reading Dongle Flash page'));

  console.time('Read flash page');
  let original = await dongle.readObject(dongle.id, 0);
  console.timeEnd('Read flash page');

  console.log('Dongle flash page: ');
  printData(0x0000, original);

  let page = Buffer.alloc(128).fill(0);

  console.time('Write flash page');
  result = await dongle.writeObject(dongle.id, 0, page)
  console.timeEnd('Write flash page');

  console.log('Page successfully written');

  console.time('Read flash page');
  result = await dongle.readObject(dongle.id, 0);
  console.timeEnd('Read flash page');

  console.log('Should be zeros: ');
  printData(0x0000, result);

  page = Buffer.alloc(128).fill(0x55);

  console.time('Write flash page');
  result = await dongle.writeObject(dongle.id, 0, page)
  console.timeEnd('Write flash page');

  console.log('Page successfully written');

  console.time('Read flash page');
  result = await dongle.readObject(dongle.id, 0);
  console.timeEnd('Read flash page');

  console.log('Should be 0x55s: ');
  printData(0x0000, result);

  console.time('Write flash page');
  result = await dongle.writeObject(dongle.id, 0, original)
  console.timeEnd('Write flash page');

  console.log('Page successfully written');

  console.time('Read flash page');
  result = await dongle.readObject(dongle.id, 0);
  console.timeEnd('Read flash page');

  console.log('Should be the original page ');
  printData(0x0000, result);

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
          dongle.configure()

          .then(() => testFlashPage())

          .then(() => {
            console.log(label('Success!'));
            process.exit(0);
          })

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
