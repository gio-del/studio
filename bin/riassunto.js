#!/usr/bin/env node
'use strict';
// Stampa il riassunto numerico della settimana scorsa (JSON, solo numeri e nomi di area) per la mail del lunedì.
// Uso: STUDIO_DIR=… node bin/riassunto.js
const { createData } = require('../lib/data');

const dir = process.env.STUDIO_DIR;
if (!dir) { console.error('STUDIO_DIR mancante'); process.exit(2); }
createData(dir).riassunto().then((r) => console.log(JSON.stringify(r)), () => process.exit(1));
