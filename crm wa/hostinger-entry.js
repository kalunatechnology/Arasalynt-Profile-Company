'use strict';

// Must load before bootstrap/server so OpenLiteSpeed's reverse-port-binding
// receives exactly one real listen() call.
require('./hostinger-listen-guard');

module.exports = require('./bootstrap');
