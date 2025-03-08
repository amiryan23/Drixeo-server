const express = require('express');
const db = require('../config/db');
const { authenticateJWT } = require('../utils/utils');

const router = express.Router();

router.get('/user/:userId', authenticateJWT , (req, res) => {
  const { userId } = req.params;


  db.query(`
    SELECT 
      s.id, 
      s.name, 
      s.price, 
      CASE 
        WHEN us.sticker_id IS NOT NULL THEN true 
        ELSE false 
      END AS is_buyed
    FROM stickers s
    LEFT JOIN user_stickers us ON s.id = us.sticker_id AND us.user_id = ?
  `, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});


router.post('/buy/:userId/:stickerId', authenticateJWT , (req, res) => {
    const { userId, stickerId } = req.params;

    db.query(
        `SELECT points FROM users WHERE userId = ?`,
        [userId],
        (err, userResults) => {
            if (err) return res.status(500).json({ error: err });

            if (userResults.length === 0) {
                return res.status(404).json({ message: 'Пользователь не найден' });
            }

            const userPoints = userResults[0].points;

            db.query(
                `SELECT price FROM stickers WHERE id = ?`,
                [stickerId],
                (err, stickerResults) => {
                    if (err) return res.status(500).json({ error: err });

                    if (stickerResults.length === 0) {
                        return res.status(404).json({ message: 'Стикер не найден' });
                    }

                    const stickerPrice = stickerResults[0].price;

   
                    if (userPoints < stickerPrice) {
                        return res.status(400).json({ message: 'Недостаточно средств' });
                    }


                    db.query(
                        `SELECT * FROM user_stickers WHERE user_id = ? AND sticker_id = ?`,
                        [userId, stickerId],
                        (err, stickerCheckResults) => {
                            if (err) return res.status(500).json({ error: err });

                            if (stickerCheckResults.length > 0) {
                                return res.status(400).json({ message: 'Стикер уже куплен' });
                            }


                            db.query(
                                `UPDATE users SET points = points - ? WHERE userId = ?`,
                                [stickerPrice, userId],
                                (err) => {
                                    if (err) return res.status(500).json({ error: err });

                                    db.query(
                                        `INSERT INTO user_stickers (user_id, sticker_id) VALUES (?, ?)`,
                                        [userId, stickerId],
                                        (err) => {
                                            if (err) return res.status(500).json({ error: err });

                                            res.json({ message: 'Стикер успешно куплен', stickerId });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

module.exports = router;