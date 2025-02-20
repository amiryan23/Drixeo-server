const express = require('express');
const db = require('../config/db');
const { authenticateJWT } = require('../utils/utils');

const router = express.Router();


router.post('/create-room', authenticateJWT, (req, res) => {
  const { limit, videoLink, is_public, description, userId } = req.body;

  if (!limit || !videoLink || !description || !userId) {
    return res.status(400).json({ error: 'Пожалуйста, укажите все необходимые данные' });
  }

  const sqlUserData = 'SELECT is_premium, lastRoomCreation FROM users WHERE userId = ?';
  db.query(sqlUserData, [userId], (err, results) => {
    if (err) {
      console.error('Ошибка при получении данных пользователя:', err);
      return res.status(500).json({ error: 'Ошибка при получении данных пользователя' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const { is_premium, lastRoomCreation } = results[0];

    const allowedLimits = is_premium ? [2, 4, 8] : [2, 4];
    const limitNum = Number(limit);
    if (!allowedLimits.includes(limitNum)) {
      return res.status(400).json({ error: 'Некорректное значение лимита' });
    }

    if (lastRoomCreation) {
  const lastCreatedAt = new Date(lastRoomCreation + 'Z');
  const nowUTC = new Date(); 

  const diffMinutes = (nowUTC.getTime() - lastCreatedAt.getTime()) / 1000 / 60;

      if (diffMinutes < 30) {
        return res.status(400).json({ remainingMinutes: Math.ceil(30 - diffMinutes) });
      }
    }

    const generateUniqueRoomId = (callback) => {
      const roomId = Math.floor(100000 + Math.random() * 900000);
      const sqlCheck = 'SELECT COUNT(*) AS count FROM rooms WHERE roomId = ?';

      db.query(sqlCheck, [roomId], (err, results) => {
        if (err) return callback(err);
        if (results[0].count === 0) return callback(null, roomId);
        generateUniqueRoomId(callback); 
      });
    };

    generateUniqueRoomId((err, roomId) => {
      if (err) {
        console.error('Ошибка при генерации roomId:', err);
        return res.status(500).json({ error: 'Ошибка при создании комнаты' });
      }

      const createdAtUTC = new Date().toISOString();

      const sqlInsert = `
        INSERT INTO rooms (owner, roomId, description, members, videoLink, blocked, chatRoom, \`limit\`, is_public , createdTime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      `;

      db.query(sqlInsert, [userId, roomId, description, '[]', videoLink, '[]', '[]', limit, is_public], (err) => {
        if (err) {
          console.error('Ошибка при создании комнаты:', err);
          return res.status(500).json({ error: 'Ошибка при создании комнаты' });
        }

        const sqlUpdateTime = 'UPDATE users SET lastRoomCreation = UTC_TIMESTAMP() WHERE userId = ?';
        db.query(sqlUpdateTime, [userId], (err) => {
          if (err) {
            console.error('Ошибка при обновлении времени последнего создания комнаты:', err);
            return res.status(500).json({ error: 'Ошибка при обновлении времени' });
          }

          res.status(201).json({ message: 'Комната успешно создана', yourRoomId: roomId });
        });
      });
    });
  });
});


router.get('/join/:roomId', authenticateJWT , (req, res) => {
  const { roomId } = req.params;
  // console.log('Полученный roomId:', roomId);

  const query = 'SELECT members, `limit`, blocked FROM rooms WHERE roomId = ? AND closed = false';
  db.query(query, [roomId], (err, results) => {
    if (err) {
      console.error('Ошибка запроса к базе данных:', err);
      return res.status(500).json({ error: 'Ошибка при получении данных о комнате' });
    }
    if (results.length > 0) {
      console.log('Комната найдена:', results[0]);
      return res.json(results[0]);
    } else {
      console.warn('Комната не найдена или закрыта');
      return res.status(404).json({ error: 'Комната не найдена или закрыта' });
    }
  });
});


router.get('/public-rooms', authenticateJWT , (req, res) => {
   const { userId } = req.query;

     if (!userId) {
    return res.status(400).json({ error: 'userId обязателен' });
  }
  
  const sql = `
    SELECT roomId, description, members, \`limit\` 
    FROM rooms
    WHERE is_public = true AND closed = false AND owner != ?
  `;

  db.query(sql, [userId], (error, results) => {
    if (error) {
      console.error('Ошибка при выполнении запроса:', error);
      return res.status(500).send('Ошибка сервера');
    }

    const response = results.map((room) => ({
      roomId: room.roomId,
      description: room.description,
      membersCount: JSON.parse(room.members || '[]').length, 
      limit: room.limit,
    }));

    res.json(response);
  });
});

router.get('/my-rooms', authenticateJWT , (req, res) => {
  const { userId } = req.query; 

  if (!userId) {
    return res.status(400).json({ error: 'userId обязателен' });
  }

  const sql = `
    SELECT roomId, description, members, \`limit\` 
    FROM rooms
    WHERE owner = ? AND closed = false
  `;

  db.query(sql, [userId], (error, results) => {
    if (error) {
      console.error('Ошибка при выполнении запроса:', error);
      return res.status(500).send('Ошибка сервера');
    }

    const response = results.map((room) => ({
      roomId: room.roomId,
      description: room.description,
      membersCount: JSON.parse(room.members || '[]').length,
      limit: room.limit,
    }));

    res.json(response);
  });
});


router.post('/update-room-visibility', authenticateJWT , (req, res) => {
  const { roomId, is_public } = req.body;

  if (!roomId || is_public === undefined) {
    return res.status(400).json({ success: false, error: 'Invalid data' });
  }

  const query = `
    UPDATE rooms
    SET is_public = ?
    WHERE roomId = ?
  `;

  db.query(query, [is_public, roomId], (err, result) => {
    if (err) {
      console.error('Error updating room visibility:', err);
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    res.status(200).json({ success: true });
  });
});


router.post('/close', authenticateJWT , (req, res) => {
  const { roomId, userId } = req.body; 

  if (!roomId || !userId) {
    return res.status(400).json({ success: false, message: 'roomId или userId не указан.' });
  }

  const query = 'SELECT owner FROM rooms WHERE roomId = ?';
  db.query(query, [roomId], (err, results) => {
    if (err) {
      console.error('Ошибка при получении информации о комнате:', err);
      return res.status(500).json({ success: false, message: 'Ошибка сервера.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Комната не найдена.' });
    }

    const room = results[0];

    if (room.owner !== userId) {
      return res.status(403).json({ success: false, message: 'Вы не являетесь владельцем комнаты.' });
    }

    const updateQuery = 'UPDATE rooms SET closed = TRUE WHERE roomId = ?';
    db.query(updateQuery, [roomId], (updateErr, result) => {
      if (updateErr) {
        console.error('Ошибка при закрытии комнаты:', updateErr);
        return res.status(500).json({ success: false, message: 'Ошибка сервера.' });
      }

      res.json({ success: true, message: 'Комната успешно закрыта.' });
    });
  });
});

module.exports = router;