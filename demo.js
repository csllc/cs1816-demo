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
}
catch(err)
{
  ble = {
    on: (function() {}),
    once: (function() {})
  };
}

// An object type that represents the remote (periperal) Bluetooth device
const { Dongle, serviceId } = require('./lib/Dongle' );

// An object type that represents a single motor controller device
const MotorController = require('./lib/MotorController' );

// For pretty printing
const chalk = require( 'chalk' );
const error = chalk.bold.red;
const label = chalk.blue;

// For certain types of dongles, there can be more than one controller
// connected to them (eg when using CANBUS).  For now, we just
// deal with one controller, using the ID defined here
const CONTROLLER_ID = 1;

// returns a string with prepended zeros to the requested length
function zeroPad( number, length ) {
  var pad = new Array(length + 1).join( '0' );
  return (pad+number).slice(-pad.length);
}


// Prints a nicely formatted Buffer of data
function printData( address, buf ) {

  const lineLen = 16;
  let displayIndex = Math.floor(address / lineLen) * lineLen;
  let offset = address % lineLen;
  let index = 0;
  let str;

  str = ( chalk.green( zeroPad(displayIndex.toString(16),4) + ': ' ) );
  while( offset > 0 ){
    str += ( '   ' );
    offset--;
    displayIndex++;
  }

  while( index < buf.length ) {

    str +=( ' ' + zeroPad(buf[index].toString(16),2) );
    index++;
    displayIndex++;

    if( (displayIndex) % lineLen === 0 || index === buf.length ) {
      console.log( str );
      str = ( chalk.green( zeroPad(displayIndex.toString(16),4) + ': ' ) );
    }

  }

}


// Wait for the bluetooth hardware to become ready
ble.once( 'stateChange', function(state) {

  if( state === 'poweredOff' ) {
    console.error( error('Bluetooth must be turned on before you run this example'));
    process.exit( 1 );
  }
  else if( state === 'poweredOn' ) {

    // Catch any 'discover' events which are emitted when a new dongle is detected
    ble.on( 'discover', function( peripheral ) {

      // stop after the first found
      ble.stopScanning();

      console.log( label('Found ') + peripheral.advertisement.localName, label('MAC: ') + peripheral.address );

      console.log( label('Connecting... ') );

      // Create an object to manage the discovered peripheral
      var dongle = new Dongle( peripheral, {
        verbose: false,
      } );


      dongle.on('status', function( slot, status ) {
        console.log( 'STATUS: ', slot, status );
      });

      dongle.connect()
      .then( () => dongle.readDongleInfo() )

      .then( info  => {
        console.log( label('Connected.') );

        console.log( label('Dongle' ));
        console.log( label('    Model.       :'), info.modelNumber );
        console.log( label('    Serial Number:') ,info.serialNumber );
        console.log( label('    Fw Revision  :'), info.firmwareRevision );
        console.log( label('    Hw Revision  :'), info.hardwareRevision );
        console.log( label('    Sw Revision  :'), info.softwareRevision );
        console.log( label('    Manufacturer :'), info.manufacturerName );

        // The model number of the dongle determines what it is capable of
        // We only deal with one dongle model so far
        if( 'CS1816' === info.modelNumber ) {

          // an opportunity to send configuration info to the dongle.
          // Right now this is basically not used but will be needed
          // for future iterations; for example to configure the CANBUS
          // data rate.

          console.log( label('Configuring... ') );
          dongle.configure({})

          // Turn power on to the controller
          .then( () => dongle.keyswitch( true ) )

          // Set up the MotorController device instance and watchers
          .then( () => {

            console.log( label('Initializing watchers') );

            // Clear all watchers. This is unnecessary since we just connected,
            // but it's here as a way to demonstrate the function
            dongle.unwatchAll();

            // Watcher slot 0 looks for changes in the Charge Mode RAM variable
            // You'll get a callback with the current value, and then another
            // callback whenever the value changes
            dongle.watch( 0, CONTROLLER_ID, 0x005F, ( value ) =>{
              console.log( label('Charge Mode: '), value );

              // If you just wanted to read something once, you wouldn't do this
              // (set a watcher and then cancel it).  You'd use readMemory

              // This is just here to show how to stop watching a variable
              dongle.unwatch( 0 );
            });

            // Watcher slot 1 looks for changes in the Fault Code RAM variable
            dongle.watch( 1, CONTROLLER_ID, 0x0038, ( value ) =>{
              console.log( label('Fault Code: '), value );
            });

            // Watcher slot 2 looks for changes in the 16-bit voltage reading
            dongle.watch( 2, CONTROLLER_ID, 0x0064, 2, ( value ) =>{
              console.log( label('Voltage: '), value );
            });

            // Watcher slot 3 looks for changes in the PWM status
            dongle.watch( 3, CONTROLLER_ID, 0x002E, 1, ( value ) =>{
              console.log( label('PWM: '), value );
            });


            // Currently the one and only CS1108 is addressed as device '1'
            let mc = new MotorController( CONTROLLER_ID, dongle );

            console.log( label('Writing EEPROM address 0') );

            // write '1' to bank 3(EEPROM) offset 0x00
            mc.writeMemory( 0x0300, Buffer.from([1]) )

            .then( () => console.log( label( 'Reading Memory... ' )) )

            .then( () => mc.readMemory( 0x0300, 128 ))

            .then( (data) => {
              printData( 0x300, data );

              console.log( label('Reading more memory... ') );

              return mc.readMemory( 0x0380, 128 );
            })
            .then( (data) => {
              printData( 0x380, data );

              console.log( label('Writing memory... ') );

              // This just writes the first byte back to the motor controller
              return mc.writeMemory( 0x0300, Buffer.from([data[0]]) );
            })
            .then( () => console.log( label( 'Success!' )) )
            .catch( (err) => {

              console.error( error('Error reading/writing the controller'), err.message );
              // stay active so we can see the watchers

              // dongle.disconnect();
              // process.exit( 1 );

            });


          })
          .catch( (err) => {
            console.error( error('Error communicating with the dongle'), err );
            dongle.disconnect();
            process.exit( 1 );
          })
        }
        else {
          console.error( error('Unknown Dongle Model: '), info.modelNumber );
          dongle.disconnect();
          process.exit( 3 );
        }
      })

      .catch( err => {
        console.error( error('Error connecting to the dongle:'), err );
        process.exit( 2 );
      });
    });

    // Capture the event that is emitted when bluetooth goes into scanning mode
    ble.on( 'scanStart', () => console.log( label('Scanning...') ));

    // Capture the event emitted when scan mode ends
    ble.on( 'scanStop', () => console.log( label('Stopped Scanning')) );

    // Last, put the bluetooth hardware into scan mode - which will cause
    // 'discover' events for each detected dongle.
    ble.startScanning([ serviceId ]);

  }

});
