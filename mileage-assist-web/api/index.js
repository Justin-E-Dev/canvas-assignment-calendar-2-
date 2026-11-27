'use strict';
// Single Vercel Function; vercel.json routes /api/*, /login, /logout and /webauthn/* here.
const { handle } = require('../lib/routes');

module.exports = (req, res) => handle(req, res);
