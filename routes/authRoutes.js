const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/miniapp', authController.authenticateUser);

module.exports = router;