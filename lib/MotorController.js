




class MotorController {

  constructor( id, connection ) {

    this.connection = connection;
    this.id = id;


    this.connection.on('status', (values) => {
      console.log('Status: ', values );
    });
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

module.exports = MotorController;