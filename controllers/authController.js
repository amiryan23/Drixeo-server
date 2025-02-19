const db = require('../config/db');
const validateTelegramData = require('../utils/validateTelegramData')
const jwt = require('jsonwebtoken');
const {encryptData} = require('../utils/encryptData')



const authController = {
  authenticateUser: (req, res) => {
    const { userId, username, first_name, last_name, photo_url, initData } = req.body;

      const isValid = validateTelegramData(initData,process.env.BOT_TOKEN);
  if (!isValid) {
    return res.status(403).send('Unauthorized');
  }

    db.query('SELECT * FROM users WHERE userId = ?', [userId], (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      if (results.length > 0) {
        const existingUser = results[0];
        const updatedUser = {
          username: username || existingUser.username,
          first_name: first_name || existingUser.first_name,
          last_name: last_name || existingUser.last_name,
          photo_url: photo_url || existingUser.photo_url,
        };

        db.query(
          'UPDATE users SET username = ?, first_name = ?, last_name = ?, photo_url = ? WHERE userId = ?',
          [updatedUser.username, updatedUser.first_name, updatedUser.last_name, updatedUser.photo_url, userId],
          (err) => {
            if (err) return res.status(500).json({ error: 'Error updating user' });
            const token = jwt.sign({ userId: userId }, process.env.SECRET_KEY_JWT, { expiresIn: '3h' });

            const userData = {...existingUser,...updatedUser}

            const encryptUserData = encryptData(userData,process.env.SECRET_KEY_CODE)

            res.json({userData:encryptUserData , token });
          }
        );
      } else {
        const newUser = {
          userId,
          username: username || null,
          first_name: first_name || null,
          last_name: last_name || null,
          photo_url: photo_url || null,
          points: 0,
          gifts: '[]', 
          custom_settings: '{}'
        };

        db.query(
          'INSERT INTO users (userId, username, first_name, last_name, photo_url, points, gifts, custom_settings) VALUES (?, ?, ?, ?, ?, ? , ? , ?)',
          [newUser.userId, newUser.username, newUser.first_name, newUser.last_name, newUser.photo_url, newUser.points, newUser.gifts, newUser.custom_settings],
          (err) => {
            if (err) return res.status(500).json({ error: 'Error saving user' });
            const token = jwt.sign({ userId: newUser.userId }, process.env.SECRET_KEY_JWT, { expiresIn: '3h' });

            const newUserData = {...newUser}

            const encryptUserData = encryptData(newUserData,process.env.SECRET_KEY_CODE)

            res.json({userData:encryptUserData,token});
          }
        );
      }
    });
  },
};

module.exports = authController;