const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateJWT } = require('../utils/utils');
const {validateBgColorMsg, validateNameColor, validateProfileBg} = require('../utils/validateColor')


router.put('/:userId/custom-settings', authenticateJWT, (req, res) => {
  const { userId } = req.params;
  const { chatSparkle, bgColorMsg, nameColor, profileBg, profileSparkle } = req.body;

  const userQuery = `SELECT is_premium, exp FROM users WHERE userId = ?`;

  db.query(userQuery, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching user data:', err);
      return res.status(500).send('Server error');
    }

    if (results.length === 0) {
      return res.status(404).send('User not found');
    }

    const user = results[0];

    if (!user.is_premium) {
      return res.status(403).send('Access denied: not a premium user');
    }

    if (!validateBgColorMsg(bgColorMsg)) {
      return res.status(400).send('Invalid bgColorMsg');
    }

    if (!validateNameColor(nameColor)) {
      return res.status(400).send('Invalid nameColor');
    }

    if (!validateProfileBg(profileBg)) {
      return res.status(400).send('Invalid profileBg');
    }



    if (nameColor === '#ccff00' && user.exp < 100) {
      return res.status(403).send('Access denied: not enough EXP');
    }

    if (nameColor === '#00FF9C' && user.exp < 1000) {
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(bgColorMsg === "linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(231,173,82,0.5) 100%)" && user.exp < 100){
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(bgColorMsg === "linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(187,74,148,0.5) 100%)" && user.exp < 300){
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(bgColorMsg === "linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(82,230,231,0.5) 100%)" && user.exp < 600){
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(bgColorMsg === "linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(28,69,246,0.5) 100%)" && user.exp < 2500){
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(profileBg === "radial-gradient(circle, rgba(26,113,157,1) 13%, rgba(47,186,207,1) 100%)" && user.exp < 300){
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(profileBg === "radial-gradient(circle, rgba(26,113,157,1) 13%, rgba(129,47,207,1) 100%)" && user.exp < 1000){
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(chatSparkle === true && user.exp < 2500){
      return res.status(403).send('Access denied: not enough EXP');
    }

    if(profileSparkle === true && user.exp < 2500){
      return res.status(403).send('Access denied: not enough EXP');
    }



    const updatedSettings = JSON.stringify({ chatSparkle, bgColorMsg, nameColor, profileBg, profileSparkle });

    const updateQuery = `UPDATE users SET custom_settings = ? WHERE userId = ?`;

    db.query(updateQuery, [updatedSettings, userId], (updateErr, result) => {
      if (updateErr) {
        console.error('Error updating custom_settings:', updateErr);
        return res.status(500).send('Server error');
      }

      res.status(200).send('Settings successfully updated');
    });
  });
});


module.exports = router;