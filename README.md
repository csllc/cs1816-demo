# CS1816 BLE Dongle Demo

This package demonstrates the use of the Control Solutions BLE dongle to interface to motor controllers.  It implements a central device which identifies, connects to, and inspects a compatible BLE peripheral, and communicates with the connected motor controller for the purpose of status monitoring and configuration.

The Bluetooth-related functions are handled by the third party Noble library (https://www.npmjs.com/package/noble).  This library supports many desktop-like platforms such as Windows, OSX, and Linux (eg raspberry Pi).  For a mobile application it will be necessary to replace the bluetooth functions with a native component suitable for the mobile device(s).

The sample code begins by searching for Bluetooth peripherals that advertise the correct service UUID.  It connects to the first one it finds.  In a 'real' application there could be more than one peripheral discovered and the user should be involved in choosing the one he or she wants to use.

Once connected, standard identifying characteristics are read from the peripheral.  Among these are the model number of the dongle.  It is recommended that the  model number be used to confirm compatibility with the application, since dongles with different model numbers might have different features or capabilities.

The './lib/Dongle' class defines the various BLE characteristics used by the dongle, and is used to communicate with a specific dongle.  In addition to the BLE characteristics, the dongle supports a 'Transparent UART' (T-UART) function, which provides a streaming bi-directional data pipe to the peripheral.

The messaging protocol used on the T-UART is provided by the cs-modbus library.  This library has a number of features and modes beyond what is being used by the BLE demo.  For our purposes it provides:
* Creation of message packets (function code + data).  The typical function codes are fully described in Control Solutions document DOC0003824A; the ones shown here are the 'Read', 'Write', and 'Command' function codes.
* Wrapping of the message in a suitable transport to allow framing and addressing of the packet.  The 
* Timeout and optional retry of failed messages.

Messages sent via the T-UART are always initiated by the central device.  The peripheral only responds to messages.  Notifications from the dongle (asynchronous event notifications) are handled through the 'watch' function described below; not via the T-UART. 

The transport includes a node ID, which reflectes the target of the message.  In the current demo, there are only two IDs: 254, which is the dongle itself, and 1, which is the Motor Controller connected via I2C.  In the future it is possible that multiple motor controllers will be connected to a single dongle (eg via CANBUS).  In this case, the dongle will need an interface for identifying the connected devices by their ID, and the transport's node ID will be used to target messages to specific controllers.

Currently, the dongle (ID 254) does not implement the Read/Write function codes. It only uses the Command function code.  The supported commands (OP codes) are:
    * OP_CONFIGURE: Does not do anything currently except report success; for certain dongles in the future (eg CANBUS) there will be necessary configuration such as the CANBUS baud rate)
    * OP_KEYSWITCH: Controls the UC_POWER line on the Dongle (for some controllers, the Keyswitch turns them on and off). 
    * OP_WATCH: Sets up a 'watch' - in other words, the dongle monitors its connected controller by reading specific status register(s).  If a change is detected, a BLE notification is sent to the central device.  Since only changed values are reported, the benefit of a 'watch'-ed variable is that it does not require polling over the BLE link. 
    * OP_UNWATCH: Cancels a previously configure Watch
    * OP_UNWATCH_ALL: Cancels all configured Watches.
Note that when the BLE and central device disconnect, all watches are dropped.  So, if you reconnect, you will have to re-configure any watches that you care about.

The Motor Controller (ID 1) mainly uses Read/Write commands, though the Command function code is also used in certain cases.
The Read/Write function codes use a 16-bit address.  The first byte is the 'page' or 'bank', and the second byte of the address is the offset in the page.  For example, page 3 is the EEPROM of the CS1108 motor controller.  Address 0x0300 refers to the first byte of EEPROM.

The ./lib/MotorController class represents a specific motor controller.  It is separate from the Dongle class, because in the future there can/will be multiple MotorController instances for a single Dongle instance.

## Installing the Demo

You must use a version of NodeJS that is supported by the Noble library.  At this time, I used NodeJS 8.x.  

Clone the repository:
`git clone https://github.com/csllc/cs1816-demo.git`
`cd cs1816-demo`

Install the dependencies:
`npm install`

Run the demo (it will not do much unless there is a CS1814 nearby)
`node demo`



