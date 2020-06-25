/**
 * Defines a class that represents a Motor Controller, connected via a Dongle
 *
 * @class      MotorController (name)
 */





 module.exports = class MotorController {

  constructor( id, connection ) {

    this.connection = connection;
    this.id = id;

  }



  /**
   * Sends the read memory command to the remote device
   *
   * @param      {<type>}   address  address to read from
   * @param      {<type>}   length   bytes to read
   * @return     {Promise}  Resolves when complete
   */
  readMemory( address, length ) {

    return this.connection.readMemory( this.id, address, length );

  }

  /**
   * Sends the write memory command to the remote device
   *
   * @param      {number}   address  address to write to
   * @param.     {Buffer}   values to write
   * @return     {Promise}  Resolves when complete
   */
  writeMemory( address, values ) {

    return this.connection.writeMemory( this.id, address, values );

  }

};
