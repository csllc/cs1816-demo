module.exports = class Watcher {

  constructor(slot, id, address, length, cb) {

    // if the length was not supplied, default it to 1
    if ('function' === typeof(length)) {
      cb = length;
      length = 1;
    }

    this.slot = slot;
    this.id = id;
    this.address = address;


    this.length = length;
    this.cb = cb;

  }
};
